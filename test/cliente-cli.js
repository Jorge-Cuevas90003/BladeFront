// ============================================================================
//  Cliente de prueba por CONSOLA (TCP puro) — valida la prueba mínima de
//  compatibilidad de la spec (§35) sin navegador ni bridge:
//    1. conectar TCP · 2. JOIN → JOIN_ACCEPTED · 3. CHANGE_DIRECTION
//    4. recibir GAME_STATE · 5. leer varios mensajes seguidos · 6. cerrar
//
//  Correr (con el servidor ya levantado):
//    node test/cliente-cli.js --host 127.0.0.1 --port 5000 --name Prueba --auto-play
//
//  --auto-play : cada segundo manda una dirección aleatoria (para ver moverse
//                al jugador en los GAME_STATE). Sin el flag, solo observa.
// ============================================================================

import net from 'node:net';
import process from 'node:process';
import { TIPOS, PROTOCOL_VERSION, enmarcar, LectorLineas } from '../red/protocolo.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const val = (n, def) => {
  const i = args.indexOf('--' + n);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const HOST = val('host', '127.0.0.1');
const PORT = Number(val('port', 5000));
const NAME = val('name', 'Prueba-CLI');
const AUTO = flag('auto-play');
const DIRS = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

let playerId = null;
const socket = net.connect(PORT, HOST, () => {
  console.log(`✓ (1) Conectado por TCP a ${HOST}:${PORT}`);
  socket.write(enmarcar(TIPOS.JOIN, { name: NAME }));
  console.log(`→ (2) JOIN enviado como "${NAME}"`);
});

const lector = new LectorLineas((msg) => {
  switch (msg.type) {
    case TIPOS.JOIN_ACCEPTED:
      playerId = msg.playerId;
      console.log(`✓ (2) JOIN_ACCEPTED — soy ${playerId} en ${msg.gameId}`);
      break;
    case TIPOS.JOIN_REJECTED:
      console.log(`✗ JOIN_REJECTED: ${msg.reason}`);
      socket.end();
      break;
    case TIPOS.GAME_STARTED:
      console.log(`✓ GAME_STARTED — tablero ${msg.rows}x${msg.columns}, ${msg.players.length} jugadores, bandera en [${msg.flag.row},${msg.flag.column}]`);
      if (AUTO) {
        // (3) mandar cambios de dirección cada segundo.
        setInterval(() => {
          const direction = DIRS[Math.floor(Math.random() * 4)];
          socket.write(enmarcar(TIPOS.CHANGE_DIRECTION, { gameId: 'GAME-001', playerId, direction }));
        }, 1000);
      }
      break;
    case TIPOS.GAME_STATE: {
      // (4)(5) recibimos múltiples GAME_STATE seguidos: mostramos el nuestro.
      const yo = msg.players.find((p) => p.playerId === playerId);
      const pos = yo ? `[${yo.row},${yo.column}] dir=${yo.direction}${yo.hasFlag ? ' 🏳️' : ''}` : '(fuera)';
      console.log(`  tick ${msg.tick}: ${pos} · bandera=${msg.flag.status}`);
      break;
    }
    case TIPOS.FLAG_PICKED_UP:
      console.log(`  🏳️  FLAG_PICKED_UP por ${msg.playerId}`);
      break;
    case TIPOS.FLAG_STOLEN:
      console.log(`  🔁 FLAG_STOLEN: ${msg.previousCarrierId} → ${msg.newCarrierId}`);
      break;
    case TIPOS.GAME_OVER:
      console.log(`✓ GAME_OVER — ganó ${msg.winnerName} (${msg.winnerId}) por ${msg.reason}`);
      console.log('✓ (6) cerrando conexión.');
      socket.end();
      break;
    case TIPOS.ERROR:
      console.log(`✗ ERROR ${msg.code}: ${msg.description}`);
      break;
    default:
      console.log('  ? mensaje:', msg.type);
  }
});

socket.on('data', (d) => lector.alimentar(d));
socket.on('error', (e) => console.log('✗ error de socket:', e.message));
socket.on('close', () => { console.log('· conexión cerrada'); process.exit(0); });

console.log(`Cliente CLI (protocolo v${PROTOCOL_VERSION}) — Ctrl+C para salir`);
