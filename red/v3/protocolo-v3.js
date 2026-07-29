// ============================================================================
//  PRFC-CC8-2026 v3 — códec BINARIO compartido por servidor, bridge y cliente.
//
//  Sin dependencias y sin Buffer: trabaja con Uint8Array/DataView, así que el
//  MISMO archivo corre en Node y en el navegador.
//
//  Transporte (§22, §23):
//    · TCP  → cada mensaje va precedido de un u16 big-endian con su longitud.
//    · UDP  → el datagrama ES el mensaje completo, sin prefijo de longitud.
//
//  Todos los enteros multi-byte son BIG-ENDIAN (§23).
//  Las coordenadas viajan como enteros ×100 (§24).
// ============================================================================

export const VERSION = 0x03;

// --- §26 tabla de tipos de mensaje ----------------------------------------
export const TIPOS = {
  // descubrimiento (UDP)
  DISCOVER_REQUEST: 0x01,
  DISCOVER_RESPONSE: 0x02,
  // cliente → servidor (TCP)
  JOIN: 0x10,
  INPUT: 0x11,
  INTERACT: 0x12,
  LEAVE: 0x13,
  // servidor → cliente (TCP)
  JOIN_ACCEPTED: 0x20,
  JOIN_REJECTED: 0x21,
  LOBBY_STATE: 0x22,
  GAME_COUNTDOWN: 0x23,
  GAME_STARTED: 0x24,
  GAME_STATE: 0x25,
  FLAG_PICKED_UP: 0x26,
  FLAG_STOLEN: 0x27,
  PLAYER_DISCONNECTED: 0x28,
  GAME_OVER: 0x29,
  ERROR: 0x2a,

  // ── EXTENSIÓN LOCAL, fuera de la tabla oficial de §26 ────────────────────
  // §20 dice que el servidor pasa a STARTING y manda la cuenta atrás, pero NO
  // define qué lo dispara. Sin un disparador explícito solo quedan malas
  // opciones: arrancar con el primer jugador (y entonces nadie más puede
  // entrar, porque a partir de STARTING el servidor rechaza con
  // GAME_ALREADY_STARTED) o fijar de antemano cuántos van a jugar.
  //
  // Con esto el anfitrión decide cuándo empezar. Va en 0x7f, lejos del rango
  // oficial (0x01-0x2A), así que no colisiona con nada de la spec. Si nuestro
  // cliente se lo manda al servidor de otro equipo, ese responderá ERROR con
  // INVALID_MESSAGE y aquí simplemente se ignora: no rompe la interoperación.
  HOST_START: 0x7f,

  // ¿Quién manda en esta partida? El cliente PREGUNTA y el servidor responde
  // solo a quien preguntó. Ese detalle importa: mandar mensajes de extensión
  // sin que nadie los pida podría confundir al cliente de otro equipo, que no
  // conoce el tipo. Preguntando primero, un cliente ajeno nunca recibe nada
  // fuera de la tabla oficial.
  HOST_QUERY: 0x7e,   // cliente → servidor
  HOST_INFO: 0x7d,    // servidor → cliente (solo como respuesta)
};

// Nombre legible a partir del código, para logs y depuración (§37).
export const NOMBRE_TIPO = Object.fromEntries(
  Object.entries(TIPOS).map(([k, v]) => [v, k])
);

// --- §25 enumeraciones ------------------------------------------------------
export const DIRECCIONES = { NONE: 0x00, UP: 0x01, DOWN: 0x02, LEFT: 0x03, RIGHT: 0x04 };

export const ESTADO_BANDERA = { AVAILABLE: 0x01, CARRIED: 0x02, DROPPED: 0x03, OUTSIDE: 0x04 };

export const ESTADO_PARTIDA = { WAITING: 0x01, STARTING: 0x02, RUNNING: 0x03, FINISHED: 0x04, CANCELLED: 0x05 };

export const RAZON_RECHAZO = {
  GAME_ALREADY_STARTED: 0x01,
  GAME_FULL: 0x02,
  INVALID_NAME: 0x03,
  UNSUPPORTED_PROTOCOL_VERSION: 0x04,
};

