// ============================================================================
//  Motor de "Captura la Bandera" PRFC v3 — plano CONTINUO.
//
//  Agnóstico del motor gráfico: ni una línea de three.js ni del DOM, para que
//  el servidor pueda correrlo en Node y el navegador reutilizarlo en el modo
//  local. Toda la autoridad vive aquí (§31: "el servidor será la única fuente
//  oficial"); el cliente solo manda dirección e intención de interactuar.
//
//  Sistema de coordenadas (§5): plano continuo centrado en (0,0); x crece a la
//  derecha, y crece HACIA ABAJO. El rango válido es ±mapSize/2 en ambos ejes.
// ============================================================================

import {
  PARAMS_DEFECTO, DIRECCIONES, ESTADO_BANDERA, ESTADO_PARTIDA,
  RAZON_RECHAZO, TIPOS,
} from '../../../red/v3/protocolo-v3.js';

// Vector unitario por dirección. Ojo con el signo de UP: y crece hacia abajo
// (§5), así que "arriba" RESTA en y.
const DELTA = {
  [DIRECCIONES.NONE]: [0, 0],
  [DIRECCIONES.UP]: [0, -1],
  [DIRECCIONES.DOWN]: [0, 1],
  [DIRECCIONES.LEFT]: [-1, 0],
  [DIRECCIONES.RIGHT]: [1, 0],
};

const DIRECCIONES_VALIDAS = new Set(Object.values(DIRECCIONES));

const dist = (x, y) => Math.hypot(x, y);

export class MotorV3 {
  constructor(params = {}, gameId = 1) {
    this.p = { ...PARAMS_DEFECTO, ...params };
    this.gameId = gameId;
    this.estado = ESTADO_PARTIDA.WAITING;
    this.tick = 0;
    this.jugadores = new Map();  // playerId -> jugador
    this.bandera = { x: 0, y: 0, status: ESTADO_BANDERA.AVAILABLE, carrierId: 0 };
    this.ganadorId = 0;
    this._seq = 1;

    // Inmunidad tras adquirir la bandera. Con el valor oficial (0) no hay
    // ninguna: es el comportamiento de §14. Se cuenta en TICKS y no en
    // milisegundos de reloj para que la simulación sea determinista y dos
    // servidores con el mismo historial de entradas den el mismo resultado.
    this._ticksProteccion = Math.round((this.p.protectionTimeMs || 0) / this.p.tickIntervalMs);
    this._protegidaHasta = -1;   // número de tick hasta el que no se puede robar

    // Colas de intención. Se vacían en cada ciclo (§30.1, §30.2).
    this._inputs = new Map();       // playerId -> direction (gana el último)
    this._interacts = new Set();    // playerId (una interacción por ciclo)
    this._desconexiones = new Set();
  }

  // --- consultas geométricas (§6) -------------------------------------------

  // "Dentro del círculo": distancia al origen ≤ circleRadius (§6).
  dentroDelCirculo(j) {
    return dist(j.x, j.y) <= this.p.circleRadius;
  }

  // "Completamente fuera": distancia - playerRadius > circleRadius (§6, §16).
  // playerRadius interviene SOLO aquí; los jugadores no colisionan (§10).
  completamenteFuera(j) {
    return dist(j.x, j.y) - this.p.playerRadius > this.p.circleRadius;
  }

  // --- altas y bajas ---------------------------------------------------------

  agregarJugador(name) {
    if (this.estado !== ESTADO_PARTIDA.WAITING) return { error: RAZON_RECHAZO.GAME_ALREADY_STARTED };
    if (this.jugadoresActivos().length >= this.p.maximumPlayers) return { error: RAZON_RECHAZO.GAME_FULL };

    // §28.1 exige entre 1 y 20 caracteres tras recortar espacios. Se valida en
    // CARACTERES (lo que dice la spec) aunque el campo viaje en bytes; ver la
    // nota de interoperabilidad al final del archivo.
    const limpio = String(name ?? '').trim();
    if ([...limpio].length < 1 || [...limpio].length > 20) return { error: RAZON_RECHAZO.INVALID_NAME };

    const playerId = this._seq++;
    // §9: ángulo aleatorio, a circleRadius + spawnMargin del origen.
    const ang = Math.random() * Math.PI * 2;
    const radio = this.p.circleRadius + this.p.spawnMargin;
    const jugador = {
      playerId,
      name: limpio,
      x: Math.cos(ang) * radio,
      y: Math.sin(ang) * radio,
      direction: DIRECCIONES.NONE,
      hasFlag: false,
      connected: true,
    };
    this.jugadores.set(playerId, jugador);
    return { jugador };
  }

