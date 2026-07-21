// ============================================================================
//  ClienteCaptura — adaptador para el NAVEGADOR con DOS modos:
//
//   • modo 'local'  → corre el motor (juego-captura.js) dentro del navegador
//                     + bots, SIN red. Sirve para testear el juego siempre,
//                     sin levantar servidor ni bridge.
//   • modo 'red'    → se conecta por WebSocket al BRIDGE, que reenvía por TCP
//                     al servidor oficial. Multijugador real con otros grupos.
//
//  En ambos modos la API es la misma y los eventos salen por un EventTarget
//  (bus), con los nombres del protocolo oficial (GAME_STATE, FLAG_STOLEN…).
//  Así el render (2D de prueba o el 3D de three.js) no sabe ni le importa si
//  está en local o en red: solo escucha el bus y dibuja el último GAME_STATE.
// ============================================================================

import { JuegoCaptura } from '../assets/captura-bandera/js/juego-captura.js';
import { decidirDireccion, reiniciarBots } from '../assets/captura-bandera/js/bots.js';
import { TIPOS, PROTOCOL_VERSION } from './protocolo.js';

export class ClienteCaptura extends EventTarget {
  constructor() {
    super();
    this.modo = null;
    this.playerId = null;
    this.config = null;
    this.ultimoEstado = null; // último GAME_STATE recibido (para render)
    this._ultimoTick = -1;    // §31: ignorar estados con tick menor al último
    // internos de modo local
    this._juego = null;
    this._bots = [];
    this._bucle = null;
    // internos de modo red
    this._ws = null;
  }

  _emitir(type, detail) {
    // §31: un estado con tick menor al último recibido es obsoleto → descartar.
    if (type === TIPOS.GAME_STATE && typeof detail?.tick === 'number') {
      if (detail.tick < this._ultimoTick) return;
      this._ultimoTick = detail.tick;
      this.ultimoEstado = detail;
    } else if (type === TIPOS.GAME_STARTED) {
      this._ultimoTick = -1; // nueva partida: reiniciar el contador de tick
    }
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  // -------------------------------------------------------------------------
  //  MODO LOCAL: motor en el navegador + N bots. Ideal para test.
  // -------------------------------------------------------------------------
  iniciarLocal({ nombre = 'Tú', bots = 5, config = {} } = {}) {
    this.modo = 'local';
    this._ultimoTick = -1;
    reiniciarBots();
    this._juego = new JuegoCaptura(config);

    // El jugador humano + los bots.
    const yo = this._juego.agregarJugador(nombre).jugador;
    this.playerId = yo.playerId;
    this._bots = [];
    for (let i = 0; i < bots; i++) {
      const b = this._juego.agregarJugador('Bot ' + (i + 1)).jugador;
      if (b) this._bots.push(b.playerId);
    }

    const inicio = this._juego.iniciar();
    this.config = { rows: inicio.rows, columns: inicio.columns };
    this._emitir(TIPOS.GAME_STARTED, inicio);

    this._bucle = setInterval(() => {
      // Los bots deciden su dirección con el estado público actual.
      const estado = this._juego.serializarEstado();
      for (const id of this._bots) {
        const jp = estado.players.find((p) => p.playerId === id);
        if (jp) this._juego.cambiarDireccion(id, decidirDireccion(jp, estado, this._juego.cfg, this._juego.obstaculos));
      }
      const { eventos, estado: st } = this._juego.ciclo();
      for (const ev of eventos) this._emitir(ev.type, ev);
      this._emitir(TIPOS.GAME_STATE, this._juego.serializarEstado());
      if (st === 'FINISHED') this.detener();
    }, this._juego.cfg.movementIntervalMs);
  }

  // -------------------------------------------------------------------------
  //  MODO RED: WebSocket al bridge → TCP al servidor oficial.
  // -------------------------------------------------------------------------
  conectar(urlBridge, nombre) {
    this.modo = 'red';
    return new Promise((resolver, rechazar) => {
      this._ws = new WebSocket(urlBridge);
      this._ws.onopen = () => this._enviar(TIPOS.JOIN, { name: nombre });
      this._ws.onerror = (e) => rechazar(e);
      // Si el bridge/servidor cae DESPUÉS de conectar, avisar al render (si no,
      // el juego "se congela" sin explicación al dejar de llegar GAME_STATE).
      this._ws.onclose = () => {
        if (this.modo === 'red') this._emitir(TIPOS.ERROR, { code: 'CONNECTION_LOST', description: 'Conexión con el servidor perdida' });
      };
      this._ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        switch (msg.type) {
          case TIPOS.JOIN_ACCEPTED:
            this.playerId = msg.playerId;
            resolver(this.playerId);
            break;
          case TIPOS.JOIN_REJECTED:
            rechazar(new Error('JOIN rechazado: ' + msg.reason));
            break;
          case TIPOS.GAME_STARTED:
            this.config = { rows: msg.rows, columns: msg.columns };
            this._emitir(TIPOS.GAME_STARTED, msg);
            break;
          default:
            this._emitir(msg.type, msg); // GAME_STATE, FLAG_*, GAME_OVER, ERROR…
        }
      };
    });
  }

  _enviar(type, campos = {}) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type, protocolVersion: PROTOCOL_VERSION, ...campos }));
    }
  }

  // -------------------------------------------------------------------------
  //  API común para el render/input, funciona igual en local y en red.
  // -------------------------------------------------------------------------
  cambiarDireccion(direction) {
    if (this.modo === 'local') {
      this._juego?.cambiarDireccion(this.playerId, direction);
    } else {
      this._enviar(TIPOS.CHANGE_DIRECTION, { gameId: 'GAME-001', playerId: this.playerId, direction });
    }
  }

  detener() {
    if (this._bucle) { clearInterval(this._bucle); this._bucle = null; }
    if (this._ws) {
      this._ws.onclose = null; // cierre intencional: no disparar "conexión perdida"
      try { this._enviar(TIPOS.LEAVE, { playerId: this.playerId }); this._ws.close(); } catch {}
      this._ws = null;
    }
  }
}