export const ERRORES = {
  INVALID_MESSAGE: 0x01,
  INVALID_ENCODING: 0x02,
  INVALID_INPUT: 0x03,
  UNKNOWN_PLAYER: 0x04,
  GAME_NOT_STARTED: 0x05,
  GAME_ALREADY_STARTED: 0x06,
  GAME_FINISHED: 0x07,
  UNSUPPORTED_PROTOCOL_VERSION: 0x08,
};

// --- §21 parámetros configurables (valores por defecto) --------------------
export const PARAMS_DEFECTO = {
  mapSize: 2000,
  circleRadius: 500,
  playerRadius: 15,
  spawnMargin: 80,
  playerSpeed: 220,
  interactionRadius: 60,
  tickIntervalMs: 50,
  countdownSeconds: 5,
  maximumPlayers: 100,
  serverPort: 5005,
  discoveryPort: 5001,

  // ── FUERA DE LA SPEC — por defecto en 0, que es el comportamiento oficial ──
  // §14 dice literalmente "no existe inmunidad, el robo es instantáneo". Con
  // eso, más "los jugadores no colisionan" (§10) y una velocidad única para
  // todos (§21), un perseguidor pegado al portador le roba la bandera cada
  // ciclo y ninguno de los dos puede separarse nunca: la partida no termina.
  // Está medido en test/verify-bots-v3.mjs — con 5 jugadores salen ~2900 robos
  // en 3000 ciclos y cero ganadores.
  //
  // Este parámetro permite darle al nuevo portador unos milisegundos de
  // inmunidad. Se deja en 0 para que el servidor sea fiel al PRFC tal como
  // está escrito hoy; súbelo solo si el equipo enmienda §14, y asegúrate de
  // que TODOS los grupos usen el mismo valor o las partidas divergirán.
  protectionTimeMs: 0,
};

// --- §24 escalado de coordenadas ------------------------------------------
// El protocolo transporta enteros; el juego trabaja en flotantes. Estas dos
// funciones son el ÚNICO lugar donde se cruza esa frontera: si un cálculo se
// hace con el valor sin escalar contra uno escalado, las distancias salen 100
// veces mal (es la "trampa 2" del documento de consideraciones).
export const esc = (v) => Math.round(v * 100);
export const desesc = (v) => v / 100;

const TEXTO = new TextEncoder();
const DESTEXTO = new TextDecoder('utf-8', { fatal: false });

// ---------------------------------------------------------------------------
//  Escritor: acumula campos y entrega el payload final como Uint8Array.
//  Crece solo, así que no hay que calcular el tamaño de antemano.
// ---------------------------------------------------------------------------
export class Escritor {
  constructor(capacidad = 256) {
    this._buf = new Uint8Array(capacidad);
    this._vista = new DataView(this._buf.buffer);
    this.len = 0;
  }

  _asegurar(n) {
    if (this.len + n <= this._buf.length) return;
    let cap = this._buf.length * 2;
    while (cap < this.len + n) cap *= 2;
    const mayor = new Uint8Array(cap);
    mayor.set(this._buf.subarray(0, this.len));
    this._buf = mayor;
    this._vista = new DataView(this._buf.buffer);
  }

  u8(v) { this._asegurar(1); this._vista.setUint8(this.len, v & 0xff); this.len += 1; return this; }
  u16(v) { this._asegurar(2); this._vista.setUint16(this.len, v & 0xffff, false); this.len += 2; return this; }
  u32(v) { this._asegurar(4); this._vista.setUint32(this.len, v >>> 0, false); this.len += 4; return this; }
  i32(v) { this._asegurar(4); this._vista.setInt32(this.len, v | 0, false); this.len += 4; return this; }
  bool(v) { return this.u8(v ? 1 : 0); }

  // str = u8 de longitud + N bytes UTF-8 (§23). Se mide en BYTES, no en
  // caracteres: "José" son 4 caracteres pero 5 bytes.
  str(s) {
    const bytes = TEXTO.encode(String(s ?? ''));
    if (bytes.length > 255) throw new RangeError('str excede 255 bytes');
    this.u8(bytes.length);
    this._asegurar(bytes.length);
    this._buf.set(bytes, this.len);
    this.len += bytes.length;
    return this;
  }

