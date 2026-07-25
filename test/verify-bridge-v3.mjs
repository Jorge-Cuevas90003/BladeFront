// ============================================================================
//  Prueba del bridge WebSocket ↔ TCP del PRFC v3.
//  Correr:  node test/verify-bridge-v3.mjs
//
//  Levanta servidor + bridge en proceso y juega una partida COMPLETA hablando
//  solo por WebSocket, como haría el navegador. Lo que se verifica de fondo es
//  que el protocolo llega intacto de punta a punta: el bridge no debe alterar
//  ni un byte.
// ============================================================================

import { WebSocket } from 'ws';
import {
  TIPOS, ERRORES, ESTADO_BANDERA, DIRECCIONES,
  enmarcar, AcumuladorTCP, aHex, codificar,
} from '../red/v3/protocolo-v3.js';
import { crearServidor } from '../red/v3/servidor-v3.js';
import { crearBridge } from '../red/v3/bridge-v3.js';

const PUERTO_TCP = 15801;
const PUERTO_WS = 15802;
const PUERTO_UDP = 15803;

let ok = 0, fail = 0;
const check = (cond, msg) => {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ FALLA: ${msg}`); }
};
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// --- cliente "navegador": WebSocket + acumulador, igual que hará el visor ----
function clienteWeb(puerto = PUERTO_WS, query = '') {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${puerto}/${query}`);
    ws.binaryType = 'arraybuffer';
    const recibidos = [];
    const crudos = [];
    const acc = new AcumuladorTCP((m) => recibidos.push(m));

    ws.on('message', (datos) => {
      const bytes = new Uint8Array(datos);
      crudos.push(bytes);
      acc.alimentar(bytes);
    });
    ws.on('error', reject);
    ws.on('close', (codigo) => { cliente.cerradoCon = codigo; });

    const cliente = {
      ws, recibidos, crudos, cerradoCon: null,
      manda: (type, campos) => ws.send(enmarcar(type, campos)),
      crudo: (bytes) => ws.send(bytes),
      espera: async (type, ms = 3000) => {
        const limite = Date.now() + ms;
        while (Date.now() < limite) {
          const m = recibidos.find((x) => x.type === type);
          if (m) return m;
          await dormir(10);
        }
        return null;
      },
      todos: (type) => recibidos.filter((x) => x.type === type),
      cierra: () => ws.close(),
    };
    ws.on('open', () => resolve(cliente));
  });
}

const servidor = crearServidor({
  puerto: PUERTO_TCP,
  host: '127.0.0.1',
  minJugadores: 2,
  udp: true,
  puertoUdp: PUERTO_UDP,
  nombre: 'Arena de prueba',
  params: { countdownSeconds: 1, tickIntervalMs: 20 },
  log: () => {},
});

const bridge = crearBridge({
  puertoWs: PUERTO_WS,
  tcpHost: '127.0.0.1',
  tcpPort: PUERTO_TCP,
  puertoUdp: PUERTO_UDP,
  log: () => {},
});

const terminar = async (codigo) => {
  await bridge.cerrar();
  await servidor.cerrar();
  console.log(`\n${'='.repeat(52)}`);
  console.log(`Resultado: ${ok} OK, ${fail} FALLAS`);
  process.exit(codigo);
};

