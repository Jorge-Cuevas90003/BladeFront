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

    check(servidores?.[0]?.via === 'broadcast', `y la vía por la que se encontró ("${servidores?.[0]?.via}")`);

    const salud = await (await fetch(`http://127.0.0.1:${PUERTO_WS}/salud`)).json();
    check(salud?.ok === true, '/salud responde');
  }

  // ── 4b. Sondeo dirigido delegado (el caso Radmin VPN) ─────────────────────
  // Sobre Radmin el broadcast suele no atravesar el adaptador virtual, así que
  // la ruta tiene que poder preguntar a IPs concretas.
  console.log('\n== 4b. /servidores con sondeo dirigido ==');
  {
    const pide = async (query) =>
      (await fetch(`http://127.0.0.1:${PUERTO_WS}/servidores?puerto=${PUERTO_UDP}&espera=700&${query}`)).json();

    // ?ips= sin broadcast útil: se apunta el broadcast a una dirección donde no
    // hay nadie, así que todo lo que aparezca vino del sondeo dirigido.
    const dirigido = await pide('direccion=169.254.240.7&ips=127.0.0.1');
    check(dirigido.servidores?.length === 1, `?ips= encuentra el servidor (${dirigido.servidores?.length})`);
    check(dirigido.servidores?.[0]?.via === 'directo', `marcado como directo ("${dirigido.servidores?.[0]?.via}")`);
    check(dirigido.servidores?.[0]?.tcpPort === PUERTO_TCP, 'con el puerto TCP al que conectarse');

    // Las dos vías dan con el mismo servidor: debe salir UNA sola entrada.
    const ambas = await pide('direccion=127.0.0.1&ips=127.0.0.1');
    check(ambas.servidores?.length === 1, `broadcast + sondeo no duplican (${ambas.servidores?.length})`);
    check(ambas.servidores?.[0]?.via === 'broadcast', 'y se etiqueta con la vía que ya funcionaba');

    // Una IP muda no añade ruido a la lista.
    const muda = await pide('direccion=169.254.240.7&ips=169.254.240.8');
    check(muda.servidores?.length === 0, `una IP que no responde no aparece (${muda.servidores?.length})`);

    // ?escanear=1 barre las subredes Radmin locales. En una máquina sin Radmin
    // no hay nada que barrer, pero la ruta debe contestar igual.
    const t0 = Date.now();
    const escaneo = await pide('direccion=127.0.0.1&escanear=1');
    const ms = Date.now() - t0;
    check(Array.isArray(escaneo.servidores), '?escanear=1 devuelve una lista');
    check(escaneo.servidores?.some((s) => s.tcpPort === PUERTO_TCP),
      'sin perder lo que ya encontraba el broadcast');
    // Las dos vías corren en paralelo: el escaneo no debe sumar su espera.
    check(ms < 2500, `el escaneo no alarga la petición (${ms} ms)`);
    console.log(`  · /servidores?escanear=1 tardó ${ms} ms`);

    // Basura en ?ips= no puede tumbar la ruta: se descarta y se responde igual.
    const basura = await pide('direccion=127.0.0.1&ips=no-es-ip,,999.999.1.1');
    check(basura.servidores?.length === 1, 'IPs inválidas se ignoran y la ruta sigue respondiendo');

    // Si una vía se cae (aquí el broadcast, con un destino irresoluble), la
    // otra tiene que entregar igual lo que encontró: media lista es infinitamente
    // mejor que un 500 y una pantalla vacía.
    const r = await fetch(`http://127.0.0.1:${PUERTO_WS}/servidores?puerto=${PUERTO_UDP}&espera=700&direccion=destino.que.no.existe.invalido&ips=127.0.0.1`);
    check(r.ok, `con el broadcast roto la ruta sigue devolviendo 200 (${r.status})`);
    const roto = await r.json();
    check(roto.servidores?.length === 1, 'y entrega lo que sí encontró el sondeo dirigido');
    check(Array.isArray(roto.avisos) && roto.avisos.length > 0,
      `explicando el fallo en 'avisos' ("${roto.avisos?.[0]}")`);
  }

  // ── 4c. Difusión dirigida POR INTERFAZ (la vía por defecto) ───────────────
  // Sin `direccion`, el bridge ya no manda un broadcast suelto a 255.255.255.255
  // (que salía por la Wi-Fi y nunca entraba en la VPN): ata un socket a CADA
  // interfaz y difunde a la dirigida de cada una. Aquí se comprueba de verdad,
  // contra las interfaces reales de esta máquina.
  console.log('\n== 4c. /servidores sin `direccion`: difusión por interfaz ==');
  {
    const t0 = Date.now();
    const r = await (await fetch(`http://127.0.0.1:${PUERTO_WS}/servidores?puerto=${PUERTO_UDP}&espera=800`)).json();
    const ms = Date.now() - t0;

    check(r.servidores?.some((s) => s.tcpPort === PUERTO_TCP),
      `la difusión por interfaz encuentra el servidor (${r.servidores?.length})`);
    check(r.servidores?.every((s) => s.via === 'broadcast'), "y lo etiqueta 'broadcast', como la interfaz espera");

    // Lo importante para el usuario: qué se miró DE VERDAD.
    check(Array.isArray(r.exploracion?.vias) && r.exploracion.vias.includes('difusion-por-interfaz'),
      `la respuesta declara la vía empleada (${r.exploracion?.vias?.join(', ')})`);
    const difs = r.exploracion?.difusiones || [];
    check(difs.length > 0, `y las difusiones usadas (${difs.length})`);
    for (const d of difs) console.log(`  · ${d.nombre}: ${d.local} → ${d.difusion} ${d.ok ? 'ok' : 'FALLÓ ' + d.error}`);

    // Esta máquina tiene Radmin en 26.11.206.94/8. Si está, la difusión tiene
    // que ser la de la VPN entera, y el servidor tiene que aparecer por ahí.
    const radmin = difs.find((d) => d.difusion === '26.255.255.255');
    if (radmin) {
      check(radmin.ok === true, `la interfaz Radmin difundió a 26.255.255.255 (${radmin.local})`);
      check(r.servidores?.some((s) => s.difusion === '26.255.255.255' || s.host === radmin.local),
        'y el servidor se ve a través de la interfaz de Radmin');
    } else {
      console.log('  · (sin interfaz Radmin en esta máquina: 26.255.255.255 no se pudo comprobar aquí)');
    }

    // Cada servidor dice por qué interfaz llegó, sin quitar ningún campo viejo.
    const s = r.servidores?.find((x) => x.tcpPort === PUERTO_TCP);
    for (const campo of ['host', 'tcpPort', 'gameId', 'serverName', 'state', 'playerCount', 'maximumPlayers', 'via']) {
      check(campo in s, `el servidor conserva el campo '${campo}'`);
    }
    check(typeof s.interfaz === 'string' && typeof s.difusion === 'string',
      `y añade por dónde llegó (${s.interfaz} → ${s.difusion})`);

    // Varias interfaces se difunden a la vez: la espera no se multiplica.
    console.log(`  · /servidores (difusión por ${difs.length} interfaces) tardó ${ms} ms`);
    check(ms < 2000, `las interfaces van en paralelo (${ms} ms < 2000)`);
  }

  // ── 4d. El /24 automático ya no engaña ────────────────────────────────────
  // Antes `escanear=1` barría el /24 de esta máquina, que está vacío: no
  // encontraba a nadie Y hacía creer que ya se había buscado en la VPN.
  console.log('\n== 4d. escanear=1 ya no finge un barrido inútil ==');
  {
    const r = await (await fetch(`http://127.0.0.1:${PUERTO_WS}/servidores?puerto=${PUERTO_UDP}&espera=700&escanear=1&vecinos=0`)).json();
    check(!r.exploracion?.vias?.includes('sondeo-subred-propia'), 'escanear=1 no barre la subred propia');
    check(r.exploracion?.sondeadas === 0, `no se sondea ninguna dirección a ciegas (${r.exploracion?.sondeadas})`);
    check(r.avisos?.some((a) => a.includes('26.0.0.0/8')),
      `y se dice por qué, en vez de callarlo ("${r.avisos?.find((a) => a.includes('26.0.0.0/8'))?.slice(0, 60)}…")`);
    check(r.servidores?.some((s) => s.tcpPort === PUERTO_TCP), 'sin dejar de encontrar lo que sí se puede encontrar');

    // Quien lo quiera de verdad lo pide explícito, y entonces sí se declara.
    const sub = await (await fetch(`http://127.0.0.1:${PUERTO_WS}/servidores?puerto=${PUERTO_UDP}&espera=700&escanear=subred&vecinos=0`)).json();
    check(sub.exploracion?.vias?.includes('sondeo-subred-propia'),
      'escanear=subred sí lo hace, y lo declara');
    check(sub.exploracion?.sondeadas === 254,
      `barriendo las 254 del /24 propio (${sub.exploracion?.sondeadas})`);
  }

  // ── 4e. Lista pegada de Radmin: 30 IPs sin sumar esperas ──────────────────
  console.log('\n== 4e. ?ips= con una lista pegada de Radmin ==');
  {
    // Las 20 IPs reales del grupo (repartidas por todo el /8) + 10 de relleno.
    const delGrupo = [
      '26.11.206.94', '26.202.164.209', '26.10.214.186', '26.149.22.221',
      '26.78.151.72', '26.135.3.121', '26.230.5.15', '26.169.238.102',
      '26.43.87.248', '26.94.87.242', '26.221.47.165', '26.106.185.242',
      '26.138.165.249', '26.52.44.2', '26.204.234.64', '26.192.234.52',
      '26.99.36.148', '26.63.72.136', '26.98.33.110', '26.157.21.141',
    ];
    const relleno = Array.from({ length: 10 }, (_, i) => `26.200.${i}.7`);
    const lista = [...delGrupo, ...relleno, '127.0.0.1'];

    const t0 = Date.now();
    const r = await (await fetch(
      `http://127.0.0.1:${PUERTO_WS}/servidores?puerto=${PUERTO_UDP}&espera=800&direccion=169.254.240.7&ips=${lista.join(',')}`
    )).json();
    const ms = Date.now() - t0;

    check(r.exploracion?.sondeadas === lista.length,
      `se sondean las ${lista.length} IPs pegadas, ninguna se cae por el camino (${r.exploracion?.sondeadas})`);
    check(r.exploracion?.vias?.includes('sondeo-ips'), 'y la respuesta lo declara');
    check(r.servidores?.some((s) => s.tcpPort === PUERTO_TCP && s.via === 'directo'),
      'el servidor aparece por sondeo directo, con el broadcast apuntando a la nada');
    console.log(`  · ${lista.length} IPs pegadas: ${ms} ms`);
    check(ms < 2000, `31 IPs cuestan UNA espera, no 31 (${ms} ms < 2000)`);

    // ── Servidores que NO se anuncian ────────────────────────────────────
    // El descubrimiento de §19 supone que todos lo implementan, y en la red
    // del curso se comprobó que no: un compañero tenía el servidor aceptando
    // conexiones y no contestaba a ningún DISCOVER_REQUEST. Con solo UDP era
    // invisible. Aquí el servidor de pruebas corre con udp:false, así que
    // representa exactamente ese caso.
    {
      // Se pregunta por UDP en un puerto MUERTO: así el servidor de pruebas,
      // que sí se anuncia en el suyo, se comporta como uno que no lo hace y se
      // aísla la vía del puerto TCP.
      const mudo = await (await fetch(
        `http://127.0.0.1:${PUERTO_WS}/servidores?puerto=15899&espera=400&vecinos=0&direccion=169.254.240.7&ips=127.0.0.1`
      )).json();
      const hallado = mudo.servidores?.find((s) => s.host === '127.0.0.1');
      check(!!hallado, 'un servidor que no se anuncia se encuentra por el puerto TCP');
      check(hallado?.via === 'tcp' && hallado?.anuncia === false,
        'y se marca como tal, para no fingir que respondió al descubrimiento');
      check(hallado?.tcpPort === PUERTO_TCP, `con el puerto al que conectarse (${hallado?.tcpPort})`);
      check(mudo.exploracion?.vias?.includes('puerto-tcp'), 'la vía se declara en la exploración');
    }
    {
      // Y no debe inventarse nada donde no hay nadie escuchando.
      const vacio = await (await fetch(
        `http://127.0.0.1:${PUERTO_WS}/servidores?puerto=${PUERTO_UDP}&espera=400&vecinos=0&direccion=169.254.240.7&ips=169.254.240.9`
      )).json();
      check((vacio.servidores?.length ?? 0) === 0, 'una IP sin servidor no aparece por sondear el puerto');
      check(vacio.exploracion?.tcpProbados === 1, 'pero se declara que se miró');
    }

    // Pegar de Radmin arrastra saltos de línea y espacios, no solo comas.
    const sucia = await (await fetch(
      `http://127.0.0.1:${PUERTO_WS}/servidores?puerto=${PUERTO_UDP}&espera=700&vecinos=0&direccion=169.254.240.7&ips=${encodeURIComponent('26.43.87.248\n 127.0.0.1 ;26.94.87.242')}`
    )).json();
    check(sucia.exploracion?.sondeadas === 3, `saltos de línea y ';' también separan (${sucia.exploracion?.sondeadas})`);
    check(sucia.servidores?.some((s) => s.tcpPort === PUERTO_TCP), 'y la IP buena de la lista sucia se sondea igual');
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