  // Coordenada: flotante del juego → entero ×100 (§24).
  coord(v) { return this.i32(esc(v)); }

  bytes() { return this._buf.slice(0, this.len); }
}

// ---------------------------------------------------------------------------
//  Lector: recorre un payload. Cualquier lectura fuera de rango lanza, para
//  que un mensaje corrupto falle de una vez y no siga leyendo basura (§32).
// ---------------------------------------------------------------------------
export class Lector {
  constructor(bytes) {
    this._b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this._vista = new DataView(this._b.buffer, this._b.byteOffset, this._b.byteLength);
    this.pos = 0;
  }

  _exigir(n) {
    if (this.pos + n > this._b.byteLength) {
      throw new RangeError(`lectura fuera de rango (+${n} en ${this.pos}/${this._b.byteLength})`);
    }
  }

  u8() { this._exigir(1); const v = this._vista.getUint8(this.pos); this.pos += 1; return v; }
  u16() { this._exigir(2); const v = this._vista.getUint16(this.pos, false); this.pos += 2; return v; }
  u32() { this._exigir(4); const v = this._vista.getUint32(this.pos, false); this.pos += 4; return v; }
  i32() { this._exigir(4); const v = this._vista.getInt32(this.pos, false); this.pos += 4; return v; }
  bool() { return this.u8() !== 0; }

  str() {
    const n = this.u8();
    this._exigir(n);
    const s = DESTEXTO.decode(this._b.subarray(this.pos, this.pos + n));
    this.pos += n;
    return s;
  }

  coord() { return desesc(this.i32()); }

  get restante() { return this._b.byteLength - this.pos; }
}

// ---------------------------------------------------------------------------
//  Codificación por tipo de mensaje (§28, §29).
//  Devuelve el PAYLOAD (sin prefijo de longitud). Para TCP usar enmarcar().
// ---------------------------------------------------------------------------
export function codificar(tipo, c = {}) {
  const w = new Escritor();
  w.u8(tipo).u8(VERSION);

  switch (tipo) {
    // ---- descubrimiento (UDP) --------------------------------------------
    case TIPOS.DISCOVER_REQUEST:
      break; // solo cabecera: 01 03

    case TIPOS.DISCOVER_RESPONSE:
      // PRFC §27.2: ambos conteos son u16 big-endian. Usar u8 hacía que
      // clientes de otros lenguajes descartaran el anuncio por estar truncado.
      w.u16(c.gameId).str(c.serverName).u16(c.tcpPort).u8(c.state)
       .u16(c.playerCount).u16(c.maximumPlayers);
      break;

    // ---- cliente → servidor ----------------------------------------------
    case TIPOS.JOIN:
      w.str(c.name);
      break;

    case TIPOS.INPUT:
      w.u16(c.playerId).u8(c.direction);
      break;

    case TIPOS.INTERACT:
    case TIPOS.LEAVE:
    case TIPOS.HOST_START:
    case TIPOS.HOST_QUERY:
      w.u16(c.playerId);
      break;

    case TIPOS.HOST_INFO:
      w.u16(c.hostId).bool(c.puedesEmpezar);
      break;

    // ---- servidor → cliente ----------------------------------------------
    case TIPOS.JOIN_ACCEPTED:
      w.u16(c.playerId).u16(c.gameId);
      break;

    case TIPOS.JOIN_REJECTED:
      w.u8(c.reason);
      break;

    case TIPOS.LOBBY_STATE: {
      const js = c.players || [];
      w.u8(c.state).u8(js.length);
      for (const j of js) w.u16(j.playerId).str(j.name);
      break;
    }

    case TIPOS.GAME_COUNTDOWN:
      w.u8(c.secondsRemaining);
      break;

    case TIPOS.GAME_STARTED: {
      const js = c.players || [];
      w.coord(c.mapSize).coord(c.circleRadius).coord(c.playerRadius)
       .coord(c.playerSpeed).coord(c.interactionRadius).u16(c.tickIntervalMs)
       .u8(c.flagStatus).u16(c.flagCarrierId || 0).coord(c.flagX).coord(c.flagY)
       .u8(js.length);
      for (const j of js) {
        w.u16(j.playerId).str(j.name).coord(j.x).coord(j.y).u8(j.direction).bool(j.hasFlag);
      }
      break;
    }

    case TIPOS.GAME_STATE: {
      const js = c.players || [];
      w.u32(c.tick).u8(c.flagStatus).u16(c.flagCarrierId || 0)
       .coord(c.flagX).coord(c.flagY).u8(js.length);
      for (const j of js) {
        w.u16(j.playerId).coord(j.x).coord(j.y).u8(j.direction).bool(j.hasFlag);
      }
      break;
    }

    case TIPOS.FLAG_PICKED_UP:
      w.u32(c.tick).u16(c.playerId);
      break;

    case TIPOS.FLAG_STOLEN:
      w.u32(c.tick).u16(c.previousCarrierId).u16(c.newCarrierId);
      break;

    case TIPOS.PLAYER_DISCONNECTED:
      w.u16(c.playerId);
      break;

    case TIPOS.GAME_OVER:
      w.u16(c.winnerId).str(c.winnerName).u8(c.reason || 0);
      break;

    case TIPOS.ERROR:
      w.u8(c.code).str(c.description || '');
      break;

    default:
      throw new Error('tipo de mensaje desconocido: 0x' + tipo.toString(16));
  }

  return w.bytes();
}

