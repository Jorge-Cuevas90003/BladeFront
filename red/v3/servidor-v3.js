// ============================================================================
//  Servidor autoritativo "Captura la Bandera" PRFC v3 — TCP binario.
//
//  Junta el códec (protocolo-v3.js) con el motor continuo (motor-v3.js) y
//  aplica las validaciones obligatorias de §32. El cliente solo manda dirección
//  e intención de interactuar: aquí NUNCA se confía en posiciones ajenas.
//
//  Se puede usar de dos formas:
//    · como programa:  node red/v3/servidor-v3.js --auto
//    · como módulo:    import { crearServidor } from './servidor-v3.js'
//
//  Lo segundo es lo que usan las pruebas (y lo que permitiría embeber el
//  servidor en otro proceso, por ejemplo junto al bridge).
//
//  Argumentos:
//    --port N        puerto TCP (5000)
//    --auto          arranca la cuenta atrás con el primer jugador
//    --min N         arranca al llegar a N jugadores (2)
//    --name TEXTO    nombre anunciado en el descubrimiento
//    --no-udp        no publicarse por descubrimiento UDP
//    --countdown N   segundos de cuenta atrás (5)
//    --tick N        milisegundos por ciclo (50)
//    --verbose       registra cada mensaje que entra y sale
// ============================================================================

import net from 'node:net';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  TIPOS, VERSION, ERRORES, RAZON_RECHAZO, ESTADO_PARTIDA, PARAMS_DEFECTO,
  NOMBRE_TIPO, enmarcar, AcumuladorTCP,
} from './protocolo-v3.js';
import { MotorV3 } from '../../assets/captura-v3/js/motor-v3.js';
import { publicarServidor } from './descubrimiento.js';

