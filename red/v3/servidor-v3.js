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
//    --keepalive N   sondeo TCP para detectar clientes muertos (10000 ms)
//    --verbose       registra cada mensaje que entra y sale
// ============================================================================

import net from 'node:net';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  TIPOS, VERSION, ERRORES, RAZON_RECHAZO, ESTADO_PARTIDA, ESTADO_BANDERA,
  DIRECCIONES, PARAMS_DEFECTO, NOMBRE_TIPO, enmarcar, AcumuladorTCP,
} from './protocolo-v3.js';
import { MotorV3 } from '../../assets/captura-v3/js/motor-v3.js';
import { publicarServidor } from './descubrimiento.js';
import { crearReloj } from './reloj.js';

// Loopback en cualquiera de sus formas. Node entrega las IPv4 por un socket
// dual-stack como "::ffff:127.0.0.1", así que no basta con comparar con
// "127.0.0.1".
function esDeEstaMaquina(dir) {
  if (!dir) return false;
  const limpia = String(dir).replace(/^::ffff:/i, '');
  return limpia === '::1' || limpia === '127.0.0.1' || limpia.startsWith('127.');
}

export function crearServidor({
  puerto = PARAMS_DEFECTO.serverPort,
  host = undefined,
  params = {},
  nombre = 'BladeFront',
  auto = false,
  minJugadores = 0,   // 0 = no arrancar solo; espera a que el anfitrión lo pida
  udp = true,
  puertoUdp = PARAMS_DEFECTO.discoveryPort,
  keepAliveMs = 10000,
  verboso = false,
  log = () => {},
} = {}) {
  const juego = new MotorV3(params);
  const conexiones = new Map(); // socket -> { playerId, acc }
  // playerId del anfitrión: el jugador que entró desde esta misma máquina.
  // Vale 0 mientras el dueño no se haya unido a su propia partida.
  let anfitrionId = 0;
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

        // Anfitrión es quien juega desde la máquina que aloja la partida. Si
        // ya hay uno no se reemplaza: abrir una segunda pestaña en local no
        // debe robarle el mando al que ya estaba.
        if (info.esLocal && !anfitrionId) {
          anfitrionId = jugador.playerId;
          log(`  ${jugador.playerId} es el anfitrión (juega desde esta máquina)`);
        }

        // Con `auto` la cuenta arranca con el primer jugador. Eso deja al
        // anfitrión jugando SOLO, porque a partir de STARTING el servidor
        // rechaza a todo el mundo con GAME_ALREADY_STARTED: nadie llega a
        // entrar. Solo tiene sentido para pruebas, así que ya no es lo normal.
        const activos = juego.jugadoresActivos().length;
        if (juego.estado === ESTADO_PARTIDA.WAITING && (auto || (minJugadores > 0 && activos >= minJugadores))) {
          arrancarCuenta();
        }
        return;
      }

      // Extensión local: el anfitrión pide empezar. §20 no define qué dispara
      // el paso a STARTING, así que dejarlo en sus manos es una decisión
      // nuestra, no una desviación del protocolo.
      case TIPOS.HOST_START: {
        if (!duenoValido(socket, info, msg)) return;
        // Doble comprobación: el id tiene que ser el del anfitrión Y la
        // conexión tiene que venir de esta máquina. Con solo lo primero, si el
        // anfitrión se fuera y otro heredara su número podría dar la salida en
        // una partida que no es suya.
        if (!info.esLocal || info.playerId !== anfitrionId) {
          return enviar(socket, TIPOS.ERROR, {
            code: ERRORES.UNKNOWN_PLAYER,
            description: 'solo el anfitrión, desde la máquina que aloja la partida, puede empezarla',
          });
        }
        if (juego.estado !== ESTADO_PARTIDA.WAITING) {
          return enviar(socket, TIPOS.ERROR, {
            code: ERRORES.GAME_ALREADY_STARTED, description: 'la partida ya está en marcha',
          });
        }
        log(`  el anfitrión (${info.playerId}) pide empezar con ${juego.jugadoresActivos().length} jugadores`);
        arrancarCuenta();
        return;
      }

      // Solo se contesta a quien pregunta: ver la nota en protocolo-v3.js.
      case TIPOS.HOST_QUERY: {
        if (!duenoValido(socket, info, msg)) return;
        return enviar(socket, TIPOS.HOST_INFO, {
          hostId: anfitrionId,
          puedesEmpezar: !!(info.esLocal && info.playerId === anfitrionId
                            && juego.estado === ESTADO_PARTIDA.WAITING),
        });
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

    cuenta = crearReloj(1000, () => {
      restantes--;
      if (restantes >= 1) {
        difundir(TIPOS.GAME_COUNTDOWN, { secondsRemaining: restantes });
      } else {
        cuenta.detener();
        cuenta = null;
        arrancarPartida();
      }
    });
  }

  function arrancarPartida() {
    juego.estado = ESTADO_PARTIDA.WAITING; // iniciar() exige no estar corriendo
    const inicio = juego.iniciar();
    difundir(TIPOS.GAME_STARTED, inicio);
    log(`== partida iniciada con ${inicio.players.length} jugadores ==`);

    bucle = crearReloj(juego.p.tickIntervalMs, () => {
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
        bucle.detener();
        bucle = null;
        const g = juego.jugadores.get(juego.ganadorId);
        log(`== fin: gana ${juego.ganadorId} "${g?.name ?? '?'}" en el tick ${juego.tick} ==`);

        setTimeout(() => {
          log('== reiniciando partida para nuevo juego ==');
          juego.estado = ESTADO_PARTIDA.WAITING;
          juego.tick = 0;
          juego.bandera = { x: 0, y: 0, status: ESTADO_BANDERA.AVAILABLE, carrierId: 0 };
          juego.ganadorId = 0;
          for (const j of juego.jugadores.values()) {
            j.hasFlag = false;
            j.direction = DIRECCIONES.NONE;
          }
          // El anfitrión vuelve a decidir cuándo empieza la siguiente. Con
          // `auto` o con un mínimo fijado, se encadena sola.
          anfitrionId = juego.jugadoresActivos().length
            ? Math.min(...juego.jugadoresActivos().map((j) => j.playerId))
            : 0;
          difundir(TIPOS.LOBBY_STATE, juego.serializarLobby());
          const listos = juego.jugadoresActivos().length;
          if (auto || (minJugadores > 0 && listos >= minJugadores)) {
            arrancarCuenta();
          }
        }, 5000);
      }
    });
  }

  // --- socket TCP ------------------------------------------------------------
  const servidor = net.createServer((socket) => {
    socket.setNoDelay(true); // con un tick de 50 ms, Nagle solo añadiría retardo

    // A quien le desenchufan el cable o suspende el equipo NO le llega ningún
    // FIN, así que el socket queda "abierto" y el jugador nunca se desconecta.
    // Si llevaba la bandera, la partida se queda esperándolo indefinidamente.
    //
    // Se resuelve con keepalive de TCP, no con un tiempo de inactividad de la
    // aplicación: un jugador quieto es perfectamente legítimo (§10 permite la
    // dirección NONE) y echarlo por no mandar mensajes rompería la partida a
    // quien simplemente no se está moviendo. El keepalive vive por debajo del
    // protocolo, así que no cambia nada de lo que se ve en el cable.
    socket.setKeepAlive(true, keepAliveMs);

    const acc = new AcumuladorTCP(
      (msg) => manejar(socket, msg),
      (code, detalle) => {
        enviar(socket, TIPOS.ERROR, { code, description: 'mensaje ilegible' });
        if (verboso) log('  ! marco inválido:', detalle);
      }
    );
    // ¿Viene de esta misma máquina? Es lo que identifica al ANFITRIÓN: quien
    // levantó la partida juega a través de su propio bridge, que corre aquí, y
    // por eso su conexión llega por loopback. Los compañeros llegan desde sus
    // direcciones de la VPN.
    //
    // Se decide por el origen del socket y NO por "el primero que entró": el
    // dueño de la partida es el dueño de la máquina, y eso no cambia porque se
    // salga un momento, ni se le puede pasar a otro sin querer.
    const esLocal = esDeEstaMaquina(socket.remoteAddress);
    conexiones.set(socket, { playerId: 0, acc, esLocal });
    log(`+ conexión desde ${socket.remoteAddress}${esLocal ? '  (anfitrión)' : ''}`);

    socket.on('data', (d) => acc.alimentar(d));
    socket.on('error', () => {}); // un reset no debe tumbar el proceso
    socket.on('close', () => {
      const info = conexiones.get(socket);
      conexiones.delete(socket);
      if (!info?.playerId) return;

      // La baja se ENCOLA: el motor la aplica en el paso 8 de su ciclo (§30.8),
      // así que el evento cae en un tick definido y no en un instante suelto.
      juego.desconectar(info.playerId);
      log('- se fue el jugador', info.playerId);

      // Si se va el ANFITRIÓN se cancela la partida y la sala vuelve a esperar.
      //
      // Antes esto miraba si el jugador era el número 1, pero el 1 es
      // simplemente el primero que entró: si un compañero se conecta antes de
      // que el dueño abra su navegador, el 1 es el compañero. Ahora se compara
      // con el anfitrión de verdad, que es quien juega desde esta máquina.
      //
      // El puesto queda LIBRE, no se hereda: la partida vive en este equipo, y
      // que su dueño salga un momento no convierte a un invitado en dueño. Al
      // volver a entrar lo recupera.
      if (anfitrionId && info.playerId === anfitrionId) {
        anfitrionId = 0;
        log('== se fue el anfitrión: se cancela la partida y la sala queda esperando a que vuelva ==');
        if (bucle) { bucle.detener(); bucle = null; }
        if (cuenta) { cuenta.detener(); cuenta = null; }
        difundir(TIPOS.ERROR, {
          code: ERRORES.GAME_FINISHED,
          description: 'El anfitrión salió. La partida se cancela; podéis esperar a que vuelva.',
        });
        juego.estado = ESTADO_PARTIDA.WAITING;
        juego.tick = 0;
        juego.bandera = { x: 0, y: 0, status: ESTADO_BANDERA.AVAILABLE, carrierId: 0 };
        juego.ganadorId = 0;
      }

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
              // Siempre visible: sin descubrimiento el servidor existe pero
              // nadie lo encuentra, y eso hay que saberlo al arrancar.
              alFallar: (msg) => log(msg),
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
      if (cuenta) { cuenta.detener(); cuenta = null; }
      if (bucle) { bucle.detener(); bucle = null; }
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
  const minJugadores = Number(val('min', 0));
  const nombre = val('name', 'BladeFront');

  const s = crearServidor({
    puerto: Number(val('port', PARAMS_DEFECTO.serverPort)),
    puertoUdp: Number(val('discovery-port', PARAMS_DEFECTO.discoveryPort)),
    params, nombre, auto, minJugadores,
    keepAliveMs: Number(val('keepalive', 10000)),
    udp: !flag('no-udp'),
    verboso: flag('verbose'),
    log: marca,
  });

  const p = await s.escuchar();
  marca(`"${nombre}" escuchando TCP en el puerto ${p}`);
  marca(auto
    ? '(--auto: arranca con el primer jugador — solo para pruebas, nadie más podrá entrar)'
    : minJugadores > 0
      ? `(arranca solo al llegar a ${minJugadores} jugadores)`
      : '(el anfitrión decide cuándo empezar desde el navegador)');

  // Sin esto, Ctrl+C deja el puerto ocupado unos segundos.
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => { await s.cerrar(); process.exit(0); });
  }
}