// ---------------------------------------------------------------------------
//  Decodificación. Devuelve un objeto plano { type, ver, ...campos }.
//  Lanza si el mensaje está truncado o el tipo es desconocido.
// ---------------------------------------------------------------------------
export function decodificar(payload) {
  const r = new Lector(payload);
  const type = r.u8();
  const ver = r.u8();
  const m = { type, ver };

  switch (type) {
    case TIPOS.DISCOVER_REQUEST:
      break;

    case TIPOS.DISCOVER_RESPONSE:
      m.gameId = r.u16();
      m.serverName = r.str();
      m.tcpPort = r.u16();
      m.state = r.u8();
      m.playerCount = r.u16();
      m.maximumPlayers = r.u16();
      break;

    case TIPOS.JOIN:
      m.name = r.str();
      break;

    case TIPOS.INPUT:
      m.playerId = r.u16();
      m.direction = r.u8();
      break;

    case TIPOS.INTERACT:
    case TIPOS.LEAVE:
    case TIPOS.HOST_START:
    case TIPOS.HOST_QUERY:
      m.playerId = r.u16();
      break;

    case TIPOS.HOST_INFO:
      m.hostId = r.u16();
      m.puedesEmpezar = r.bool();
      break;

    case TIPOS.JOIN_ACCEPTED:
      m.playerId = r.u16();
      m.gameId = r.u16();
      break;

    case TIPOS.JOIN_REJECTED:
      m.reason = r.u8();
      break;

    case TIPOS.LOBBY_STATE: {
      m.state = r.u8();
      const n = r.u8();
      m.players = [];
      for (let i = 0; i < n; i++) m.players.push({ playerId: r.u16(), name: r.str() });
      break;
    }

    case TIPOS.GAME_COUNTDOWN:
      m.secondsRemaining = r.u8();
      break;

    case TIPOS.GAME_STARTED: {
      m.mapSize = r.coord();
      m.circleRadius = r.coord();
      m.playerRadius = r.coord();
      m.playerSpeed = r.coord();
      m.interactionRadius = r.coord();
      m.tickIntervalMs = r.u16();
      m.flagStatus = r.u8();
      m.flagCarrierId = r.u16();
      m.flagX = r.coord();
      m.flagY = r.coord();
      const n = r.u8();
      m.players = [];
      for (let i = 0; i < n; i++) {
        m.players.push({
          playerId: r.u16(), name: r.str(), x: r.coord(), y: r.coord(),
          direction: r.u8(), hasFlag: r.bool(),
        });
      }
      break;
    }

    case TIPOS.GAME_STATE: {
      m.tick = r.u32();
      m.flagStatus = r.u8();
      m.flagCarrierId = r.u16();
      m.flagX = r.coord();
      m.flagY = r.coord();
      const n = r.u8();
      m.players = [];
      for (let i = 0; i < n; i++) {
        m.players.push({
          playerId: r.u16(), x: r.coord(), y: r.coord(),
          direction: r.u8(), hasFlag: r.bool(),
        });
      }
      break;
    }

    case TIPOS.FLAG_PICKED_UP:
      m.tick = r.u32();
      m.playerId = r.u16();
      break;

    case TIPOS.FLAG_STOLEN:
      m.tick = r.u32();
      m.previousCarrierId = r.u16();
      m.newCarrierId = r.u16();
      break;

    case TIPOS.PLAYER_DISCONNECTED:
      m.playerId = r.u16();
      break;

    case TIPOS.GAME_OVER:
      m.winnerId = r.u16();
      m.winnerName = r.str();
      m.reason = r.u8();
      break;

    case TIPOS.ERROR:
      m.code = r.u8();
      m.description = r.str();
      break;

    default:
      throw new Error('tipo de mensaje desconocido: 0x' + type.toString(16));
  }

  return m;
}