export function crearServidor({
  puerto = PARAMS_DEFECTO.serverPort,
  host = undefined,
  params = {},
  nombre = 'BladeFront',
  auto = false,
  minJugadores = 2,
  udp = true,
  puertoUdp = PARAMS_DEFECTO.discoveryPort,
  verboso = false,
  log = () => {},
} = {}) {
  const juego = new MotorV3(params);
  const conexiones = new Map(); // socket -> { playerId, acc }
  let cuenta = null;   // temporizador de la cuenta atrás
  let bucle = null;    // temporizador del ciclo de juego
  let discovery = null;

  // --- envío ----------------------------------------------------------------
  const enviar = (socket, type, campos) => {
    if (socket.destroyed) return;
    socket.write(enmarcar(type, campos));
    if (verboso) log(`  → ${NOMBRE_TIPO[type]}`);
  };

  const difundir = (type, campos) => {
    for (const socket of conexiones.keys()) enviar(socket, type, campos);
  };

  // --- validaciones comunes (§32) -------------------------------------------

  // El mensaje debe venir de un jugador registrado y el playerId declarado ser
  // el de ESTA conexión; si no, cualquiera podría mover a otro jugador.
  const duenoValido = (socket, info, msg) => {
    if (!info.playerId) {
      enviar(socket, TIPOS.ERROR, { code: ERRORES.UNKNOWN_PLAYER, description: 'no has hecho JOIN' });
      return false;
    }
    if (msg.playerId !== info.playerId) {
      enviar(socket, TIPOS.ERROR, { code: ERRORES.UNKNOWN_PLAYER, description: 'el playerId no es el de esta conexión' });
      return false;
    }
    return true;
  };

  // FINISHED se distingue de "aún no empieza" para que el cliente sepa si
  // esperar o rendirse.
  const partidaEnCurso = (socket) => {
    if (juego.estado === ESTADO_PARTIDA.FINISHED) {
      enviar(socket, TIPOS.ERROR, { code: ERRORES.GAME_FINISHED, description: 'la partida ya terminó' });
      return false;
    }
    if (juego.estado !== ESTADO_PARTIDA.RUNNING) {
      enviar(socket, TIPOS.ERROR, { code: ERRORES.GAME_NOT_STARTED, description: 'la partida no ha empezado' });
      return false;
    }
    return true;
  };

  // --- despacho de mensajes --------------------------------------------------
  const manejar = (socket, msg) => {
    const info = conexiones.get(socket);
    if (!info) return;
    if (verboso) log(`  ← ${NOMBRE_TIPO[msg.type] || '0x' + msg.type.toString(16)}`);

    // §32: versión compatible. En un JOIN la spec pide JOIN_REJECTED (§29.2);
    // en cualquier otro mensaje, ERROR (§29.12).
    if (msg.ver !== VERSION) {
      return msg.type === TIPOS.JOIN
        ? enviar(socket, TIPOS.JOIN_REJECTED, { reason: RAZON_RECHAZO.UNSUPPORTED_PROTOCOL_VERSION })
        : enviar(socket, TIPOS.ERROR, { code: ERRORES.UNSUPPORTED_PROTOCOL_VERSION, description: 'versión no soportada' });
    }

    switch (msg.type) {
      case TIPOS.JOIN: {
        // Un segundo JOIN en la misma conexión dejaría huérfano al primer
        // jugador: nadie podría moverlo y su baja no llegaría nunca.
        if (info.playerId) {
          return enviar(socket, TIPOS.ERROR, { code: ERRORES.INVALID_MESSAGE, description: 'ya hiciste JOIN en esta conexión' });
        }
        const { jugador, error } = juego.agregarJugador(msg.name);
        if (error) return enviar(socket, TIPOS.JOIN_REJECTED, { reason: error });

        info.playerId = jugador.playerId;
        enviar(socket, TIPOS.JOIN_ACCEPTED, { playerId: jugador.playerId, gameId: juego.gameId });
        log(`  JOIN ${jugador.playerId} "${jugador.name}"`);
        difundir(TIPOS.LOBBY_STATE, juego.serializarLobby());

        const activos = juego.jugadoresActivos().length;
        if (juego.estado === ESTADO_PARTIDA.WAITING && (auto || activos >= minJugadores)) {
          arrancarCuenta();
        }
        return;
      }

      case TIPOS.INPUT: {
        if (!duenoValido(socket, info, msg) || !partidaEnCurso(socket)) return;
        const r = juego.encolarInput(info.playerId, msg.direction);
        if (r.error === 'INVALID_INPUT') {
          enviar(socket, TIPOS.ERROR, { code: ERRORES.INVALID_INPUT, description: 'dirección inválida' });
        }
        return;
      }

      case TIPOS.INTERACT:
        if (!duenoValido(socket, info, msg) || !partidaEnCurso(socket)) return;
        juego.encolarInteract(info.playerId);
        return;

      case TIPOS.LEAVE:
        if (info.playerId) juego.desconectar(info.playerId);
        return socket.end();

      default:
        return enviar(socket, TIPOS.ERROR, {
          code: ERRORES.INVALID_MESSAGE,
          description: 'tipo no admitido del cliente: 0x' + msg.type.toString(16),
        });
    }
  };

  // --- cuenta atrás y bucle (§20, §30, §29.11) ------------------------------
  function arrancarCuenta() {
    if (juego.estado !== ESTADO_PARTIDA.WAITING) return;
    // Durante STARTING el motor ya rechaza altas con GAME_ALREADY_STARTED, que
    // es justo lo que queremos: nadie entra a mitad de la cuenta.
    juego.estado = ESTADO_PARTIDA.STARTING;

    let restantes = juego.p.countdownSeconds;
    log(`== cuenta atrás: ${restantes} ==`);
    difundir(TIPOS.GAME_COUNTDOWN, { secondsRemaining: restantes });

    cuenta = setInterval(() => {
      restantes--;
      if (restantes >= 1) {
        difundir(TIPOS.GAME_COUNTDOWN, { secondsRemaining: restantes });
      } else {
        clearInterval(cuenta);
        cuenta = null;
        arrancarPartida();
      }
    }, 1000);
  }

  function arrancarPartida() {
    juego.estado = ESTADO_PARTIDA.WAITING; // iniciar() exige no estar corriendo
    const inicio = juego.iniciar();
    difundir(TIPOS.GAME_STARTED, inicio);
    log(`== partida iniciada con ${inicio.players.length} jugadores ==`);

    bucle = setInterval(() => {
      const { eventos, estado } = juego.ciclo();

      // §29.11: primero los eventos del ciclo, luego el GAME_STATE de ese tick,
      // y el GAME_OVER DESPUÉS del estado, para que el cliente alcance a
      // dibujar el instante de la victoria antes de cerrar.
      for (const ev of eventos) {
        if (ev.type !== TIPOS.GAME_OVER) difundir(ev.type, ev);
      }
      difundir(TIPOS.GAME_STATE, juego.serializarEstado());
      for (const ev of eventos) {
        if (ev.type === TIPOS.GAME_OVER) difundir(ev.type, ev);
      }

      if (estado === ESTADO_PARTIDA.FINISHED) {
        clearInterval(bucle);
        bucle = null;
        const g = juego.jugadores.get(juego.ganadorId);
        log(`== fin: gana ${juego.ganadorId} "${g?.name ?? '?'}" en el tick ${juego.tick} ==`);
      }
    }, juego.p.tickIntervalMs);
  }

  // --- socket TCP ------------------------------------------------------------
  const servidor = net.createServer((socket) => {
    socket.setNoDelay(true); // con un tick de 50 ms, Nagle solo añadiría retardo

    const acc = new AcumuladorTCP(
      (msg) => manejar(socket, msg),
      (code, detalle) => {
        enviar(socket, TIPOS.ERROR, { code, description: 'mensaje ilegible' });
        if (verboso) log('  ! marco inválido:', detalle);
      }
    );
    conexiones.set(socket, { playerId: 0, acc });
    log('+ conexión desde', socket.remoteAddress);

    socket.on('data', (d) => acc.alimentar(d));
    socket.on('error', () => {}); // un reset no debe tumbar el proceso
    socket.on('close', () => {
      const info = conexiones.get(socket);
      conexiones.delete(socket);
      if (!info?.playerId) return;
      // La baja se ENCOLA: el motor la aplica en el paso 8 de su ciclo (§30.8),
      // así que el evento cae en un tick definido y no en un instante suelto.
      juego.desconectar(info.playerId);
      log('- se fue', info.playerId);
      // Antes de arrancar no hay ciclo que procese la cola: se aplica aquí para
      // que el lobby refleje la baja de inmediato.
      if (juego.estado === ESTADO_PARTIDA.WAITING || juego.estado === ESTADO_PARTIDA.STARTING) {
        const j = juego.jugadores.get(info.playerId);
        if (j) j.connected = false;
        difundir(TIPOS.LOBBY_STATE, juego.serializarLobby());
      }
    });
  });

  return {
    juego,
    servidor,
    get puerto() { return servidor.address()?.port ?? puerto; },

    escuchar() {
      return new Promise((resolve) => {
        servidor.listen(puerto, host, () => {
          if (udp) {
            discovery = publicarServidor({
              puerto: puertoUdp,
              log: verboso ? log : () => {},
              describir: () => ({
                gameId: juego.gameId,
                serverName: nombre,
                tcpPort: servidor.address()?.port ?? puerto,
                state: juego.estado,
                playerCount: juego.jugadoresActivos().length,
                maximumPlayers: juego.p.maximumPlayers,
              }),
            });
          }
          resolve(servidor.address()?.port ?? puerto);
        });
      });
    },

    cerrar() {
      if (cuenta) { clearInterval(cuenta); cuenta = null; }
      if (bucle) { clearInterval(bucle); bucle = null; }
      try { discovery?.cerrar(); } catch {}
      for (const s of conexiones.keys()) s.destroy();
      conexiones.clear();
      return new Promise((resolve) => servidor.close(resolve));
    },
  };
}

