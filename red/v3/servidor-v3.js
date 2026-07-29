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
import http from 'node:http';
import os from 'node:os';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  TIPOS, VERSION, ERRORES, RAZON_RECHAZO, ESTADO_PARTIDA, ESTADO_BANDERA,
  DIRECCIONES, PARAMS_DEFECTO, NOMBRE_TIPO, enmarcar, AcumuladorTCP,
} from './protocolo-v3.js';
import { MotorV3 } from '../../assets/captura-v3/js/motor-v3.js';
import { publicarServidor } from './descubrimiento.js';
import { crearReloj } from './reloj.js';

// Loopback o cualquier interfaz local de esta máquina (incluida la IP de Radmin VPN).
function esDeEstaMaquina(dir) {
  if (!dir) return false;
  const limpia = String(dir).replace(/^::ffff:/i, '');
  if (limpia === '::1' || limpia === '127.0.0.1' || limpia.startsWith('127.')) return true;
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.address === limpia) return true;
    }
  }
  return false;
}

export function crearServidor({
  puerto = PARAMS_DEFECTO.serverPort,
  host = undefined,
  params = {},
  nombre = 'BladeFront',
  auto = false,
  minJugadores = 0,   // 0 = no arrancar solo; espera el inicio administrativo
  udp = true,
  puertoUdp = PARAMS_DEFECTO.discoveryPort,
  monitorPort = null,
  monitorHost = '127.0.0.1',
  servidorEstricto = false,
  keepAliveMs = 10000,
  // Margen de cortesía entre el GAME_OVER y el desalojo: el tiempo que se les
  // deja a todos para ver quién ganó antes de cortarles la conexión.
  msTrasFinal = 4000,
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
  let monitor = null;

  // Vista administrativa local. No usa el protocolo de juego, no crea un
  // jugador y no escucha en Radmin: únicamente expone una instantánea de solo
  // lectura por loopback para la pantalla del servidor.
  const instantaneaMonitor = () => ({
    serverName: nombre,
    state: juego.estado,
    tick: juego.tick,
    params: {
      mapSize: juego.p.mapSize,
      circleRadius: juego.p.circleRadius,
      playerRadius: juego.p.playerRadius,
      tickIntervalMs: juego.p.tickIntervalMs,
    },
    flag: {
      x: juego.bandera.x,
      y: juego.bandera.y,
      status: juego.bandera.status,
      carrierId: juego.bandera.carrierId,
    },
    winner: juego.ganadorId
      ? {
          playerId: juego.ganadorId,
          name: juego.jugadores.get(juego.ganadorId)?.name ?? `#${juego.ganadorId}`,
        }
      : null,
    players: juego.jugadoresActivos().map((j) => ({
      playerId: j.playerId,
      name: j.name,
      x: j.x,
      y: j.y,
      direction: j.direction,
      hasFlag: j.hasFlag,
    })),
  });

  const crearMonitor = () => {
    if (monitorPort === null || monitorPort === undefined) return Promise.resolve();
    monitor = http.createServer((req, res) => {
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('cache-control', 'no-store');
      if (req.method === 'GET' && req.url === '/estado') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(instantaneaMonitor()));
      }
      if (req.method === 'GET' && req.url === '/salud') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ ok: true }));
      }
      if (req.method === 'POST' && req.url === '/empezar') {
        if (!servidorEstricto) {
          res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ ok: false, error: 'control local desactivado' }));
        }
        if (juego.estado !== ESTADO_PARTIDA.WAITING) {
          res.writeHead(409, { 'content-type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ ok: false, error: 'la partida ya empezó' }));
        }
        if (juego.jugadoresActivos().length === 0) {
          res.writeHead(409, { 'content-type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ ok: false, error: 'no hay jugadores conectados' }));
        }
        arrancarCuenta();
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ ok: true }));
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('No encontrado');
    });
    return new Promise((resolve, reject) => {
      monitor.once('error', reject);
      monitor.listen(monitorPort, monitorHost, () => {
        monitor.off('error', reject);
        resolve();
      });
    });
  };

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

        // El nombre es descriptivo, no la identidad de red: esa identidad es el
        // playerId asignado por el servidor. Antes se marcaba como desconectado
        // a cualquier jugador activo con el mismo nombre. Como todos arrancan
        // con "Templario", el primer invitado expulsaba silenciosamente al
        // anfitrión y la sala quedaba diciendo que no estaba conectado.
        const { jugador, error } = juego.agregarJugador(msg.name);
        if (error) return enviar(socket, TIPOS.JOIN_REJECTED, { reason: error });

        info.playerId = jugador.playerId;
        enviar(socket, TIPOS.JOIN_ACCEPTED, { playerId: jugador.playerId, gameId: juego.gameId });
        log(`  JOIN ${jugador.playerId} "${jugador.name}"`);
        difundir(TIPOS.LOBBY_STATE, juego.serializarLobby());

        // El servidor estricto no crea un jugador propio. Conserva el dato del
        // anfitrión jugable para el lobby, pero solo el monitor inicia. En el
        // modo clásico, el anfitrión sigue siendo el cliente local.
        if ((servidorEstricto || info.esLocal)
            && (!anfitrionId || !juego.jugadores.get(anfitrionId)?.connected)) {
          anfitrionId = jugador.playerId;
          log(`  ${jugador.playerId} es el anfitrión jugable`);
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
        // Con roles separados, la salida pertenece exclusivamente al monitor
        // administrativo local. Los clientes nunca pueden iniciar.
        if (servidorEstricto) {
          return enviar(socket, TIPOS.ERROR, {
            code: ERRORES.UNKNOWN_PLAYER,
            description: 'solo la vista del servidor puede empezar la partida',
          });
        }
        // En servidor estricto el anfitrión es el primer cliente conectado; en
        // modo clásico también debe ser una conexión local.
        const anfitrionAutorizado = info.playerId === anfitrionId
          && (servidorEstricto || info.esLocal);
        if (!anfitrionAutorizado) {
          return enviar(socket, TIPOS.ERROR, {
            code: ERRORES.UNKNOWN_PLAYER,
            description: 'solo el anfitrión puede empezar la partida',
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
          puedesEmpezar: !!(!servidorEstricto
                            && info.esLocal
                            && info.playerId === anfitrionId
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

        // Margen de cortesía para que a todos les dé tiempo a ver el resultado
        // antes de que se les eche.
        setTimeout(desalojarYReiniciar, msTrasFinal);
      }
    });
  }

  // ---------------------------------------------------------------------------
  //  Desalojo y vuelta a empezar.
  //
  //  Cerrar los sockets NO basta y ese fue el fallo: el mapa `conexiones` se
  //  vaciaba en el acto, pero Node emite los 'close' de los sockets en el
  //  siguiente turno del bucle de eventos. Cuando el manejador de 'close'
  //  llegaba, ya no encontraba su entrada, se salía por la primera línea y no
  //  daba de baja a nadie. Los jugadores se quedaban dentro del motor marcados
  //  como conectados: la sala siguiente los listaba, contaban para el aforo y
  //  tras unas partidas el servidor rechazaba con GAME_FULL sin nadie dentro.
  //
  //  Ahora el orden es al revés: primero se vacía el motor —que es la fuente de
  //  la verdad— y luego se cierran los sockets. Los 'close' que lleguen tarde
  //  encuentran una sala ya limpia y no tienen nada que deshacer, así que da
  //  igual cuándo lleguen.
  // ---------------------------------------------------------------------------
  function desalojarYReiniciar(motivo = 'La partida ha finalizado.') {
    if (bucle) { bucle.detener(); bucle = null; }
    if (cuenta) { cuenta.detener(); cuenta = null; }

    const cuantos = juego.jugadores.size;
    juego.reiniciarSala();
    anfitrionId = 0;

    // Marcar la conexión como "ya desalojada" antes de cerrarla: así el 'close'
    // que llegue después sabe que su baja ya está hecha y no toca nada.
    for (const [sock, info] of conexiones.entries()) {
      info.playerId = 0;
      info.desalojado = true;
      try { enviar(sock, TIPOS.ERROR, { code: ERRORES.GAME_FINISHED, description: motivo }); } catch {}
      try { sock.end(); } catch {}
    }
    conexiones.clear();
    log(`== sala vaciada: ${cuantos} jugador(es) desalojado(s), esperando una partida nueva ==`);
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
      // Sin playerId no había jugador al que dar de baja. `desalojado` marca a
      // quien ya se limpió al terminar la partida: su 'close' llega después de
      // que la sala se vaciara y no queda nada que deshacer.
      if (!info?.playerId || info.desalojado) return;

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
        for (const j of juego.jugadores.values()) j.hasFlag = false;
      }

      // La baja va DESPUÉS de decidir si la partida se cancela, y no antes: el
      // motor la aplica en el acto si la sala está parada y la encola para el
      // paso 8 del ciclo (§30.8) si sigue corriendo. Al revés, la baja del
      // anfitrión se encolaba y acto seguido se paraba el bucle que tenía que
      // procesarla, y se quedaba dentro para siempre.
      //
      // Y aquí NO se toca `connected` a mano. Ponerlo a false justo después de
      // encolar hacía que el paso 8 se saltara la baja —comprueba
      // `if (!j.connected) continue`—, así que no se emitía
      // PLAYER_DISCONNECTED y, si el que se iba llevaba la bandera, no la
      // soltaba: se quedaba pegada a alguien que ya no estaba y la partida no
      // podía terminar nunca.
      juego.desconectar(info.playerId);
      if (juego.jugadoresActivos().length === 0) anfitrionId = 0;

      if (juego.estado === ESTADO_PARTIDA.WAITING || juego.estado === ESTADO_PARTIDA.STARTING) {
        difundir(TIPOS.LOBBY_STATE, juego.serializarLobby());
      }
    });
  });

  return {
    juego,
    servidor,
    get puerto() { return servidor.address()?.port ?? puerto; },

    async escuchar() {
      const p = await new Promise((resolve) => {
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
      try {
        await crearMonitor();
      } catch (e) {
        await new Promise((resolve) => servidor.close(resolve));
        throw e;
      }
      return p;
    },

    cerrar() {
      if (cuenta) { cuenta.detener(); cuenta = null; }
      if (bucle) { bucle.detener(); bucle = null; }
      try { discovery?.cerrar(); } catch {}
      try { monitor?.close(); } catch {}
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
    monitorPort: Number(val('monitor', 8147)),
    servidorEstricto: flag('strict-host'),
    params, nombre, auto, minJugadores,
    keepAliveMs: Number(val('keepalive', 10000)),
    udp: !flag('no-udp'),
    verboso: flag('verbose'),
    log: marca,
  });

  const p = await s.escuchar();
  marca(`"${nombre}" escuchando TCP en el puerto ${p}`);
  marca(`vista local del servidor en http://127.0.0.1:${Number(val('monitor', 8147))}`);
  marca(auto
    ? '(--auto: arranca con el primer jugador — solo para pruebas, nadie más podrá entrar)'
    : minJugadores > 0
      ? `(arranca solo al llegar a ${minJugadores} jugadores)`
      : flag('strict-host')
        ? '(la partida se inicia desde la vista administrativa del servidor)'
        : '(el anfitrión decide cuándo empezar desde el navegador)');

  // Sin esto, Ctrl+C deja el puerto ocupado unos segundos.
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => { await s.cerrar(); process.exit(0); });
  }
}
