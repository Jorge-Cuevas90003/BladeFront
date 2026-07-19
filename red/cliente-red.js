// ClienteRed — adaptador navegador ↔ VOID-NET v0.1 (ESQUELETO para el equipo).
// Puente entre el socket y el juego existente: los EVENT del servidor se
// re-emiten en un EventTarget local con los MISMOS nombres que ya escuchan
// el HUD, las partículas, las runas y el audio.
//
// Uso previsto en main.js (modo red):
//   import { ClienteRed } from '../../red/cliente-red.js';
//   const red = new ClienteRed(NetworkBus);
//   await red.conectar('ws://IP-DEL-SERVIDOR:8140', 'MiNombre');
//   // cada frame:  red.enviarInput(inputVec, acciones); red.tick(t);

const ACCION = { TACKLE: 1, DODGE: 2, SLAM: 4 };

export class ClienteRed {
  constructor(bus) {
    this.bus = bus;           // NetworkBus del juego (EventTarget)
    this.ws = null;
    this.id = null;
    this.config = null;
    this.seq = 0;
    this.latencia = 0;
    this.snapshots = [];      // búfer para interpolación (~100 ms)
  }

  conectar(url, nombre) {
    return new Promise((resolver, rechazar) => {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => this._enviar('HELLO', { nombre });
      this.ws.onerror = (e) => rechazar(e);
      this.ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        switch (msg.t) {
          case 'WELCOME':
            this.id = msg.data.id;
            this.config = msg.data.config;
            resolver(this.id);
            break;
          case 'SNAPSHOT':
            this.snapshots.push({ recibido: performance.now(), ...msg.data });
            if (this.snapshots.length > 30) this.snapshots.shift();
            break;
          case 'EVENT': {
            // puente directo al juego: mismas señales que el modo local
            const { tipo, ...detalle } = msg.data;
            this.bus.dispatchEvent(new CustomEvent(tipo, { detail: detalle }));
            break;
          }
          case 'PONG':
            this.latencia = Date.now() - msg.data.ts;
            break;
          case 'ADIOS':
            // TODO(equipo): retirar el avatar remoto de la escena
            break;
        }
      };
    });
  }

  _enviar(t, data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ v: 1, t, seq: this.seq++, ts: Date.now(), data }));
    }
  }

  // mov: THREE.Vector3 del input local · flags: { tackle, dodge, slam }
  enviarInput(mov, flags = {}) {
    let acciones = 0;
    if (flags.tackle) acciones |= ACCION.TACKLE;
    if (flags.dodge) acciones |= ACCION.DODGE;
    if (flags.slam) acciones |= ACCION.SLAM;
    this._enviar('INPUT', { seq: this.seq, mov: [mov.x, mov.z], acciones });
  }

  // Estado interpolado para renderizar (llamar cada frame).
  // TODO(equipo): interpolar entre los dos snapshots que rodean
  //   (performance.now() - 100ms); extrapolar máx. 50 ms si falta el segundo.
  //   Aplicar a los grupos de knights remotos y derivar su velocidad para
  //   que KnightAnimator.locomotion() anime la marcha localmente.
  estadoInterpolado() {
    return this.snapshots[this.snapshots.length - 1] ?? null; // stub: último
  }

  medirLatencia() { this._enviar('PING', {}); }
}

export { ACCION };
