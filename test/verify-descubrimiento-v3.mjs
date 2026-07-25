// ============================================================================
//  Prueba del descubrimiento de servidores por UDP (§19, §27).
//  Correr:  node test/verify-descubrimiento-v3.mjs
//
//  Se apunta a 127.0.0.1 en vez de al broadcast de la red: la prueba debe
//  verificar el protocolo, no la topología de la LAN de quien la corra.
// ============================================================================

import dgram from 'node:dgram';
import { publicarServidor, buscarServidores } from '../red/v3/descubrimiento.js';
import { TIPOS, VERSION, ESTADO_PARTIDA, codificar, decodificar } from '../red/v3/protocolo-v3.js';

const PUERTO = 15601;
let ok = 0, fail = 0;
const check = (cond, msg) => {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ FALLA: ${msg}`); }
};
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

let jugadores = 3;
let estado = ESTADO_PARTIDA.WAITING;

const publicador = publicarServidor({
  puerto: PUERTO,
  describir: () => ({
    gameId: 7,
    serverName: 'Arena BladeFront',
    tcpPort: 5000,
    state: estado,
    playerCount: jugadores,
    maximumPlayers: 100,
  }),
});

const terminar = (codigo) => {
  publicador.cerrar();
  console.log(`\n${'='.repeat(52)}`);
  console.log(`Resultado: ${ok} OK, ${fail} FALLAS`);
  process.exit(codigo);
};

try {
  await dormir(400); // que alcance a atarse al puerto

  // ── 1. Un servidor se anuncia y aparece en la búsqueda ────────────────────
  console.log('\n== 1. Anuncio y búsqueda (§19) ==');
  const hallados = await buscarServidores({ puerto: PUERTO, direccion: '127.0.0.1', esperaMs: 700 });
  check(hallados.length === 1, `se encuentra 1 servidor (fueron ${hallados.length})`);

  const s = hallados[0];
  check(s?.serverName === 'Arena BladeFront', `con su nombre ("${s?.serverName}")`);
  check(s?.tcpPort === 5000, 'con el puerto TCP donde conectarse');
  check(s?.gameId === 7, 'con el gameId');
  check(s?.playerCount === 3 && s?.maximumPlayers === 100, 'con el conteo de jugadores');
  check(s?.state === ESTADO_PARTIDA.WAITING, 'y el estado de la partida');

  // §27: la IP sale del ORIGEN del datagrama, no del contenido del mensaje.
  check(s?.host === '127.0.0.1', `la IP se deduce del datagrama (${s?.host})`);
  const campos = Object.keys(s);
  check(!campos.includes('ip') && !campos.includes('address'),
    'y el mensaje no transporta ninguna IP propia');

  // ── 2. Los datos son frescos en cada respuesta ────────────────────────────
  console.log('\n== 2. Los datos se recalculan por consulta ==');
  jugadores = 12;
  estado = ESTADO_PARTIDA.RUNNING;
  const otra = await buscarServidores({ puerto: PUERTO, direccion: '127.0.0.1', esperaMs: 700 });
  check(otra[0]?.playerCount === 12, `refleja el nuevo conteo (${otra[0]?.playerCount})`);
  check(otra[0]?.state === ESTADO_PARTIDA.RUNNING, 'y el nuevo estado');

  // ── 3. Los datagramas van SIN prefijo de longitud (§23) ───────────────────
  console.log('\n== 3. UDP sin prefijo de longitud (§23) ==');
  {
    const sock = dgram.createSocket('udp4');
    const respuesta = await new Promise((resolve) => {
      sock.on('message', (d) => resolve(d));
      sock.bind(() => {
        // Se manda el payload crudo (2 bytes: "01 03"), sin enmarcar.
        const req = codificar(TIPOS.DISCOVER_REQUEST, {});
        sock.send(req, PUERTO, '127.0.0.1');
      });
      setTimeout(() => resolve(null), 900);
    });
    sock.close();

    check(!!respuesta, 'responde a un DISCOVER_REQUEST crudo de 2 bytes');
    check(respuesta?.[0] === TIPOS.DISCOVER_RESPONSE,
      `el primer byte ya es el tipo, sin longitud delante (0x${respuesta?.[0]?.toString(16)})`);
    check(respuesta?.[1] === VERSION, 'y el segundo la versión');
    const m = decodificar(respuesta);
    check(m.serverName === 'Arena BladeFront', 'y se decodifica entero sin desenmarcar');
  }

  // ── 4. Basura y versiones ajenas no rompen nada ───────────────────────────
  console.log('\n== 4. Robustez del puerto de descubrimiento ==');
  {
    const sock = dgram.createSocket('udp4');
    await new Promise((r) => sock.bind(r));

    // Bytes sin sentido.
    sock.send(Buffer.from([0x99, 0x99, 0x99]), PUERTO, '127.0.0.1');
    // Un DISCOVER_REQUEST de otra versión del protocolo.
    const otroVer = codificar(TIPOS.DISCOVER_REQUEST, {});
    otroVer[1] = 0x09;
    sock.send(otroVer, PUERTO, '127.0.0.1');
    await dormir(300);

    // Si algo de lo anterior hubiera tumbado el socket, esto ya no respondería.
    const sigueVivo = await buscarServidores({ puerto: PUERTO, direccion: '127.0.0.1', esperaMs: 700 });
    check(sigueVivo.length === 1, 'tras recibir basura y otra versión, sigue respondiendo');
    sock.close();
  }

  terminar(fail ? 1 : 0);
} catch (e) {
  console.error('\nExcepción en la prueba:', e);
  fail++;
  terminar(1);
}