  jugadoresActivos() {
    return [...this.jugadores.values()].filter((j) => j.connected);
  }

  // Marca una desconexión. NO se aplica al instante: se procesa en el paso 8
  // del ciclo (§30), para que la baja y su evento caigan en un tick definido.
  //
  // Mientras la partida no está corriendo no hay ciclo que la procese, así que
  // ahí se aplica en el acto: si no, el jugador se quedaría marcado como
  // conectado para siempre y ocuparía sitio en una sala en la que ya no está.
  desconectar(playerId) {
    const j = this.jugadores.get(playerId);
    if (!j || !j.connected) return false;
    if (this.estado === ESTADO_PARTIDA.RUNNING) {
      this._desconexiones.add(playerId);
    } else {
      j.connected = false;
      j.hasFlag = false;
      this.jugadores.delete(playerId);
    }
    return true;
  }

  // Deja la sala como recién arrancada: sin jugadores, sin bandera en manos de
  // nadie y sin ganador. Es lo que hay que hacer al terminar una partida.
  //
  // Vaciar el censo es la parte que importa. Antes solo se marcaba
  // `connected = false`, y el jugador seguía dentro del Map para siempre: la
  // sala siguiente lo listaba, contaba para el aforo y, tras unas cuantas
  // partidas, el servidor rechazaba con GAME_FULL sin nadie dentro.
  //
  // Los identificadores NO se reinician: _seq sigue creciendo. Reutilizarlos
  // haría que un mensaje rezagado de la partida anterior —uno que aún viaja por
  // la red cuando ya empezó la siguiente— cayera sobre un jugador distinto que
  // resulta tener el mismo número.
  reiniciarSala() {
    this.jugadores.clear();
    this.estado = ESTADO_PARTIDA.WAITING;
    this.tick = 0;
    this.ganadorId = 0;
    this.bandera = { x: 0, y: 0, status: ESTADO_BANDERA.AVAILABLE, carrierId: 0 };
    this._protegidaHasta = -1;
    this._inputs.clear();
    this._interacts.clear();
    this._desconexiones.clear();
  }

  // --- intención del cliente (§28) ------------------------------------------

  // §30.1: de varios INPUT en el mismo ciclo solo sobrevive el último.
  encolarInput(playerId, direction) {
    const j = this.jugadores.get(playerId);
    if (!j || !j.connected) return { error: 'UNKNOWN_PLAYER' };
    if (!DIRECCIONES_VALIDAS.has(direction)) return { error: 'INVALID_INPUT' };
    this._inputs.set(playerId, direction);
    return { ok: true };
  }

  // §30.2: una sola interacción por jugador y ciclo, por más veces que la mande.
  encolarInteract(playerId) {
    const j = this.jugadores.get(playerId);
    if (!j || !j.connected) return { error: 'UNKNOWN_PLAYER' };
    this._interacts.add(playerId);
    return { ok: true };
  }

  // --- arranque (§20) --------------------------------------------------------

  iniciar() {
    this.estado = ESTADO_PARTIDA.STARTING;
    this.bandera = { x: 0, y: 0, status: ESTADO_BANDERA.AVAILABLE, carrierId: 0 };
    this.tick = 0;
    this.ganadorId = 0;
    this._protegidaHasta = -1;
    this._inputs.clear();
    this._interacts.clear();
    this._desconexiones.clear();
    // Reubica a todos por si entraron y salieron durante la espera (§9).
    for (const j of this.jugadoresActivos()) {
      const ang = Math.random() * Math.PI * 2;
      const radio = this.p.circleRadius + this.p.spawnMargin;
      Object.assign(j, {
        x: Math.cos(ang) * radio, y: Math.sin(ang) * radio,
        direction: DIRECCIONES.NONE, hasFlag: false,
      });
    }
    this.estado = ESTADO_PARTIDA.RUNNING;
    return this.serializarInicio();
  }

