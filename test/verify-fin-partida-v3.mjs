// ============================================================================
//  Pruebas del FINAL de partida: cuando se acaba, tiene que acabarse.
//  Correr:  node test/verify-fin-partida-v3.mjs
//
//  El problema que resuelven: al terminar una partida el servidor cerraba los
//  sockets pero los jugadores seguían dentro del motor marcados como
//  conectados. La sala siguiente salía llena de fantasmas — gente que ya no
//  estaba pero que contaba para el aforo, aparecía en la lista y bloqueaba el
//  hueco. Con unas cuantas partidas seguidas se llegaba a GAME_FULL sin nadie
//  jugando.
//
//  La causa era de orden: el servidor vaciaba su mapa de conexiones ANTES de
//  que Node emitiera los 'close' de los sockets que acababa de cerrar. Cuando
//  el 'close' llegaba, el manejador ya no encontraba la conexión y se salía sin
//  dar de baja a nadie.
// ============================================================================

import net from 'node:net';
import {
  TIPOS, ESTADO_PARTIDA, ESTADO_BANDERA, RAZON_RECHAZO,
  enmarcar, AcumuladorTCP,
} from '../red/v3/protocolo-v3.js';
import { crearServidor } from '../red/v3/servidor-v3.js';

const PUERTO = 15903;
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
    const estado = { cerrado: false };
    const acc = new AcumuladorTCP((m) => recibidos.push(m));
    sock.on('data', (d) => acc.alimentar(d));
    sock.on('error', () => {});
    sock.on('close', () => { estado.cerrado = true; });
    sock.once('error', reject);
    sock.on('connect', () => resolve({
      sock, recibidos, estado,
      manda: (t, c) => { try { sock.write(enmarcar(t, c)); } catch {} },
      espera: async (t, ms = 3000) => {
        const lim = Date.now() + ms;
        while (Date.now() < lim) {
          const m = recibidos.find((x) => x.type === t);
          if (m) return m;
          await dormir(10);
        }
        return null;
      },
      cierra: () => sock.destroy(),
    }));
  });
}

const salida = [];
// El margen de cortesía tras el GAME_OVER se acorta para no tener que esperar
// los 4 s de producción en cada prueba.
const servidor = crearServidor({
  puerto: PUERTO, host: '127.0.0.1', udp: false,
  params: { countdownSeconds: 1, tickIntervalMs: 20 },
  msTrasFinal: 200,
  log: (...a) => salida.push(a.join(' ')),
});

const terminar = async (codigo) => {
  await servidor.cerrar();
  console.log(`\n${'='.repeat(52)}`);
  console.log(`Resultado: ${ok} OK, ${fail} FALLAS`);
  if (fail) console.log('\n--- registro ---\n' + salida.join('\n'));
  process.exit(codigo);
};

// Lleva la partida a su final: el anfitrión coge la bandera del centro y sale
// del círculo. Se hace tocando el motor directamente porque lo que se prueba
// es la limpieza posterior, no la simulación (eso ya lo cubre verify-motor-v3).
function forzarVictoria(playerId) {
  const j = servidor.juego.jugadores.get(playerId);
  j.hasFlag = true;
  servidor.juego.bandera.carrierId = playerId;
  const r = servidor.juego.p.circleRadius + servidor.juego.p.playerRadius + 50;
  j.x = r; j.y = 0;
}

