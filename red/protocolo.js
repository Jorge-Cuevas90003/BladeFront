// ============================================================================
//  Protocolo "Captura la Bandera" v1.0 — piezas COMPARTIDAS por servidor,
//  bridge y cliente. ES module sin dependencias (corre en Node y navegador).
//
//  Transporte real: TCP + UTF-8 + "un JSON por línea, terminado en \n" (§23, §24).
//  El envelope lleva { type, protocolVersion, ... } con los campos a nivel raíz (§26).
// ============================================================================

export const PROTOCOL_VERSION = '1.0';

// Tipos de mensaje (§28, §29, §33).
export const TIPOS = {
  // cliente → servidor
  JOIN: 'JOIN',
  CHANGE_DIRECTION: 'CHANGE_DIRECTION',
  LEAVE: 'LEAVE',
  // servidor → cliente
  JOIN_ACCEPTED: 'JOIN_ACCEPTED',
  JOIN_REJECTED: 'JOIN_REJECTED',
  GAME_STARTED: 'GAME_STARTED',
  GAME_STATE: 'GAME_STATE',
  FLAG_PICKED_UP: 'FLAG_PICKED_UP',
  FLAG_STOLEN: 'FLAG_STOLEN',
  PLAYER_DISCONNECTED: 'PLAYER_DISCONNECTED',
  GAME_OVER: 'GAME_OVER',
  ERROR: 'ERROR',
};

// Códigos de error mínimos (§29.9).
export const ERRORES = {
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  INVALID_JSON: 'INVALID_JSON',
  INVALID_DIRECTION: 'INVALID_DIRECTION',
  UNKNOWN_PLAYER: 'UNKNOWN_PLAYER',
  GAME_NOT_STARTED: 'GAME_NOT_STARTED',
  GAME_ALREADY_STARTED: 'GAME_ALREADY_STARTED',
  GAME_FINISHED: 'GAME_FINISHED',
  UNSUPPORTED_PROTOCOL_VERSION: 'UNSUPPORTED_PROTOCOL_VERSION',
};

// Serializa un mensaje a "JSON + \n" listo para escribir en el socket (§24).
// El spread va PRIMERO para que type/protocolVersion siempre sean los correctos
// y ningún campo del evento pueda pisarlos por accidente.
export function enmarcar(type, campos = {}) {
  return JSON.stringify({ ...campos, type, protocolVersion: PROTOCOL_VERSION }) + '\n';
}

// Tamaño máximo de una línea sin terminar. Un cliente que mande bytes sin \n
// no debe poder crecer el buffer del servidor sin límite (protección básica).
const MAX_LINEA = 64 * 1024;

// ---------------------------------------------------------------------------
//  Lector de líneas para TCP. Un socket NO respeta límites de mensaje: un
//  chunk puede traer media línea o varias juntas. Este helper acumula bytes
//  y entrega mensajes completos (uno por \n). Uso:
//    const lector = new LectorLineas(obj => manejar(obj));
//    socket.on('data', d => lector.alimentar(d));
// ---------------------------------------------------------------------------
export class LectorLineas {
  constructor(onMensaje, onError = () => {}) {
    this._buf = '';
    this._onMensaje = onMensaje;
    this._onError = onError;
  }

  alimentar(chunk) {
    this._buf += chunk.toString('utf8');
    // Línea gigante sin \n → cliente roto o malicioso: descartar y avisar.
    if (this._buf.length > MAX_LINEA && this._buf.indexOf('\n') < 0) {
      this._buf = '';
      this._onError(ERRORES.INVALID_MESSAGE, '(línea excede el máximo)');
      return;
    }
    let i;
    while ((i = this._buf.indexOf('\n')) >= 0) {
      const linea = this._buf.slice(0, i);
      this._buf = this._buf.slice(i + 1);
      if (!linea.trim()) continue;
      let obj;
      try {
        obj = JSON.parse(linea);
      } catch {
        this._onError(ERRORES.INVALID_JSON, linea);
        continue;
      }
      this._onMensaje(obj);
    }
  }
}
