// ============================================================================
//  Prueba end-to-end del servidor PRFC v3 sobre TCP de verdad.
//  Correr:  node test/verify-servidor-v3.mjs
//
//  Levanta el servidor con crearServidor() y habla con él por SOCKETS TCP
//  reales, así que se ejercita el camino completo: bytes → acumulador →
//  validaciones → motor → difusión. Es la prueba mínima de compatibilidad
//  de §35.
// ============================================================================

import net from 'node:net';

import {
  TIPOS, VERSION, ERRORES, RAZON_RECHAZO, ESTADO_PARTIDA, ESTADO_BANDERA,
  DIRECCIONES, enmarcar, codificar, AcumuladorTCP,
} from '../red/v3/protocolo-v3.js';
import { crearServidor } from '../red/v3/servidor-v3.js';

const PUERTO = 15503;

let ok = 0, fail = 0;
const check = (cond, msg) => {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ FALLA: ${msg}`); }
};
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// --- cliente de prueba ------------------------------------------------------
function conectar(puerto = PUERTO) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(puerto, '127.0.0.1');
    const recibidos = [];
    const acc = new AcumuladorTCP((m) => recibidos.push(m));
    sock.on('data', (d) => acc.alimentar(d));
    sock.on('error', reject);
    sock.on('connect', () => resolve({
      sock,
      recibidos,
      manda: (type, campos) => sock.write(enmarcar(type, campos)),
      // Escribe bytes crudos, para probar marcos que el códec no generaría.
      crudo: (bytes) => sock.write(bytes),
      espera: async (type, ms = 2000) => {
        const limite = Date.now() + ms;
        while (Date.now() < limite) {
          const m = recibidos.find((x) => x.type === type);
          if (m) return m;
          await dormir(10);
        }
        return null;
      },
      todos: (type) => recibidos.filter((x) => x.type === type),
      cierra: () => sock.destroy(),
    }));
  });
}

// --- arranque del servidor --------------------------------------------------
// Se levanta EN PROCESO con crearServidor(), pero hablando por sockets TCP de
// verdad: se ejercita el camino completo (bytes → acumulador → validaciones →
// motor → difusión), que es lo que pide la prueba de compatibilidad de §35.
//
// countdownSeconds 1 y tick 20 ms aceleran la prueba; udp:false evita pelear
// por el puerto de descubrimiento si hay otro servidor en la máquina.
const salida = [];
const servidor = crearServidor({
  puerto: PUERTO,
  host: '127.0.0.1',
  minJugadores: 2,
  udp: false,
  params: { countdownSeconds: 1, tickIntervalMs: 20 },
  log: (...a) => salida.push(a.join(' ') + '\n'),
});

const terminar = async (codigo) => {
  await servidor.cerrar();
  console.log(`\n${'='.repeat(52)}`);
  console.log(`Resultado: ${ok} OK, ${fail} FALLAS`);
  if (fail) console.log('\n--- registro del servidor ---\n' + salida.join(''));
  process.exit(codigo);
};

try {
  await servidor.escuchar();

  // ── 1. JOIN y lobby (§28.1, §29.1, §29.3) ─────────────────────────────────
  console.log('\n== 1. JOIN y lobby ==');
  const a = await conectar();
  a.manda(TIPOS.JOIN, { name: 'Ana' });
  const acepta = await a.espera(TIPOS.JOIN_ACCEPTED);
  check(!!acepta, 'llega JOIN_ACCEPTED');
  check(acepta?.playerId === 1, `el primer jugador es el id 1 (fue ${acepta?.playerId})`);
  check(typeof acepta?.gameId === 'number', 'trae gameId');

  const lobby = await a.espera(TIPOS.LOBBY_STATE);
  check(lobby?.players.length === 1, 'el LOBBY_STATE trae 1 jugador');
  check(lobby?.players[0].name === 'Ana', 'con su nombre');
  check(lobby?.state === ESTADO_PARTIDA.WAITING, 'y el estado es WAITING');

  // ── 2. Validaciones antes de empezar (§32) ────────────────────────────────
  console.log('\n== 2. Validaciones (§32) ==');
  a.manda(TIPOS.JOIN, { name: 'Otra vez' });
  let err = await a.espera(TIPOS.ERROR);
  check(err?.code === ERRORES.INVALID_MESSAGE, 'un segundo JOIN en la misma conexión se rechaza');

  a.recibidos.length = 0;
  a.manda(TIPOS.INPUT, { playerId: 1, direction: DIRECCIONES.UP });
  err = await a.espera(TIPOS.ERROR);
  check(err?.code === ERRORES.GAME_NOT_STARTED, 'INPUT antes de arrancar → GAME_NOT_STARTED');

  // Suplantar a otro jugador.
  a.recibidos.length = 0;
  a.manda(TIPOS.INPUT, { playerId: 99, direction: DIRECCIONES.UP });
  err = await a.espera(TIPOS.ERROR);
  check(err?.code === ERRORES.UNKNOWN_PLAYER, 'un playerId ajeno → UNKNOWN_PLAYER');

  // Versión equivocada: en JOIN debe ser JOIN_REJECTED, no ERROR (§29.2).
  const viejo = await conectar();
  const bytes = codificar(TIPOS.JOIN, { name: 'Antiguo' });
  bytes[1] = 0x02; // versión 2
  const marco = new Uint8Array(2 + bytes.length);
  new DataView(marco.buffer).setUint16(0, bytes.length, false);
  marco.set(bytes, 2);
  viejo.crudo(marco);
  const rechazo = await viejo.espera(TIPOS.JOIN_REJECTED);
  check(rechazo?.reason === RAZON_RECHAZO.UNSUPPORTED_PROTOCOL_VERSION,
    'versión incompatible en JOIN → JOIN_REJECTED (no ERROR genérico)');
  viejo.cierra();

  // INPUT sin haber hecho JOIN.
  const anon = await conectar();
  anon.manda(TIPOS.INPUT, { playerId: 1, direction: DIRECCIONES.UP });
  err = await anon.espera(TIPOS.ERROR);
  check(err?.code === ERRORES.UNKNOWN_PLAYER, 'INPUT sin JOIN → UNKNOWN_PLAYER');
  anon.cierra();

  // ── 3. Cuenta atrás y arranque (§20, §29.4, §29.5) ────────────────────────
  console.log('\n== 3. Cuenta atrás y arranque (§20) ==');
  const b = await conectar();
  b.manda(TIPOS.JOIN, { name: 'Beto' });
  await b.espera(TIPOS.JOIN_ACCEPTED);

  const cuenta = await b.espera(TIPOS.GAME_COUNTDOWN);
  check(!!cuenta, 'al llegar al mínimo empieza la cuenta atrás');
  check(cuenta?.secondsRemaining === 1, `arranca en countdownSeconds (fue ${cuenta?.secondsRemaining})`);

  const inicio = await b.espera(TIPOS.GAME_STARTED, 3000);
  check(!!inicio, 'llega GAME_STARTED');
  check(inicio?.players.length === 2, 'con los 2 jugadores');
  check(inicio?.mapSize === 2000 && inicio?.circleRadius === 500, 'con los parámetros de §21 sin escalar');
  check(inicio?.interactionRadius === 60, 'y el radio de interacción correcto');
  check(inicio?.flagStatus === ESTADO_BANDERA.AVAILABLE, 'la bandera arranca AVAILABLE');
  check(Math.abs(inicio.flagX) < 1e-6 && Math.abs(inicio.flagY) < 1e-6, 'y en el origen (§7)');

  // §9 los coloca a 580 EXACTOS, pero por el cable las coordenadas viajan
  // cuantizadas a 2 decimales (§24: entero ×100). Cada eje pierde hasta 0.005,
  // así que el radio reconstruido puede desviarse ~0.007. Comparar con 1e-6
  // aquí sería exigirle al protocolo una precisión que no tiene.
  const radios = inicio.players.map((p) => Math.hypot(p.x, p.y));
  check(radios.every((r) => Math.abs(r - 580) < 0.02),
    `todos aparecen a ~580 del origen (§9): ${radios.map((r) => r.toFixed(4)).join(', ')}`);
  check(radios.every((r) => r > 500),
    'y ninguno dentro del círculo central');
  // Deja constancia de cuánto es esa pérdida: es el límite de precisión que
  // cualquier equipo va a observar al comparar posiciones entre implementaciones.
  const desvio = Math.max(...radios.map((r) => Math.abs(r - 580)));
  check(desvio < 0.01, `la cuantización ×100 desvía menos de 0.01 (máx observado ${desvio.toFixed(5)})`);

  // Nadie entra a mitad de la cuenta.
  const tarde = await conectar();
  tarde.manda(TIPOS.JOIN, { name: 'Tarde' });
  const rechazoTarde = await tarde.espera(TIPOS.JOIN_REJECTED);
  check(rechazoTarde?.reason === RAZON_RECHAZO.GAME_ALREADY_STARTED, 'quien llega tarde recibe GAME_ALREADY_STARTED');
  tarde.cierra();

  // ── 4. GAME_STATE y movimiento (§29.6, §10) ───────────────────────────────
  console.log('\n== 4. GAME_STATE y movimiento ==');
  await dormir(200);
  const estados = b.todos(TIPOS.GAME_STATE);
  check(estados.length >= 3, `llegan GAME_STATE seguidos (${estados.length})`);
  const ticks = estados.map((e) => e.tick);
  check(ticks.every((t, i) => i === 0 || t > ticks[i - 1]), 'con el tick siempre creciendo');
  check(ticks[0] === 1, `el primer GAME_STATE es el tick 1 (fue ${ticks[0]})`);

  // Mover de verdad: dirección conocida y comprobar el desplazamiento.
  const yo = inicio.players.find((p) => p.playerId === 1);
  b.recibidos.length = 0;
  a.manda(TIPOS.INPUT, { playerId: 1, direction: DIRECCIONES.RIGHT });
  await dormir(200);
  const ultimo = b.todos(TIPOS.GAME_STATE).at(-1);
  const yoAhora = ultimo.players.find((p) => p.playerId === 1);
  check(yoAhora.x > yo.x, `el jugador se movió a la derecha (${yo.x.toFixed(1)} → ${yoAhora.x.toFixed(1)})`);
  check(Math.abs(yoAhora.y - yo.y) < 1e-6, 'y no cambió de y');

  // Dirección inválida.
  a.recibidos.length = 0;
  const malo = codificar(TIPOS.INPUT, { playerId: 1, direction: DIRECCIONES.UP });
  malo[4] = 0x09; // dirección fuera de las cinco válidas
  const marcoMalo = new Uint8Array(2 + malo.length);
  new DataView(marcoMalo.buffer).setUint16(0, malo.length, false);
  marcoMalo.set(malo, 2);
  a.crudo(marcoMalo);
  err = await a.espera(TIPOS.ERROR);
  check(err?.code === ERRORES.INVALID_INPUT, 'una dirección fuera de rango → INVALID_INPUT');

  // ── 5. Recoger la bandera y ganar (§13, §16, §29.11) ──────────────────────
  console.log('\n== 5. Recoger la bandera y ganar ==');
  // Se acerca al centro a base de INPUT reales hasta quedar en rango.
  const alCentro = async (cli, id) => {
    for (let i = 0; i < 300; i++) {
      const st = b.todos(TIPOS.GAME_STATE).at(-1);
      const p = st?.players.find((x) => x.playerId === id);
      if (!p) return null;
      if (Math.hypot(p.x, p.y) <= 50) return p;
      // Se mueve por el eje dominante: sin diagonales, es lo más directo.
      const dir = Math.abs(p.x) > Math.abs(p.y)
        ? (p.x > 0 ? DIRECCIONES.LEFT : DIRECCIONES.RIGHT)
        : (p.y > 0 ? DIRECCIONES.UP : DIRECCIONES.DOWN);
      cli.manda(TIPOS.INPUT, { playerId: id, direction: dir });
      await dormir(25);
    }
    return null;
  };

  const enCentro = await alCentro(a, 1);
  check(!!enCentro, `J1 llega al centro (${enCentro ? Math.hypot(enCentro.x, enCentro.y).toFixed(1) : '?'} del origen)`);

  a.manda(TIPOS.INPUT, { playerId: 1, direction: DIRECCIONES.NONE });
  a.manda(TIPOS.INTERACT, { playerId: 1 });
  const recogida = await b.espera(TIPOS.FLAG_PICKED_UP);
  check(!!recogida, 'llega FLAG_PICKED_UP');
  check(recogida?.playerId === 1, 'a nombre de J1');
  check(typeof recogida?.tick === 'number' && recogida.tick > 0, `con el tick del ciclo (${recogida?.tick})`);

  // Sale en línea recta hasta cruzar el círculo.
  b.recibidos.length = 0;
  a.manda(TIPOS.INPUT, { playerId: 1, direction: DIRECCIONES.RIGHT });
  const over = await b.espera(TIPOS.GAME_OVER, 5000);
  check(!!over, 'llega GAME_OVER al cruzar el círculo');
  check(over?.winnerId === 1, 'gana J1');
  check(over?.winnerName === 'Ana', `con su nombre ("${over?.winnerName}")`);

  // §29.11: el GAME_STATE del tick de la victoria va ANTES del GAME_OVER.
  const idxOver = b.recibidos.findIndex((m) => m.type === TIPOS.GAME_OVER);
  const antes = b.recibidos.slice(0, idxOver);
  const estadoFinal = antes.filter((m) => m.type === TIPOS.GAME_STATE).at(-1);
  check(!!estadoFinal, 'hay un GAME_STATE antes del GAME_OVER (§29.11)');
  check(estadoFinal?.flagStatus === ESTADO_BANDERA.OUTSIDE, 'y en él la bandera ya está OUTSIDE');
  const ganador = estadoFinal?.players.find((p) => p.playerId === 1);
  check(Math.hypot(ganador.x, ganador.y) - 15 > 500, 'el ganador cumple la desigualdad de §16');

  // ── 6. Después de terminar (§32) ──────────────────────────────────────────
  console.log('\n== 6. Tras el final ==');
  a.recibidos.length = 0;
  a.manda(TIPOS.INPUT, { playerId: 1, direction: DIRECCIONES.LEFT });
  err = await a.espera(TIPOS.ERROR);
  check(err?.code === ERRORES.GAME_FINISHED, 'INPUT tras el final → GAME_FINISHED (no GAME_NOT_STARTED)');

  a.cierra(); b.cierra();
  await dormir(150);
  await terminar(fail ? 1 : 0);
} catch (e) {
  console.error('\nExcepción en la prueba:', e);
  fail++;
  await terminar(1);
}