try {
  await servidor.escuchar();

  // ── 1. Una partida entera ─────────────────────────────────────────────────
  console.log('\n== 1. Se juega una partida hasta el final ==');
  // Los JOIN van de uno en uno esperando respuesta. Mandados a la vez, el
  // orden en que llegan no está garantizado y el anfitrión —que es el primero
  // que entra desde esta máquina— podía tocarle a otro.
  const a = await cliente(), b = await cliente(), c = await cliente();
  a.manda(TIPOS.JOIN, { name: 'Anfitrion' });
  const ac = await a.espera(TIPOS.JOIN_ACCEPTED);
  b.manda(TIPOS.JOIN, { name: 'Companero' });
  await b.espera(TIPOS.JOIN_ACCEPTED);
  c.manda(TIPOS.JOIN, { name: 'Tercero' });
  await c.espera(TIPOS.JOIN_ACCEPTED);
  check(!!ac, 'entran tres jugadores');

  a.manda(TIPOS.HOST_START, { playerId: ac.playerId });
  check(!!(await a.espera(TIPOS.GAME_STARTED, 4000)), 'la partida arranca');

  forzarVictoria(ac.playerId);
  const over = await a.espera(TIPOS.GAME_OVER, 3000);
  check(over?.winnerId === ac.playerId, `hay GAME_OVER y gana quien salió (#${over?.winnerId})`);
  check(!!(await b.espera(TIPOS.GAME_OVER, 1000)), 'los demás también reciben el GAME_OVER');

  // ── 2. Y se acaba de verdad ───────────────────────────────────────────────
  // Este es el bloque que fallaba entero.
  console.log('\n== 2. Al acabar, se acaba ==');
  await dormir(900);   // margen de cortesía + los 'close' de Node

  check(a.estado.cerrado && b.estado.cerrado && c.estado.cerrado,
    'el servidor cierra las tres conexiones');
  check(servidor.juego.estado === ESTADO_PARTIDA.WAITING,
    `la sala vuelve a esperar (${servidor.juego.estado})`);
  check(servidor.juego.jugadoresActivos().length === 0,
    `no queda ningún jugador conectado (${servidor.juego.jugadoresActivos().length})`);
  check(servidor.juego.jugadores.size === 0,
    `y el motor no guarda fantasmas (${servidor.juego.jugadores.size} en el censo)`);
  check(servidor.juego.ganadorId === 0, 'se olvida el ganador anterior');
  check(servidor.juego.bandera.carrierId === 0, 'y la bandera vuelve a estar libre');
  check(servidor.juego.serializarLobby().players.length === 0,
    'la sala que se anuncia está vacía');

  // ── 3. La siguiente partida empieza limpia ────────────────────────────────
  console.log('\n== 3. La siguiente partida empieza de cero ==');
  const d = await cliente();
  d.manda(TIPOS.JOIN, { name: 'Nuevo' });
  const dc = await d.espera(TIPOS.JOIN_ACCEPTED);
  check(!!dc, 'un jugador nuevo puede entrar');
  const lobby = servidor.juego.serializarLobby();
  check(lobby.players.length === 1,
    `y está solo en la sala, sin los de la partida anterior (${lobby.players.length})`);

  d.manda(TIPOS.HOST_START, { playerId: dc.playerId });
  check(!!(await d.espera(TIPOS.GAME_STARTED, 4000)), 'puede empezar la partida siguiente');

  forzarVictoria(dc.playerId);
  check(!!(await d.espera(TIPOS.GAME_OVER, 3000)), 'y también termina');
  await dormir(900);
  check(servidor.juego.jugadores.size === 0, 'la limpieza vuelve a dejarlo vacío');

  // ── 4. Muchas seguidas no llenan el aforo ─────────────────────────────────
  // El síntoma con el que se descubrió: tras varias partidas el servidor
  // rechazaba con GAME_FULL sin que hubiera nadie dentro.
  console.log('\n== 4. Diez partidas seguidas no llenan el aforo ==');
  let rechazos = 0;
  for (let i = 0; i < 10; i++) {
    const p = await cliente();
    p.manda(TIPOS.JOIN, { name: `Ronda${i}` });
    const acc2 = await p.espera(TIPOS.JOIN_ACCEPTED, 1500);
    if (!acc2) { rechazos++; p.cierra(); continue; }
    p.manda(TIPOS.HOST_START, { playerId: acc2.playerId });
    await p.espera(TIPOS.GAME_STARTED, 4000);
    forzarVictoria(acc2.playerId);
    await p.espera(TIPOS.GAME_OVER, 3000);
    await dormir(500);
  }
  check(rechazos === 0, `ninguna ronda se rechazó (${rechazos} rechazos)`);
  check(servidor.juego.jugadores.size === 0,
    `y el censo sigue vacío tras diez rondas (${servidor.juego.jugadores.size})`);

  // ── 5. Quien llega tarde a una partida terminada ──────────────────────────
  // Entre el GAME_OVER y la limpieza hay un margen de cortesía para que a
  // todos les dé tiempo a ver quién ganó. Durante ese rato la partida está
  // FINISHED, y un JOIN nuevo tiene que rebotar con motivo claro.
  console.log('\n== 5. Durante el margen de cortesía ==');
  {
    const p = await cliente();
    p.manda(TIPOS.JOIN, { name: 'Anfitrion' });
    const pc = await p.espera(TIPOS.JOIN_ACCEPTED);
    p.manda(TIPOS.HOST_START, { playerId: pc.playerId });
    await p.espera(TIPOS.GAME_STARTED, 4000);
    forzarVictoria(pc.playerId);
    await p.espera(TIPOS.GAME_OVER, 3000);

    const tarde = await cliente();
    tarde.manda(TIPOS.JOIN, { name: 'Tarde' });
    const rech = await tarde.espera(TIPOS.JOIN_REJECTED, 400);
    check(rech?.reason === RAZON_RECHAZO.GAME_ALREADY_STARTED,
      'a quien llega en ese hueco se le rechaza, no se le cuela en la sala');
    await dormir(900);
    check(servidor.juego.jugadores.size === 0,
      `y el rechazado tampoco deja rastro (${servidor.juego.jugadores.size})`);
    tarde.cierra();
  }

  // ── 6. Irse EN MEDIO de la partida ────────────────────────────────────────
  // Este era el fallo grave. El servidor encolaba la baja y acto seguido ponía
  // `connected = false` a mano; el paso 8 del ciclo se salta a los que ya están
  // desconectados, así que la baja no se procesaba nunca: ni se avisaba a los
  // demás, ni el que se iba soltaba la bandera. Con la bandera pegada a alguien
  // que ya no está, nadie puede cogerla y la partida no termina jamás.
  console.log('\n== 6. Quien se va con la bandera la suelta ==');
  {
    const anf = await cliente();
    anf.manda(TIPOS.JOIN, { name: 'Anfitrion' });
    const anfC = await anf.espera(TIPOS.JOIN_ACCEPTED);
    const fuga = await cliente();
    fuga.manda(TIPOS.JOIN, { name: 'Fugado' });
    const fugaC = await fuga.espera(TIPOS.JOIN_ACCEPTED);

    anf.manda(TIPOS.HOST_START, { playerId: anfC.playerId });
    await anf.espera(TIPOS.GAME_STARTED, 4000);

    // El que se va lleva la bandera en la mano.
    const j = servidor.juego.jugadores.get(fugaC.playerId);
    j.hasFlag = true;
    servidor.juego.bandera = { x: j.x, y: j.y, status: ESTADO_BANDERA.CARRIED, carrierId: fugaC.playerId };

    anf.recibidos.length = 0;
    fuga.cierra();

    const aviso = await anf.espera(TIPOS.PLAYER_DISCONNECTED, 2000);
    check(aviso?.playerId === fugaC.playerId,
      `a los demás se les avisa de que se fue (#${aviso?.playerId})`);
    check(servidor.juego.bandera.carrierId === 0,
      `la bandera queda sin portador (${servidor.juego.bandera.carrierId})`);
    check(servidor.juego.bandera.status === ESTADO_BANDERA.DROPPED,
      `y tirada en el suelo, recogible (estado ${servidor.juego.bandera.status})`);
    check(!servidor.juego.jugadores.get(fugaC.playerId)?.connected,
      'el fugado ya no cuenta como conectado');

    // La partida sigue viva: quien queda puede ganarla.
    forzarVictoria(anfC.playerId);
    check(!!(await anf.espera(TIPOS.GAME_OVER, 3000)),
      'y la partida puede terminar con el que queda');
    await dormir(900);
    check(servidor.juego.jugadores.size === 0, 'la limpieza final vuelve a dejarla vacía');
  }

  await terminar(fail ? 1 : 0);
} catch (e) {
  console.error('\nExcepción en la prueba:', e);
  fail++;
  await terminar(1);
}