// ---------------------------------------------------------------------------
//  Enmarcado TCP: prefijo u16 big-endian con la longitud del payload (§23).
// ---------------------------------------------------------------------------
export function enmarcar(tipo, campos) {
  const payload = codificar(tipo, campos);
  const out = new Uint8Array(2 + payload.length);
  new DataView(out.buffer).setUint16(0, payload.length, false);
  out.set(payload, 2);
  return out;
}

// Tope defensivo. El mensaje legítimo más grande es GAME_STARTED con los 100
// jugadores de §21 y nombres de 20 caracteres UTF-8 en el peor caso (4 bytes
// por carácter): unos 9.4 KB. 16 KB deja margen de sobra y, a diferencia de un
// tope de 64 KB, sí puede dispararse — un u16 nunca pasa de 65535, así que un
// límite en 65536 sería código muerto.
const MAX_MENSAJE = 16 * 1024;

// ---------------------------------------------------------------------------
//  AcumuladorTCP — la "trampa 1" del documento de consideraciones.
//
//  TCP es un FLUJO, no mensajes: un read() puede traer medio mensaje, dos
//  mensajes juntos, o dos bytes y medio. Hay que acumular hasta tener el
//  prefijo completo y luego los N bytes que anuncia.
//
//    const acc = new AcumuladorTCP(msg => manejar(msg));
//    socket.on('data', d => acc.alimentar(d));
// ---------------------------------------------------------------------------
export class AcumuladorTCP {
  constructor(onMensaje, onError = () => {}) {
    this._buf = new Uint8Array(0);
    this._onMensaje = onMensaje;
    this._onError = onError;
  }

  alimentar(chunk) {
    const entrada = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    const unido = new Uint8Array(this._buf.length + entrada.length);
    unido.set(this._buf);
    unido.set(entrada, this._buf.length);
    this._buf = unido;

    for (;;) {
      if (this._buf.length < 2) return; // ni siquiera el prefijo completo
      const vista = new DataView(this._buf.buffer, this._buf.byteOffset, this._buf.byteLength);
      const largo = vista.getUint16(0, false);

      if (largo === 0 || largo > MAX_MENSAJE) {
        // Flujo desalineado: no se puede recuperar el punto de corte.
        this._buf = new Uint8Array(0);
        this._onError(ERRORES.INVALID_MESSAGE, `longitud inválida: ${largo}`);
        return;
      }
      if (this._buf.length < 2 + largo) return; // aún falta cuerpo

      const payload = this._buf.slice(2, 2 + largo);
      this._buf = this._buf.slice(2 + largo);

      let msg;
      try {
        msg = decodificar(payload);
      } catch (e) {
        this._onError(ERRORES.INVALID_ENCODING, e.message);
        continue; // el framing sigue sano: seguimos con el próximo mensaje
      }
      this._onMensaje(msg);
    }
  }
}

// Utilidad de depuración (§37): "11 03 00 07 01".
export const aHex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