  // --- el ciclo del servidor (§30), paso por paso ---------------------------

  ciclo() {
    if (this.estado !== ESTADO_PARTIDA.RUNNING) return { eventos: [], estado: this.estado };
    const eventos = [];

    // ── 1 y 3: aplicar la última dirección pedida por cada jugador.
    for (const [id, dir] of this._inputs) {
      const j = this.jugadores.get(id);
      if (j && j.connected) j.direction = dir;
    }
    this._inputs.clear();

    // ── 2: quedarse con las interacciones pendientes (una por jugador).
    const interactuan = new Set(this._interacts);
    this._interacts.clear();

    const activos = this.jugadoresActivos();

    // ── 4 y 5: mover y recortar a los límites del mapa (§10, §5).
    const paso = (this.p.playerSpeed * this.p.tickIntervalMs) / 1000;
    const mitad = this.p.mapSize / 2;
    for (const j of activos) {
      const [dx, dy] = DELTA[j.direction] || [0, 0];
      j.x = Math.min(mitad, Math.max(-mitad, j.x + dx * paso));
      j.y = Math.min(mitad, Math.max(-mitad, j.y + dy * paso));
    }

    // ── 6: resolver interacciones en orden ASCENDENTE de playerId (§30.6).
    //
    // INTERPRETACIÓN (§13/§14/§15 no lo cierran): se permite COMO MUCHO UN
    // cambio de dueño de la bandera por ciclo. Sin esta regla, al recorrer en
    // orden ascendente el jugador 1 podría recogerla y el jugador 3 robársela
    // en el MISMO ciclo, dejando la posesión del 1 en cero tiempo; y §15 ya
    // dice que de varios robos simultáneos "solo se aplica el primero válido,
    // los demás reintentan el ciclo siguiente". Se extiende ese criterio a la
    // recogida, que §13 no desempata. Si el equipo enmienda la spec, este es
    // el único bloque que hay que tocar.
    const candidatos = [...interactuan].sort((a, b) => a - b);
    let cambioDeDueño = false;

    for (const id of candidatos) {
      if (cambioDeDueño) break;
      const j = this.jugadores.get(id);
      if (!j || !j.connected) continue;

      if (this.bandera.status === ESTADO_BANDERA.AVAILABLE || this.bandera.status === ESTADO_BANDERA.DROPPED) {
        // §13: recoger. Requiere estar a interactionRadius de la bandera.
        if (dist(j.x - this.bandera.x, j.y - this.bandera.y) <= this.p.interactionRadius) {
          j.hasFlag = true;
          this.bandera.status = ESTADO_BANDERA.CARRIED;
          this.bandera.carrierId = j.playerId;
          this._protegidaHasta = this.tick + this._ticksProteccion;
          eventos.push({ type: TIPOS.FLAG_PICKED_UP, playerId: j.playerId });
          cambioDeDueño = true;
        }
      } else if (this.bandera.status === ESTADO_BANDERA.CARRIED && this.bandera.carrierId !== j.playerId
                 && this.tick >= this._protegidaHasta) {
        // §14: robar. Con el valor oficial protectionTimeMs=0 la condición de
        // inmunidad de arriba es siempre cierta, así que el robo es instantáneo
        // tal como manda la spec.
        const portador = this.jugadores.get(this.bandera.carrierId);
        if (portador && portador.connected &&
            dist(j.x - portador.x, j.y - portador.y) <= this.p.interactionRadius) {
          portador.hasFlag = false;
          j.hasFlag = true;
          this.bandera.carrierId = j.playerId;
          this._protegidaHasta = this.tick + this._ticksProteccion;
          eventos.push({
            type: TIPOS.FLAG_STOLEN,
            previousCarrierId: portador.playerId,
            newCarrierId: j.playerId,
          });
          cambioDeDueño = true;
        }
      }
    }

    // ── 7: la bandera sigue a su portador (§7).
    if (this.bandera.status === ESTADO_BANDERA.CARRIED) {
      const portador = this.jugadores.get(this.bandera.carrierId);
      if (portador) { this.bandera.x = portador.x; this.bandera.y = portador.y; }
    }

    // ── 8: verificar desconexiones (§17). Si el que se va llevaba la bandera,
    //      esta cae DROPPED en su última posición válida y otro puede recogerla.
    for (const id of [...this._desconexiones].sort((a, b) => a - b)) {
      const j = this.jugadores.get(id);
      if (!j || !j.connected) continue;
      j.connected = false;
      if (j.hasFlag) {
        j.hasFlag = false;
        this.bandera = { x: j.x, y: j.y, status: ESTADO_BANDERA.DROPPED, carrierId: 0 };
      }
      eventos.push({ type: TIPOS.PLAYER_DISCONNECTED, playerId: j.playerId });
    }
    this._desconexiones.clear();

    // ── 9: condición de victoria (§16). Se evalúa DESPUÉS de mover y de las
    //      bajas, así que quien se desconecta no puede ganar en ese mismo ciclo.
    for (const j of this.jugadoresActivos()) {
      if (!j.hasFlag || !this.completamenteFuera(j)) continue;
      this.estado = ESTADO_PARTIDA.FINISHED;
      this.ganadorId = j.playerId;
      this.bandera.status = ESTADO_BANDERA.OUTSIDE;
      this.bandera.x = j.x;
      this.bandera.y = j.y;
      eventos.push({ type: TIPOS.GAME_OVER, winnerId: j.playerId, winnerName: j.name, reason: 0 });
      break;
    }

    // ── 10: incrementar el tick.
    this.tick++;

    // ── 11: el emisor manda primero los eventos y luego el GAME_STATE de ESTE
    //      tick (§29.11). Se sellan con el tick ya incrementado para que evento
    //      y estado del mismo ciclo compartan número y el cliente correlacione.
    //      GAME_OVER va después del GAME_STATE, así que se deja al final.
    const finales = eventos.filter((e) => e.type !== TIPOS.GAME_OVER);
    const over = eventos.filter((e) => e.type === TIPOS.GAME_OVER);
    finales.sort((a, b) => (a.playerId ?? a.newCarrierId ?? 0) - (b.playerId ?? b.newCarrierId ?? 0));
    for (const e of finales) e.tick = this.tick;

    return { eventos: [...finales, ...over], estado: this.estado };
  }

