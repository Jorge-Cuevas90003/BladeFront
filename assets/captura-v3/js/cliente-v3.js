// ============================================================================
//  Cliente del PRFC v3 para el navegador.
//
//  Presenta la MISMA superficie en los dos modos, para que el visor 3D no sepa
//  ni le importe cuál está activo:
//
//    · local : corre MotorV3 aquí mismo y mueve bots. Sin red, sin bridge.
//    · red   : WebSocket al bridge, que lo traduce a TCP contra el servidor.
//
//  Los eventos que emite son los del protocolo (TIPOS.*), así que el visor
//  reacciona igual venga de donde venga.
//
//  Regla §31: se descarta todo GAME_STATE con un tick menor al último visto.
//  Sin esa guarda, un paquete que llega tarde haría saltar a los jugadores
//  hacia atrás.
// ============================================================================

import {
  TIPOS, VERSION, DIRECCIONES, ESTADO_PARTIDA, ESTADO_BANDERA, PARAMS_DEFECTO,
  enmarcar, AcumuladorTCP,
} from '../../../red/v3/protocolo-v3.js';
import { crearReloj } from '../../../red/v3/reloj.js';
import { MotorV3 } from './motor-v3.js';
import { decidirBot, reiniciarBots } from './bots-v3.js';

export class ClienteV3 extends EventTarget {
  constructor() {
    super();
    this.modo = null;          // 'local' | 'red'
    this.playerId = 0;
    this.gameId = 0;
    this.cfg = { ...PARAMS_DEFECTO };
    this.estado = null;        // último GAME_STATE válido
    this.inicio = null;        // GAME_STARTED
    this.conectado = false;

    this._ws = null;
    this._acc = null;
    this._motor = null;
    this._bucle = null;
    this._bots = [];
    this._ultimoTick = -1;
    this._cerrandoAdrede = false;
    this._esperaJoin = null;

    // Lo dice el servidor, no se adivina. En local siempre mandas tú.
    this.hostId = 0;
    this.soyAnfitrion = false;
    this.puedoEmpezar = false;
  }

  // --- emisión interna -------------------------------------------------------
  _emitir(type, detalle) {
    // §31: los estados viejos se ignoran. Se compara solo el GAME_STATE porque
    // es el único mensaje con número de tick que puede llegar desordenado.
    if (type === TIPOS.GAME_STATE) {
      if (typeof detalle.tick === 'number' && detalle.tick < this._ultimoTick) return;
      this._ultimoTick = detalle.tick;
      this.estado = detalle;
    } else if (type === TIPOS.GAME_STARTED) {
      this._ultimoTick = -1;
      this.inicio = detalle;
      this.cfg = {
        ...this.cfg,
        mapSize: detalle.mapSize,
        circleRadius: detalle.circleRadius,
        playerRadius: detalle.playerRadius,
        playerSpeed: detalle.playerSpeed,
        interactionRadius: detalle.interactionRadius,
        tickIntervalMs: detalle.tickIntervalMs,
      };
    }
    this.dispatchEvent(new CustomEvent(String(type), { detail: detalle }));
  }

  // Nombre del jugador tal como lo conoce el cliente (para el HUD).
  nombreDe(playerId) {
    const enInicio = this.inicio?.players.find((p) => p.playerId === playerId);
    if (enInicio) return enInicio.name;
    const enLobby = this._lobby?.players.find((p) => p.playerId === playerId);
    return enLobby?.name ?? `Jugador ${playerId}`;
  }

