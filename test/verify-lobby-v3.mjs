// ============================================================================
//  Pruebas de la sala de espera: el anfitrión decide cuándo empieza.
//  Correr:  node test/verify-lobby-v3.mjs
//
//  El problema que resuelven: §20 dice que el servidor pasa a STARTING y manda
//  la cuenta atrás, pero no define QUÉ lo dispara. Arrancando con el primer
//  jugador, el anfitrión se quedaba jugando solo — desde STARTING el servidor
//  rechaza a todos con GAME_ALREADY_STARTED y nadie más llegaba a entrar.
// ============================================================================

import net from 'node:net';
import {
  TIPOS, ERRORES, RAZON_RECHAZO, ESTADO_PARTIDA,
  enmarcar, AcumuladorTCP,
} from '../red/v3/protocolo-v3.js';
import { crearServidor } from '../red/v3/servidor-v3.js';

const PUERTO = 15901;
let ok = 0, fail = 0;
const check = (cond, msg) => {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ FALLA: ${msg}`); }
};
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function cliente(puerto = PUERTO) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(puerto, '127.0.0.1');
    const recibidos = [];
    const acc = new AcumuladorTCP((m) => recibidos.push(m));
    sock.on('data', (d) => acc.alimentar(d));
    sock.on('error', reject);
    sock.on('connect', () => resolve({
      sock, recibidos,
      manda: (t, c) => sock.write(enmarcar(t, c)),
      espera: async (t, ms = 2500) => {
        const lim = Date.now() + ms;
        while (Date.now() < lim) {
          const m = recibidos.find((x) => x.type === t);
          if (m) return m;
          await dormir(10);
        }
        return null;
      },
      ultimo: (t) => recibidos.filter((x) => x.type === t).at(-1),
      cierra: () => sock.destroy(),
    }));
  });
}

const salida = [];
const servidor = crearServidor({
  puerto: PUERTO, host: '127.0.0.1', udp: false,
  params: { countdownSeconds: 1, tickIntervalMs: 20 },
  log: (...a) => salida.push(a.join(' ')),
});

const terminar = async (codigo) => {
  await servidor.cerrar();
  console.log(`\n${'='.repeat(52)}`);
  console.log(`Resultado: ${ok} OK, ${fail} FALLAS`);
  if (fail) console.log('\n--- registro ---\n' + salida.join('\n'));
  process.exit(codigo);
};

try {
  await servidor.escuchar();

  // ── 1. La partida NO arranca sola ─────────────────────────────────────────
  console.log('\n== 1. Entrar no empieza la partida ==');
  const anfitrion = await cliente();
  anfitrion.manda(TIPOS.JOIN, { name: 'Anfitrion' });
  const acepta = await anfitrion.espera(TIPOS.JOIN_ACCEPTED);
  check(acepta?.playerId === 1, 'el anfitrión entra como #1');

  await dormir(1600); // más que la cuenta atrás entera
  check(!anfitrion.recibidos.some((m) => m.type === TIPOS.GAME_COUNTDOWN),
    'no hay cuenta atrás: la partida espera');
  check(!anfitrion.recibidos.some((m) => m.type === TIPOS.GAME_STARTED),
    'y no ha empezado sola');
  check(servidor.juego.estado === ESTADO_PARTIDA.WAITING, 'el servidor sigue en WAITING');

  // ── 2. Los demás SÍ pueden entrar ─────────────────────────────────────────
  // Este es el fallo original: aquí llegaba GAME_ALREADY_STARTED.
  console.log('\n== 2. Los compañeros pueden unirse ==');
  const b = await cliente();
  b.manda(TIPOS.JOIN, { name: 'Companero' });
  const aceptaB = await b.espera(TIPOS.JOIN_ACCEPTED);
  check(!!aceptaB, 'un segundo jugador entra sin problema');
  check(!b.recibidos.some((m) => m.type === TIPOS.JOIN_REJECTED), 'sin GAME_ALREADY_STARTED');

  const c = await cliente();
  c.manda(TIPOS.JOIN, { name: 'Tercero' });
  check(!!(await c.espera(TIPOS.JOIN_ACCEPTED)), 'y un tercero también');

  const lobby = anfitrion.ultimo(TIPOS.LOBBY_STATE);
  check(lobby?.players.length === 3, `la sala los lista a los 3 (${lobby?.players.length})`);

  // Todos los clientes arrancan con el nombre "Templario". El nombre no puede
  // utilizarse para identificar una conexión: un invitado con el mismo nombre
  // no debe marcar como desconectado al anfitrión.
  console.log('\n== 2a. Nombres repetidos no expulsan al anfitrión ==');
  const repetido = await cliente();
  repetido.manda(TIPOS.JOIN, { name: 'Anfitrion' });
  check(!!(await repetido.espera(TIPOS.JOIN_ACCEPTED)), 'otro jugador puede usar el mismo nombre');
  const lobbyRepetido = anfitrion.ultimo(TIPOS.LOBBY_STATE);
  check(lobbyRepetido?.players.length === 4,
    `los dos nombres repetidos siguen conectados (${lobbyRepetido?.players.length})`);
  repetido.cierra();
  await dormir(50);

  // ── 2b. Quién manda lo dice el SERVIDOR ───────────────────────────────────
  // Que el cliente lo dedujera del id más bajo era el error: el anfitrión es
  // quien aloja la partida en su máquina, y puede haber entrado después que un
  // compañero. Aquí todos vienen por loopback, así que manda el primero, pero
  // lo que se comprueba es que la respuesta venga del servidor.
  console.log('\n== 2b. El servidor dice quién manda ==');
  {
    anfitrion.recibidos.length = 0;
    anfitrion.manda(TIPOS.HOST_QUERY, { playerId: 1 });
    const info = await anfitrion.espera(TIPOS.HOST_INFO);
    check(info?.hostId === 1, `el anfitrión es el #1 (${info?.hostId})`);
    check(info?.puedesEmpezar === true, 'y a él sí le toca empezar');

    b.recibidos.length = 0;
    b.manda(TIPOS.HOST_QUERY, { playerId: aceptaB.playerId });
    const infoB = await b.espera(TIPOS.HOST_INFO);
    check(infoB?.hostId === 1, 'a los demás se les dice el mismo anfitrión');
    check(infoB?.puedesEmpezar === false, 'pero a ellos no les toca');
  }

  // ── 3. Solo el anfitrión puede empezar ────────────────────────────────────
  console.log('\n== 3. Solo el anfitrión empieza ==');
  b.recibidos.length = 0;
  b.manda(TIPOS.HOST_START, { playerId: aceptaB.playerId });
  const err = await b.espera(TIPOS.ERROR);
  check(err?.code === ERRORES.UNKNOWN_PLAYER, 'a otro jugador se le rechaza la petición');
  check(servidor.juego.estado === ESTADO_PARTIDA.WAITING, 'y la partida sigue esperando');

  // ── 4. El anfitrión empieza cuando quiere ─────────────────────────────────
  console.log('\n== 4. El anfitrión da la salida ==');
  anfitrion.recibidos.length = 0;
  anfitrion.manda(TIPOS.HOST_START, { playerId: 1 });
  const cuenta = await anfitrion.espera(TIPOS.GAME_COUNTDOWN);
  check(!!cuenta, 'ahora sí arranca la cuenta atrás');

  const inicio = await anfitrion.espera(TIPOS.GAME_STARTED, 3000);
  check(!!inicio, 'y la partida empieza');
  check(inicio?.players.length === 3, `con los 3 jugadores dentro (${inicio?.players.length})`);
  check(!!(await b.espera(TIPOS.GAME_STARTED, 500)), 'el compañero también la recibe');

  // ── 5. Quien llega tarde sí se rechaza ────────────────────────────────────
  console.log('\n== 5. Tarde es tarde ==');
  const tarde = await cliente();
  tarde.manda(TIPOS.JOIN, { name: 'Tarde' });
  const rech = await tarde.espera(TIPOS.JOIN_REJECTED);
  check(rech?.reason === RAZON_RECHAZO.GAME_ALREADY_STARTED,
    'con la partida en marcha, un JOIN nuevo se rechaza (§20)');
  tarde.cierra();

  // ── 6. Pedir empezar dos veces no rompe nada ──────────────────────────────
  console.log('\n== 6. Segunda petición de inicio ==');
  anfitrion.recibidos.length = 0;
  anfitrion.manda(TIPOS.HOST_START, { playerId: 1 });
  const err2 = await anfitrion.espera(TIPOS.ERROR);
  check(err2?.code === ERRORES.GAME_ALREADY_STARTED, 'se responde que ya está en marcha, sin reiniciarla');
  check(servidor.juego.estado === ESTADO_PARTIDA.RUNNING, 'y la partida sigue corriendo');

  // ── 7. El papel de anfitrión NO se hereda ─────────────────────────────────
  // La partida vive en la máquina del anfitrión. Que salga un momento no puede
  // convertir a un invitado en dueño de una partida que no es suya.
  console.log('\n== 7. Si se va el anfitrión, nadie hereda ==');
  {
    anfitrion.cierra();
    await dormir(400);

    b.recibidos.length = 0;
    b.manda(TIPOS.HOST_QUERY, { playerId: aceptaB.playerId });
    const info = await b.espera(TIPOS.HOST_INFO);
    check(info?.hostId === 0, `sin anfitrión conectado no hay quien mande (${info?.hostId})`);
    check(info?.puedesEmpezar === false, 'y el que quedó no puede empezar la partida');

    b.recibidos.length = 0;
    b.manda(TIPOS.HOST_START, { playerId: aceptaB.playerId });
    const err = await b.espera(TIPOS.ERROR);
    check(err?.code === ERRORES.UNKNOWN_PLAYER, 'si lo intenta, se le rechaza');
  }

  b.cierra(); c.cierra();
  await dormir(150);
  await terminar(fail ? 1 : 0);
} catch (e) {
  console.error('\nExcepción en la prueba:', e);
  fail++;
  await terminar(1);
}