  // --- serialización para el códec (§29.5, §29.6) ---------------------------

  serializarInicio() {
    return {
      mapSize: this.p.mapSize,
      circleRadius: this.p.circleRadius,
      playerRadius: this.p.playerRadius,
      playerSpeed: this.p.playerSpeed,
      interactionRadius: this.p.interactionRadius,
      tickIntervalMs: this.p.tickIntervalMs,
      flagStatus: this.bandera.status,
      flagCarrierId: this.bandera.carrierId,
      flagX: this.bandera.x,
      flagY: this.bandera.y,
      players: this.jugadoresActivos().map((j) => ({
        playerId: j.playerId, name: j.name, x: j.x, y: j.y,
        direction: j.direction, hasFlag: j.hasFlag,
      })),
    };
  }

  serializarEstado() {
    return {
      tick: this.tick,
      flagStatus: this.bandera.status,
      flagCarrierId: this.bandera.carrierId,
      flagX: this.bandera.x,
      flagY: this.bandera.y,
      players: this.jugadoresActivos().map((j) => ({
        playerId: j.playerId, x: j.x, y: j.y,
        direction: j.direction, hasFlag: j.hasFlag,
      })),
    };
  }

  serializarLobby() {
    return {
      state: this.estado,
      players: this.jugadoresActivos().map((j) => ({ playerId: j.playerId, name: j.name })),
    };
  }
}

// ---------------------------------------------------------------------------
//  Nota de interoperabilidad (§34)
//
//  §28.1 exige que el nombre tenga "entre 1 y 20 caracteres", pero §23 define
//  `str` como u8 de longitud + N BYTES UTF-8. Carácter y byte no son lo mismo:
//  "José" son 4 caracteres y 5 bytes, y 20 caracteres CJK son 60 bytes.
//
//  Aquí se valida en CARACTERES, que es lo que la spec dice literalmente. Un
//  equipo que valide en bytes rechazará nombres que nosotros aceptamos. Es uno
//  de los puntos pendientes de aclarar con el resto de los grupos.
// ---------------------------------------------------------------------------