  // ==========================================================================
  //  MODO LOCAL
  // ==========================================================================
  iniciarLocal({ nombre = 'Templario', bots = 5, params = {} } = {}) {
    this.detener();
    this.modo = 'local';
    this._ultimoTick = -1;
    reiniciarBots();

    const motor = new MotorV3({ ...params });
    this._motor = motor;

    const yo = motor.agregarJugador(nombre).jugador;
    this.playerId = yo.playerId;
    this.gameId = motor.gameId;
    this._bots = [];
    for (let i = 0; i < bots; i++) {
      const b = motor.agregarJugador(NOMBRES_BOT[i % NOMBRES_BOT.length]).jugador;
      if (b) this._bots.push(b.playerId);
    }

    this.conectado = true;
    this.hostId = this.playerId;
    this.soyAnfitrion = true;
    this.puedoEmpezar = false;   // en local arranca sola, no hay a quién esperar
    this._emitir(TIPOS.JOIN_ACCEPTED, { playerId: this.playerId, gameId: this.gameId });
    this._lobby = motor.serializarLobby();
    this._emitir(TIPOS.LOBBY_STATE, this._lobby);

    // Cuenta atrás abreviada: en local no hay nadie a quien esperar, pero se
    // conserva el mensaje para que el visor use el mismo camino que en red.
    let restantes = Math.min(3, motor.p.countdownSeconds);
    this._emitir(TIPOS.GAME_COUNTDOWN, { secondsRemaining: restantes });
    const cuenta = setInterval(() => {
      restantes--;
      if (restantes >= 1) {
        this._emitir(TIPOS.GAME_COUNTDOWN, { secondsRemaining: restantes });
      } else {
        clearInterval(cuenta);
        if (this._motor !== motor) return; // se detuvo mientras contaba
        this._emitir(TIPOS.GAME_STARTED, motor.iniciar());
        this._arrancarBucleLocal(motor);
      }
    }, 1000);
    this._cuentaLocal = cuenta;
  }

  _arrancarBucleLocal(motor) {
    this._bucle = crearReloj(motor.p.tickIntervalMs, () => {
      // Los bots deciden con lo MISMO que ve un cliente de red: el GAME_STATE.
      const visible = motor.serializarEstado();
      for (const id of this._bots) {
        const j = visible.players.find((p) => p.playerId === id);
        if (!j) continue;
        const { direction, interactuar } = decidirBot(j, visible, motor.p);
        motor.encolarInput(id, direction);
        if (interactuar) motor.encolarInteract(id);
      }

      const { eventos, estado } = motor.ciclo();
      // Mismo orden que el servidor (§29.11).
      for (const ev of eventos) if (ev.type !== TIPOS.GAME_OVER) this._emitir(ev.type, ev);
      this._emitir(TIPOS.GAME_STATE, motor.serializarEstado());
      for (const ev of eventos) if (ev.type === TIPOS.GAME_OVER) this._emitir(ev.type, ev);

      if (estado === ESTADO_PARTIDA.FINISHED) {
        this._bucle.detener();
        this._bucle = null;
      }
    });
  }

  // ==========================================================================
  //  MODO RED (a través del bridge)
  // ==========================================================================
  conectar({ url = 'ws://localhost:8146', nombre = 'Templario', host, port } = {}) {
    this.detener();
    this.modo = 'red';
    this._ultimoTick = -1;
    this._cerrandoAdrede = false;

    // El destino TCP puede elegirse sin relanzar el bridge.
    const q = new URLSearchParams();
    if (host) q.set('host', host);
    if (port) q.set('port', String(port));
    const destino = q.toString() ? `${url}?${q}` : url;
    console.log('%c[RED-WS]%c 🔌 Conectando WebSocket ->', 'background: #0284c7; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;', 'color: inherit', destino);

    const ws = new WebSocket(destino);
    ws.binaryType = 'arraybuffer';
    this._ws = ws;

    this._acc = new AcumuladorTCP(
      (msg) => this._recibir(msg),
      (code, det) => this._emitir(TIPOS.ERROR, { code, description: 'marco inválido: ' + det })
    );

    ws.onopen = () => {
      this.conectado = true;
      console.log('%c[RED-WS]%c ✅ Conexión establecida. Enviando JOIN:', 'background: #16a34a; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;', 'color: inherit', { name: nombre });
      ws.send(enmarcar(TIPOS.JOIN, { name: nombre }));
      // Abrir el WebSocket solo confirma que hablamos con el bridge local. La
      // conexión no está lista hasta que el servidor remoto entiende JOIN y
      // devuelve JOIN_ACCEPTED/JOIN_REJECTED.
      this._esperaJoin = setTimeout(() => {
        this._esperaJoin = null;
        if (this.playerId || this._cerrandoAdrede) return;
        try { ws.close(4003, 'sin respuesta compatible al JOIN'); } catch {}
      }, 5000);
    };
    ws.onmessage = (ev) => this._acc.alimentar(new Uint8Array(ev.data));
    ws.onerror = (e) => {
      console.warn('%c[RED-WS]%c ⚠️ Error en socket WebSocket', 'background: #dc2626; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;', 'color: inherit', e);
      if (!this._cerrandoAdrede) {
        this._emitir(TIPOS.ERROR, { code: 0, description: 'no se pudo hablar con el bridge' });
      }
    };
    ws.onclose = (ev) => {
      if (this._esperaJoin) { clearTimeout(this._esperaJoin); this._esperaJoin = null; }
      this.conectado = false;
      console.log('%c[RED-WS]%c 🔌 Conexión cerrada (code ' + ev.code + ')', 'background: #64748b; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;', 'color: inherit');
      if (this._cerrandoAdrede) return;
      // 4001 lo pone el bridge cuando el servidor de juego no responde: así se
      // distingue "no hay servidor" de "se cayó el bridge".
      const razon = (ev.reason || '').trim();
      const desc = ev.code === 4001
        ? `no se pudo abrir TCP con el servidor${razon ? `: ${razon}` : ''}`
        : ev.code === 4002
          ? `el servidor cerró la conexión después de abrir TCP${razon ? `: ${razon}` : ''}`
          : ev.code === 4003
            ? 'el servidor no respondió al JOIN o usa un protocolo incompatible'
            : 'se perdió la conexión con el bridge';
      this._emitir(TIPOS.ERROR, { code: 0, description: desc });
    };
  }