// ---------------------------------------------------------------------------
//  Modo programa. Solo corre si este archivo ES el que se ejecutó, para que
//  importarlo desde una prueba no levante un servidor por sorpresa.
// ---------------------------------------------------------------------------
const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esPrincipal) {
  const args = process.argv.slice(2);
  const flag = (n) => args.includes('--' + n);
  const val = (n, def) => {
    const i = args.indexOf('--' + n);
    return i >= 0 && args[i + 1] ? args[i + 1] : def;
  };

  // Sobrescrituras de §21, útiles para pruebas y demos.
  const params = {};
  for (const [arg, campo] of [
    ['countdown', 'countdownSeconds'], ['tick', 'tickIntervalMs'],
    ['speed', 'playerSpeed'], ['radius', 'circleRadius'],
    ['map', 'mapSize'], ['max', 'maximumPlayers'],
  ]) {
    const v = val(arg, null);
    if (v !== null) params[campo] = Number(v);
  }

  const marca = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
  const auto = flag('auto');
  const minJugadores = Number(val('min', 2));
  const nombre = val('name', 'BladeFront');

  const s = crearServidor({
    puerto: Number(val('port', PARAMS_DEFECTO.serverPort)),
    puertoUdp: Number(val('discovery-port', PARAMS_DEFECTO.discoveryPort)),
    params, nombre, auto, minJugadores,
    udp: !flag('no-udp'),
    verboso: flag('verbose'),
    log: marca,
  });

  const p = await s.escuchar();
  marca(`"${nombre}" escuchando TCP en el puerto ${p}`);
  marca(auto ? '(--auto: la cuenta atrás arranca con el primer jugador)' : `(arranca con ${minJugadores} jugadores)`);

  // Sin esto, Ctrl+C deja el puerto ocupado unos segundos.
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => { await s.cerrar(); process.exit(0); });
  }
}
