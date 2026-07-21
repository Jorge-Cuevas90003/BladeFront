// ============================================================================
//  Servidor autoritativo "Captura la Bandera" v1.0 — TCP + JSON por línea.
//  Corre el motor (juego-captura.js) y habla el protocolo oficial (§23–§33).
//
//  Correr:  node red/servidor.js            (puerto 5000 por defecto)
//           node red/servidor.js --port 5000 --auto
//
//  --auto : arranca la partida solo cuando se conecta el primer jugador
//           (cómodo para testear). Sin --auto, arranca al llegar a `--min`
//           jugadores. (La spec no define un mensaje START explícito.)
// ============================================================================

import net from 'node:net';
import process from 'node:process';
import { JuegoCaptura, ESTADOS, CONFIG_DEFECTO } from '../assets/captura-bandera/js/juego-captura.js';
import { TIPOS, ERRORES, PROTOCOL_VERSION, enmarcar, LectorLineas } from './protocolo.js';

// --- argumentos KEY VALUE / flags -----------------------------------------
const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const val = (n, def) => {
  const i = args.indexOf('--' + n);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const PUERTO = Number(val('port', CONFIG_DEFECTO.serverPort));
const HOST = val('host', '0.0.0.0'); // 0.0.0.0 = todas las interfaces (Radmin/LAN)
const AUTO = flag('auto');
const MIN_JUGADORES = Number(val('min', 1));
const WAIT = flag('wait'); // el anfitrión inicia a mano (Enter en la consola)

const juego = new JuegoCaptura();
const conexiones = new Map(); // socket -> { playerId, lector }
const desconexionesPendientes = []; // §30 paso 12: se procesan dentro del ciclo
let anfitrionListo = false;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// Envía un mensaje a un socket concreto.
const enviar = (socket, type, campos) => {
  if (!socket.destroyed) socket.write(enmarcar(type, campos));
};

// Difunde a todos los clientes conectados.
const difundir = (type, campos) => {
  for (const socket of conexiones.keys()) enviar(socket, type, campos);
};

// --- servidor TCP ----------------------------------------------------------
const servidor = net.createServer((socket) => {
  const host = socket.remoteAddress;
  log('+ conexión desde', host);

  const lector = new LectorLineas(
    (msg) => manejarMensaje(socket, msg),
    (code) => enviar(socket, TIPOS.ERROR, { code, description: 'JSON inválido' })
  );
  conexiones.set(socket, { playerId: null, lector });

  socket.on('data', (d) => lector.alimentar(d));
  socket.on('error', () => {}); // evita que un reset tumbe el proceso
  socket.on('close', () => {
    const info = conexiones.get(socket);
    conexiones.delete(socket);
    // §30 paso 12: encolar para procesar dentro del ciclo, no de inmediato.
    if (info?.playerId) desconexionesPendientes.push(info.playerId);
  });
});

function manejarMensaje(socket, msg) {
  if (!msg || typeof msg.type !== 'string') {
    return enviar(socket, TIPOS.ERROR, { code: ERRORES.INVALID_MESSAGE, description: 'Falta type' });
  }
  // protocolVersion es parte obligatoria del sobre oficial (§26). No aceptar
  // mensajes sin versión evita mezclar accidentalmente clientes incompatibles.
  if (msg.protocolVersion !== PROTOCOL_VERSION) {
    // En un JOIN, la spec espera JOIN_REJECTED con este motivo (§29.2); en
    // cualquier otro mensaje, un ERROR con el mismo código (§29.9).
    if (msg.type === TIPOS.JOIN) return enviar(socket, TIPOS.JOIN_REJECTED, { reason: ERRORES.UNSUPPORTED_PROTOCOL_VERSION });
    return enviar(socket, TIPOS.ERROR, { code: ERRORES.UNSUPPORTED_PROTOCOL_VERSION, description: 'Versión no soportada' });
  }
  const info = conexiones.get(socket);

  switch (msg.type) {
    case TIPOS.JOIN: {
      // Un segundo JOIN en la misma conexión crearía un jugador "fantasma"
      // (el primero quedaría sin dueño y nunca se limpiaría). Se rechaza.
      if (info.playerId) return enviar(socket, TIPOS.ERROR, { code: ERRORES.INVALID_MESSAGE, description: 'Ya hiciste JOIN en esta conexión' });
      const { jugador, error } = juego.agregarJugador(msg.name);
      if (error) return enviar(socket, TIPOS.JOIN_REJECTED, { reason: error });
      info.playerId = jugador.playerId;
      enviar(socket, TIPOS.JOIN_ACCEPTED, { playerId: jugador.playerId, gameId: juego.gameId });
      log('  JOIN', jugador.playerId, jugador.name);
      // Arranque de la partida. En modo --wait el anfitrión decide (Enter en la
      // consola); si no, arranca solo con --auto o al llegar a --min jugadores.
      const activos = [...juego.jugadores.values()].filter((j) => j.connected).length;
      if (WAIT) {
        log(`  (esperando Enter del anfitrión para iniciar — ${activos} jugador[es] en sala)`);
      } else if (juego.estado === ESTADOS.WAITING && (AUTO || activos >= MIN_JUGADORES) && !anfitrionListo) {
        anfitrionListo = true;
        setTimeout(arrancarPartida, AUTO ? 300 : 0);
      }
      break;
    }
    case TIPOS.CHANGE_DIRECTION: {
      if (!info.playerId) return enviar(socket, TIPOS.ERROR, { code: ERRORES.UNKNOWN_PLAYER, description: 'No has hecho JOIN' });
      // La spec pide comprobar que el playerId pertenece a ESTA conexión (§28.2).
      if (msg.playerId && msg.playerId !== info.playerId) {
        return enviar(socket, TIPOS.ERROR, { code: ERRORES.UNKNOWN_PLAYER, description: 'playerId no coincide con la conexión' });
      }
      if (juego.estado === ESTADOS.FINISHED) return enviar(socket, TIPOS.ERROR, { code: ERRORES.GAME_FINISHED, description: 'La partida ya terminó' });
      if (juego.estado !== ESTADOS.RUNNING) return enviar(socket, TIPOS.ERROR, { code: ERRORES.GAME_NOT_STARTED, description: 'La partida no está corriendo' });
      const r = juego.cambiarDireccion(info.playerId, msg.direction);
      if (r.error) {
        const desc = r.error === ERRORES.INVALID_DIRECTION ? 'Dirección inválida' : 'Jugador desconocido';
        enviar(socket, TIPOS.ERROR, { code: r.error, description: desc });
      }
      break;
    }
    case TIPOS.LEAVE: {
      if (info.playerId) {
        const { eventos } = juego.quitarJugador(info.playerId);
        for (const ev of eventos) difundir(ev.type, ev);
      }
      socket.end();
      break;
    }
    default:
      enviar(socket, TIPOS.ERROR, { code: ERRORES.INVALID_MESSAGE, description: 'Tipo desconocido: ' + msg.type });
  }
}

// --- arranque y bucle de ciclos (§9, §30) ---------------------------------
let bucle = null;

function arrancarPartida() {
  if (juego.estado !== ESTADOS.WAITING) return;
  const inicio = juego.iniciar();
  difundir(TIPOS.GAME_STARTED, inicio);
  log('== partida iniciada ==', inicio.players.length, 'jugadores');

  bucle = setInterval(() => {
    // §30 paso 12: procesar desconexiones encoladas dentro del ciclo.
    while (desconexionesPendientes.length) {
      const pid = desconexionesPendientes.shift();
      const { eventos: evDisc } = juego.quitarJugador(pid);
      for (const ev of evDisc) difundir(ev.type, ev);
      log('- desconectado', pid);
    }
    const { eventos, estado } = juego.ciclo();
    for (const ev of eventos) difundir(ev.type, ev);
    difundir(TIPOS.GAME_STATE, juego.serializarEstado());
    if (estado === ESTADOS.FINISHED) {
      clearInterval(bucle);
      log('== fin de la partida ==', 'ganador:', juego.ganadorId);
    }
  }, juego.cfg.movementIntervalMs);
}

servidor.listen(PUERTO, HOST, () => {
  log(`Servidor "Captura la Bandera" TCP escuchando en ${HOST}:${PUERTO}`);
  if (WAIT) log('(modo --wait: pulsa ENTER en esta consola para iniciar la partida)');
  else log(AUTO ? '(modo --auto: arranca al primer JOIN)' : `(arranca con ${MIN_JUGADORES} jugador[es])`);
  if (HOST === '0.0.0.0') log('(accesible por LAN/Radmin: usa la IP de esta máquina desde otros equipos)');
});

// Modo anfitrión: iniciar la partida al pulsar ENTER en la consola del servidor.
// No es un mensaje del protocolo (el docx no define START) — es control LOCAL
// del operador, así que no afecta la interoperabilidad con otros grupos.
if (WAIT) {
  process.stdin.resume();
  process.stdin.on('data', () => {
    if (juego.estado === ESTADOS.WAITING && !anfitrionListo) {
      anfitrionListo = true;
      arrancarPartida();
    }
  });
}