  _recibir(msg) {
    if (msg.ver !== VERSION) return;
    const nombresTipo = {
      0x02: 'DISCOVER_RESPONSE', 0x20: 'JOIN_ACCEPTED', 0x21: 'JOIN_REJECTED',
      0x22: 'LOBBY_STATE', 0x23: 'GAME_COUNTDOWN', 0x24: 'GAME_STARTED',
      0x25: 'GAME_STATE', 0x26: 'FLAG_PICKED_UP', 0x27: 'FLAG_DROPPED',
      0x28: 'GAME_OVER', 0x29: 'HOST_INFO', 0x00: 'ERROR',
    };
    const tNombre = nombresTipo[msg.type] || ('0x' + msg.type.toString(16));
    if (msg.type !== TIPOS.GAME_STATE) {
      console.log('%c[RED-RECV]%c 📥 ' + tNombre, 'background: #9333ea; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;', 'color: inherit', msg);
    }

    switch (msg.type) {
      case TIPOS.JOIN_ACCEPTED:
        if (this._esperaJoin) { clearTimeout(this._esperaJoin); this._esperaJoin = null; }
        this.playerId = msg.playerId;
        this.gameId = msg.gameId;
        console.log('%c[RED]%c 🎉 JOIN_ACCEPTED -> Asignado ID #' + msg.playerId + ', Partida #' + msg.gameId, 'background: #16a34a; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;', 'color: inherit');
        this.consultarAnfitrion();
        break;
      case TIPOS.JOIN_REJECTED:
        if (this._esperaJoin) { clearTimeout(this._esperaJoin); this._esperaJoin = null; }
        break;
      case TIPOS.LOBBY_STATE:
        this._lobby = msg;
        this.consultarAnfitrion();
        break;

      case TIPOS.HOST_INFO:
        this.hostId = msg.hostId;
        this.soyAnfitrion = msg.hostId !== 0 && msg.hostId === this.playerId;
        this.puedoEmpezar = msg.puedesEmpezar;
        console.log('%c[RED-HOST]%c 👑 Anfitrión ID #' + msg.hostId + ' | ¿Soy Anfitrión?: ' + (this.soyAnfitrion ? 'SÍ' : 'NO') + ' | ¿Puedo Empezar?: ' + (this.puedoEmpezar ? 'SÍ' : 'NO'), 'background: #d97706; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;', 'color: inherit');
        break;
    }
    this._emitir(msg.type, msg);
  }