try {
  await servidor.escuchar();
  await bridge.escuchar();

  // ── 1. Handshake a través del bridge ──────────────────────────────────────
  console.log('\n== 1. JOIN a través del WebSocket ==');
  const a = await clienteWeb();
  a.manda(TIPOS.JOIN, { name: 'Ana' });
  const acepta = await a.espera(TIPOS.JOIN_ACCEPTED);
  check(!!acepta, 'el JOIN llega al servidor y vuelve el JOIN_ACCEPTED');
  check(acepta?.playerId === 1, 'con el playerId asignado');

  const lobby = await a.espera(TIPOS.LOBBY_STATE);
  check(lobby?.players[0]?.name === 'Ana', 'y el LOBBY_STATE con el nombre intacto');

  // ── 2. El bridge no altera los bytes ──────────────────────────────────────
  console.log('\n== 2. Transparencia de bytes ==');
  {
    // Se reconstruye el flujo tal cual llegó y se compara con lo que el códec
    // habría producido para esos mismos mensajes.
    const total = a.crudos.reduce((n, c) => n + c.length, 0);
    check(total > 0, `llegaron bytes crudos por el WebSocket (${total})`);

    // El primer mensaje recibido fue JOIN_ACCEPTED: su codificación debe
    // aparecer literalmente al inicio del flujo.
    const esperado = enmarcar(TIPOS.JOIN_ACCEPTED, { playerId: 1, gameId: servidor.juego.gameId });
    const flujo = new Uint8Array(total);
    let off = 0;
    for (const c of a.crudos) { flujo.set(c, off); off += c.length; }
    const inicio = flujo.subarray(0, esperado.length);
    check(aHex(inicio) === aHex(esperado),
      `el JOIN_ACCEPTED llega byte a byte idéntico ("${aHex(inicio)}")`);
  }

  // ── 3. Partida completa por WebSocket ─────────────────────────────────────
  console.log('\n== 3. Partida completa a través del bridge ==');
  const b = await clienteWeb();
  b.manda(TIPOS.JOIN, { name: 'Beto' });
  await b.espera(TIPOS.JOIN_ACCEPTED);

  const cuenta = await a.espera(TIPOS.GAME_COUNTDOWN);
  check(!!cuenta, 'llega la cuenta atrás');

  const inicio = await a.espera(TIPOS.GAME_STARTED, 4000);
  check(!!inicio, 'llega GAME_STARTED');
  check(inicio?.players.length === 2, 'con los 2 jugadores');

  await dormir(150);
  check(a.todos(TIPOS.GAME_STATE).length >= 3, `llegan GAME_STATE seguidos (${a.todos(TIPOS.GAME_STATE).length})`);

  // Ir al centro mandando INPUT reales.
  for (let i = 0; i < 300; i++) {
    const st = a.todos(TIPOS.GAME_STATE).at(-1);
    const p = st?.players.find((x) => x.playerId === 1);
    if (!p || Math.hypot(p.x, p.y) <= 50) break;
    const dir = Math.abs(p.x) > Math.abs(p.y)
      ? (p.x > 0 ? DIRECCIONES.LEFT : DIRECCIONES.RIGHT)
      : (p.y > 0 ? DIRECCIONES.UP : DIRECCIONES.DOWN);
    a.manda(TIPOS.INPUT, { playerId: 1, direction: dir });
    await dormir(25);
  }
  const enCentro = a.todos(TIPOS.GAME_STATE).at(-1)?.players.find((x) => x.playerId === 1);
  check(Math.hypot(enCentro.x, enCentro.y) <= 50, `J1 llega al centro (${Math.hypot(enCentro.x, enCentro.y).toFixed(1)})`);

  a.manda(TIPOS.INPUT, { playerId: 1, direction: DIRECCIONES.NONE });
  a.manda(TIPOS.INTERACT, { playerId: 1 });
  const recogida = await a.espera(TIPOS.FLAG_PICKED_UP);
  check(!!recogida, 'el INTERACT viaja y llega FLAG_PICKED_UP');

  // El otro cliente ve el mismo evento: la difusión funciona por el bridge.
  check(!!(await b.espera(TIPOS.FLAG_PICKED_UP)), 'el segundo cliente también lo recibe');

  a.recibidos.length = 0;
  a.manda(TIPOS.INPUT, { playerId: 1, direction: DIRECCIONES.RIGHT });
  const over = await a.espera(TIPOS.GAME_OVER, 6000);
  check(!!over, 'llega GAME_OVER al cruzar el círculo');
  check(over?.winnerName === 'Ana', `con el nombre del ganador ("${over?.winnerName}")`);

  const idx = a.recibidos.findIndex((m) => m.type === TIPOS.GAME_OVER);
  const estadoFinal = a.recibidos.slice(0, idx).filter((m) => m.type === TIPOS.GAME_STATE).at(-1);
  check(estadoFinal?.flagStatus === ESTADO_BANDERA.OUTSIDE,
    'y el orden de §29.11 se conserva: GAME_STATE con la bandera OUTSIDE antes del GAME_OVER');

  a.cierra(); b.cierra();
  await dormir(100);

  // ── 4. Descubrimiento delegado por HTTP ───────────────────────────────────
  console.log('\n== 4. Descubrimiento delegado (el navegador no puede UDP) ==');
  {
    const r = await fetch(`http://127.0.0.1:${PUERTO_WS}/servidores?direccion=127.0.0.1&puerto=${PUERTO_UDP}&espera=700`);
    check(r.ok, 'responde /servidores');
    check(r.headers.get('access-control-allow-origin') === '*', 'con CORS, para que la página en otro puerto pueda leerlo');
    const { servidores } = await r.json();
    check(servidores?.length === 1, `encuentra el servidor de juego (${servidores?.length})`);
    check(servidores?.[0]?.serverName === 'Arena de prueba', `con su nombre ("${servidores?.[0]?.serverName}")`);
    check(servidores?.[0]?.tcpPort === PUERTO_TCP, 'y el puerto TCP al que conectarse');

    const salud = await (await fetch(`http://127.0.0.1:${PUERTO_WS}/salud`)).json();
    check(salud?.ok === true, '/salud responde');
  }

  // ── 5. Destino elegible por query ─────────────────────────────────────────
  console.log('\n== 5. Elegir servidor destino desde la URL ==');
  {
    // Un segundo servidor en otro puerto: el mismo bridge debe poder alcanzarlo.
    const otro = crearServidor({
      puerto: PUERTO_TCP + 10, host: '127.0.0.1', minJugadores: 99, udp: false,
      params: { countdownSeconds: 1, tickIntervalMs: 20 }, log: () => {},
    });
    await otro.escuchar();

    const c = await clienteWeb(PUERTO_WS, `?host=127.0.0.1&port=${PUERTO_TCP + 10}`);
    c.manda(TIPOS.JOIN, { name: 'Carla' });
    const ac = await c.espera(TIPOS.JOIN_ACCEPTED);
    check(!!ac, 'el bridge conecta al servidor indicado en la query');
    check(otro.juego.jugadoresActivos().length === 1, 'y el jugador aparece en ESE servidor, no en el otro');
    c.cierra();
    await dormir(100);
    await otro.cerrar();
  }

  // ── 6. Servidor inalcanzable ──────────────────────────────────────────────
  console.log('\n== 6. Servidor caído ==');
  {
    const c = await clienteWeb(PUERTO_WS, '?host=127.0.0.1&port=15899'); // nadie escucha
    await dormir(1200);
    check(c.cerradoCon === 4001,
      `el bridge cierra con un código propio para distinguirlo de su propia caída (fue ${c.cerradoCon})`);
  }

  await terminar(fail ? 1 : 0);
} catch (e) {
  console.error('\nExcepción en la prueba:', e);
  fail++;
  await terminar(1);
}
