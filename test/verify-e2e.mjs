// E2E test: servidor + cliente TCP en el mismo proceso
import net from 'node:net';
import { JuegoCaptura, ESTADOS } from '../assets/captura-bandera/js/juego-captura.js';
import { TIPOS, PROTOCOL_VERSION, enmarcar, LectorLineas } from '../red/protocolo.js';

const PORT = 15432;
const juego = new JuegoCaptura({ rows: 8, columns: 8, obstaclePercentage: 5, maximumPlayers: 10 });
const conexiones = new Map();
const desconexionesPendientes = [];

const enviar = (s, type, campos) => { if (!s.destroyed) s.write(enmarcar(type, campos)); };
const difundir = (type, campos) => { for (const s of conexiones.keys()) enviar(s, type, campos); };

const servidor = net.createServer((socket) => {
  const lector = new LectorLineas((msg) => {
    if (msg.protocolVersion !== PROTOCOL_VERSION) return;
    const info = conexiones.get(socket);
    if (msg.type === TIPOS.JOIN) {
      const { jugador, error } = juego.agregarJugador(msg.name);
      if (error) return enviar(socket, TIPOS.JOIN_REJECTED, { reason: error });
      info.playerId = jugador.playerId;
      enviar(socket, TIPOS.JOIN_ACCEPTED, { playerId: jugador.playerId, gameId: juego.gameId });
    } else if (msg.type === TIPOS.CHANGE_DIRECTION && info.playerId) {
      juego.cambiarDireccion(info.playerId, msg.direction);
    }
  });
  conexiones.set(socket, { playerId: null, lector });
  socket.on('data', (d) => lector.alimentar(d));
  socket.on('error', () => {});
  socket.on('close', () => {
    const info = conexiones.get(socket);
    conexiones.delete(socket);
    if (info?.playerId) desconexionesPendientes.push(info.playerId);
  });
});

let ok = 0, fail = 0;
function assert(c, m) { if (c) { ok++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}`); } }

servidor.listen(PORT, () => {
  console.log(`Servidor TCP en puerto ${PORT}`);
  
  // Conectar 2 clientes
  const c1 = net.connect(PORT, '127.0.0.1');
  const c2 = net.connect(PORT, '127.0.0.1');
  let id1 = null, id2 = null;
  let gameStarted = false;
  let stateCount = 0;
  
  const l1 = new LectorLineas((msg) => {
    if (msg.type === TIPOS.JOIN_ACCEPTED) {
      id1 = msg.playerId;
      assert(id1.startsWith('P00'), `Cliente 1 tiene ID válido (got ${id1})`);
    }
    if (msg.type === TIPOS.GAME_STARTED) {
      gameStarted = true;
      assert(msg.players.length === 2, `2 jugadores en GAME_STARTED`);
      assert(msg.flag.status === 'AVAILABLE', 'Bandera AVAILABLE');
    }
    if (msg.type === TIPOS.GAME_STATE) {
      stateCount++;
      if (stateCount === 1) {
        assert(typeof msg.tick === 'number', `GAME_STATE tiene tick (${msg.tick})`);
        assert(msg.tick === 1, `Primer GAME_STATE tiene tick 1 (got ${msg.tick})`);
      }
      if (stateCount >= 3) {
        // Desconectar cliente 2 y esperar un ciclo más
        c2.destroy();
        setTimeout(() => {
          assert(stateCount >= 3, `Recibidos ${stateCount} GAME_STATE`);
          c1.end();
          servidor.close(() => {
            console.log(`\nResultado E2E: ${ok} OK, ${fail} FAIL`);
            process.exit(fail > 0 ? 1 : 0);
          });
        }, 500);
      }
    }
  });
  
  const l2 = new LectorLineas((msg) => {
    if (msg.type === TIPOS.JOIN_ACCEPTED) {
      id2 = msg.playerId;
      assert(id2.startsWith('P00'), `Cliente 2 tiene ID válido (got ${id2})`);
    }
  });
  
  c1.on('data', (d) => l1.alimentar(d));
  c2.on('data', (d) => l2.alimentar(d));
  c1.on('error', () => {});
  c2.on('error', () => {});
  
  c1.on('connect', () => {
    c1.write(enmarcar(TIPOS.JOIN, { name: 'Test1' }));
  });
  c2.on('connect', () => {
    c2.write(enmarcar(TIPOS.JOIN, { name: 'Test2' }));
    // Arrancar partida después de ambos joins
    setTimeout(() => {
      if (juego.estado === ESTADOS.WAITING) {
        const inicio = juego.iniciar();
        difundir(TIPOS.GAME_STARTED, inicio);
        // Bucle de ciclos
        const bucle = setInterval(() => {
          while (desconexionesPendientes.length) {
            const pid = desconexionesPendientes.shift();
            const { eventos: evD } = juego.quitarJugador(pid);
            for (const ev of evD) difundir(ev.type, ev);
          }
          for (const j of juego.jugadores.values()) {
            if (j.connected) {
              const dirs = ['UP','DOWN','LEFT','RIGHT'];
              juego.cambiarDireccion(j.playerId, dirs[Math.floor(Math.random()*4)]);
            }
          }
          const { eventos, estado } = juego.ciclo();
          for (const ev of eventos) difundir(ev.type, ev);
          difundir(TIPOS.GAME_STATE, juego.serializarEstado());
          if (estado === ESTADOS.FINISHED) clearInterval(bucle);
        }, 100);
      }
    }, 200);
  });
});