  // Pregunta al bridge por las partidas de la red. El navegador no puede hacer
  // broadcast UDP ni sondear direcciones, así que lo hace el bridge.
  //
  // Por defecto el bridge difunde por CADA interfaz local a su dirección de
  // difusión dirigida. Eso es lo que alcanza a los compañeros de Radmin VPN:
  // la red virtual reparte direcciones por todo el 26.0.0.0/8, así que barrer
  // la subred propia no sirve de nada y difundir a 255.255.255.255 sin atar el
  // socket sale por la interfaz por defecto, que no es la de la VPN.
  //
  //   ips : direcciones concretas a preguntar. La red de seguridad para cuando
  //         la difusión tampoco atraviesa el adaptador virtual.
  //
  // Devuelve { servidores, avisos, exploracion }. `exploracion.difusiones` dice
  // por qué interfaces se preguntó y si cada una funcionó: es la diferencia
  // entre "no hay nadie" y "no miré ahí".
  static async buscarServidores(urlBridge = 'http://localhost:8146', {
    esperaMs = 800, ips = [],
  } = {}) {
    // El sondeo automático debe ser liviano y ajustarse al protocolo:
    // broadcast UDP 5001. El roster y los vecinos de Radmin se muestran en la
    // interfaz, pero no se les envían consultas UDP individuales ni se abren
    // conexiones TCP a decenas de equipos en cada actualización.
    const q = new URLSearchParams({
      espera: String(esperaMs),
      roster: '1',
      vecinos: '1',
      sondeo: '0',
      listar: '1',
      tcp: '0',
      puerto: '5001',
    });
    if (ips.length) q.set('ips', ips.join(','));
    const r = await fetch(`${urlBridge}/servidores?${q}`);
    if (!r.ok) throw new Error('el bridge respondió ' + r.status);
    const datos = await r.json();
    return {
      servidores: datos.servidores ?? [],
      avisos: datos.avisos ?? [],
      exploracion: datos.exploracion ?? null,
    };
  }

  // ==========================================================================
  //  INTENCIÓN DEL JUGADOR
  // ==========================================================================
  mandarDireccion(direction) {
    if (!this.playerId) return;
    if (this.modo === 'local') {
      this._motor?.encolarInput(this.playerId, direction);
    } else if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(enmarcar(TIPOS.INPUT, { playerId: this.playerId, direction }));
    }
  }

  // Preguntar quién manda. La respuesta llega en HOST_INFO y actualiza
  // `soyAnfitrion` y `hostId`.
  //
  // Se pregunta en vez de deducirlo del id más bajo: el anfitrión es quien
  // aloja la partida en su máquina, no quien llegó primero. Si un compañero se
  // conecta antes de que el dueño abra su navegador, el id más bajo es el del
  // compañero y la deducción daría el mando a quien no le toca.
  consultarAnfitrion() {
    if (this.modo !== 'red' || !this.playerId) return;
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(enmarcar(TIPOS.HOST_QUERY, { playerId: this.playerId }));
    }
  }

  interactuar() {
    if (!this.playerId) return;
    if (this.modo === 'local') {
      this._motor?.encolarInteract(this.playerId);
    } else if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(enmarcar(TIPOS.INTERACT, { playerId: this.playerId }));
    }
  }

  detener() {
    this._cerrandoAdrede = true;
    if (this._esperaJoin) { clearTimeout(this._esperaJoin); this._esperaJoin = null; }
    if (this._bucle) { this._bucle.detener(); this._bucle = null; }
    if (this._cuentaLocal) { clearInterval(this._cuentaLocal); this._cuentaLocal = null; }
    if (this._ws) {
      try {
        if (this._ws.readyState === WebSocket.OPEN && this.playerId) {
          this._ws.send(enmarcar(TIPOS.LEAVE, { playerId: this.playerId }));
        }
        this._ws.close();
      } catch {}
      this._ws = null;
    }
    this._motor = null;
    this._acc = null;
    this._bots = [];
    this.playerId = 0;
    this.estado = null;
    this.inicio = null;
    this._lobby = null;
    this.conectado = false;
    this.hostId = 0;
    this.soyAnfitrion = false;
    this.puedoEmpezar = false;
    this._ultimoTick = -1;
  }
}

const NOMBRES_BOT = [
  'Ejecutor', 'Custodio', 'Heraldo', 'Centinela', 'Inquisidor',
  'Alabardero', 'Cruzado', 'Guardián', 'Vindicador', 'Adalid',
  'Paladín', 'Lancero', 'Escudero', 'Verdugo', 'Ariete',
];

export { DIRECCIONES, ESTADO_BANDERA, ESTADO_PARTIDA, TIPOS };
