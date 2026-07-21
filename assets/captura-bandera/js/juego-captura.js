// ============================================================================
//  Motor "Captura la Bandera" — implementa la lógica autoritativa de la spec
//  oficial v1.0 (CapturaLaBandera.docx). ES module SIN dependencias: corre
//  igual en el navegador (modo local de test) y en Node (servidor TCP real).
//
//  Reglas clave (referencias a las secciones del Word):
//   - Tablero rows×columns, coords [fila, columna] desde 0.        (§4, §5)
//   - Movimiento continuo tipo snake: 1 casilla por ciclo.         (§8, §9)
//   - Una bandera cerca del centro; robo + protección temporal.    (§11, §14, §15)
//   - Gana el portador que sale por un borde.                      (§17, §18)
//   - Todos los movimientos de un ciclo se calculan sobre el
//     MISMO estado inicial del tick.                               (§16, §31)
//   - Orden exacto del ciclo del servidor.                         (§30)
// ============================================================================

// Valores por defecto sugeridos por la spec (§22).
export const CONFIG_DEFECTO = {
  rows: 20,
  columns: 20,
  obstaclePercentage: 10,
  movementIntervalMs: 200,
  protectionTimeMs: 1000,
  maximumPlayers: 30,
  centralFlagAreaPercentage: 30,
  serverPort: 5000,
};

export const ESTADOS = {
  WAITING: 'WAITING',     // acepta jugadores
  STARTING: 'STARTING',   // genera tablero/obstáculos/posiciones
  RUNNING: 'RUNNING',     // juego en curso
  FINISHED: 'FINISHED',   // hay ganador
  CANCELLED: 'CANCELLED', // cancelada
};

export const DIRECCIONES = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

// Vector de avance por dirección (fila, columna).
const DELTA = {
  UP: [-1, 0],
  DOWN: [1, 0],
  LEFT: [0, -1],
  RIGHT: [0, 1],
};

const clave = (r, c) => `${r},${c}`;

export class JuegoCaptura {
  constructor(config = {}) {
    this.cfg = { ...CONFIG_DEFECTO, ...config };
    this.estado = ESTADOS.WAITING;
    this.tick = 0;
    this.gameId = 'GAME-001';
    this.jugadores = new Map();          // playerId -> jugador
    this.obstaculos = [];                // [{row, column}]
    this._obstSet = new Set();           // "r,c" para lookup O(1)
    this.bandera = { row: -1, column: -1, status: 'AVAILABLE', carrierId: null };
    this.direccionesPendientes = new Map(); // playerId -> dir (gana la última)
    this.ganadorId = null;
    this._seq = 1;                       // contador para asignar P01, P02...
  }

  // --- ciclo de vida -------------------------------------------------------

  // Registra un jugador (estado WAITING). Lo coloca FUERA del tablero, junto
  // a un borde aleatorio, mirando hacia adentro (§7).
  agregarJugador(name) {
    if (this.estado !== ESTADOS.WAITING) return { error: 'GAME_ALREADY_STARTED' };
    const activos = [...this.jugadores.values()].filter((j) => j.connected).length;
    if (activos >= this.cfg.maximumPlayers) return { error: 'GAME_FULL' };
    if (!name || !String(name).trim()) return { error: 'INVALID_NAME' };

    // Padding dinámico: que el sort lexicográfico = numérico para tie-break §16.
    const ancho = Math.max(3, String(this.cfg.maximumPlayers).length);
    const playerId = 'P' + String(this._seq++).padStart(ancho, '0');
    const jugador = {
      playerId,
      name: String(name).slice(0, 24),
      ...this._posicionInicial(),
      connected: true,
      insideBoard: false,
      hasFlag: false,
      protectedUntil: 0,
    };
    this.jugadores.set(playerId, jugador);
    return { jugador };
  }

  // Genera tablero, obstáculos, bandera y arranca (§21).
  iniciar() {
    this.estado = ESTADOS.STARTING;
    this._generarObstaculos();
    this._colocarBandera();
    // Reasigna posición inicial a cada jugador por si acaso.
    for (const j of this.jugadores.values()) {
      if (j.connected) Object.assign(j, this._posicionInicial(), { insideBoard: false, hasFlag: false });
    }
    this.tick = 0;
    this.estado = ESTADOS.RUNNING;
    return this.serializarInicio();
  }

  // Encola un cambio de dirección; solo se aplica el último por ciclo (§28.2).
  cambiarDireccion(playerId, direction) {
    const j = this.jugadores.get(playerId);
    if (!j || !j.connected) return { error: 'UNKNOWN_PLAYER' };
    if (!DIRECCIONES.includes(direction)) return { error: 'INVALID_DIRECTION' };
    this.direccionesPendientes.set(playerId, direction);
    return { ok: true };
  }

  // Desconexión (§19): si llevaba la bandera, cae en su última posición.
  // Es SÍNCRONA e inmediata a propósito: el alineamiento con el paso 12 del
  // ciclo ("verificar desconexiones", §30) es responsabilidad de quien la
  // llama (servidor.js encola los cierres de socket y solo invoca este método
  // dentro de su loop, justo antes de `ciclo()`), no de este motor agnóstico.
  quitarJugador(playerId) {
    const j = this.jugadores.get(playerId);
    // Puede llegar LEAVE y después el cierre del socket. La desconexión debe
    // ser idempotente para no publicar PLAYER_DISCONNECTED dos veces.
    if (!j || !j.connected) return { eventos: [] };
    j.connected = false;
    const eventos = [{ type: 'PLAYER_DISCONNECTED', gameId: this.gameId, playerId }];
    if (j.hasFlag) {
      j.hasFlag = false;
      this.bandera = { row: j.row, column: j.column, status: 'DROPPED', carrierId: null };
    }
    return { eventos };
  }

  // --- el ciclo del servidor (§30) -----------------------------------------

  // Ejecuta UN ciclo. Devuelve { eventos, estado } — los eventos discretos
  // (captura, robo, victoria) se difunden aparte del GAME_STATE.
  ciclo() {
    if (this.estado !== ESTADOS.RUNNING) return { eventos: [], estado: this.estado };
    // §30: tick++ va al FINAL del ciclo (paso 14). Los eventos discretos
    // (robo, captura) usan el tick actual; el GAME_STATE sale con tick+1.
    const eventos = [];
    const ahora = Date.now();

    // 1-3: aplicar el último cambio de dirección de cada jugador.
    for (const [id, dir] of this.direccionesPendientes) {
      const j = this.jugadores.get(id);
      if (j && j.connected) j.direction = dir;
    }
    this.direccionesPendientes.clear();

    const activos = [...this.jugadores.values()].filter((j) => j.connected);

    // Ocupación INICIAL del tablero (solo cuentan los que ya están dentro).
    // Todo el ciclo se resuelve contra esta foto (§16, §31).
    const ocupadas = new Map();
    for (const j of activos) if (j.insideBoard) ocupadas.set(clave(j.row, j.column), j.playerId);

    // 4: calcular posición propuesta de cada jugador.
    const propuestas = new Map(); // id -> {row, column, entering?, exit?} | null(bloqueado)
    for (const j of activos) {
      if (!j.insideBoard) {
        // Quiere INGRESAR: su casilla de entrada es el borde al que apunta.
        const [er, ec] = this._celdaEntrada(j);
        propuestas.set(j.playerId, { row: er, column: ec, entering: true });
      } else {
        const [dr, dc] = DELTA[j.direction] || [0, 0];
        const nr = j.row + dr, nc = j.column + dc;
        if (this._fuera(nr, nc)) {
          // Salir del tablero: solo el portador puede, y solo por su borde (§17).
          if (j.hasFlag && this._salidaValida(j)) propuestas.set(j.playerId, { row: nr, column: nc, exit: true });
          else propuestas.set(j.playerId, null); // bloqueado
        } else {
          propuestas.set(j.playerId, { row: nr, column: nc });
        }
      }
    }

    // 5: contar cuántos quieren la MISMA casilla (para conflictos §16).
    const objetivo = new Map(); // "r,c" -> [ids]
    for (const [id, pr] of propuestas) {
      if (!pr || pr.exit) continue;
      const k = clave(pr.row, pr.column);
      (objetivo.get(k) || objetivo.set(k, []).get(k)).push(id);
    }

    // 6: validar límites/obstáculos/colisiones y detectar robos.
    const movimientos = new Map();  // id -> propuesta válida
    const robosPorVictima = new Map(); // victimId -> [attackerId]
    for (const [id, pr] of propuestas) {
      if (!pr) continue;              // bloqueado (límite no permitido)
      if (pr.exit) { movimientos.set(id, pr); continue; } // salida: se aplica en §11
      const k = clave(pr.row, pr.column);

      if (this._obstSet.has(k)) continue;            // obstáculo → no se mueve (§12)

      const ocupante = ocupadas.get(k);
      if (ocupante && ocupante !== id) {
        // Casilla ocupada en el estado inicial: nadie se mueve ahí (§13).
        // Si el ocupante es el portador y NO está protegido → intento de robo (§14).
        const occ = this.jugadores.get(ocupante);
        if (occ && occ.hasFlag && !this._protegido(occ, ahora)) {
          (robosPorVictima.get(ocupante) || robosPorVictima.set(ocupante, []).get(ocupante)).push(id);
        }
        continue; // en cualquier caso el atacante no avanza
      }

      if ((objetivo.get(k) || []).length > 1) continue; // varios a una casilla libre → nadie (§16)
      movimientos.set(id, pr);
    }

    // Resolver robos: por cada víctima, gana el atacante de menor playerId (§16).
    for (const [victimId, atacantes] of robosPorVictima) {
      atacantes.sort((a, b) => this._compararId(a, b));
      const attackerId = atacantes[0];
      const victima = this.jugadores.get(victimId);
      const atacante = this.jugadores.get(attackerId);
      if (!victima || !atacante || !victima.hasFlag) continue;
      victima.hasFlag = false;
      atacante.hasFlag = true;
      atacante.protectedUntil = ahora + this.cfg.protectionTimeMs; // protección al nuevo portador (§15)
      this.bandera.carrierId = attackerId;
      // §14: "ninguno de los jugadores cambiará de posición" — la víctima tampoco.
      movimientos.delete(victimId);
      eventos.push({
        type: 'FLAG_STOLEN',
        gameId: this.gameId,
        tick: this.tick,
        previousCarrierId: victimId,
        newCarrierId: attackerId,
        protectionTimeMs: this.cfg.protectionTimeMs,
      });
    }

    // 7: aplicar movimientos válidos (salvo las salidas, que van en §11).
    for (const [id, pr] of movimientos) {
      if (pr.exit) continue;
      const j = this.jugadores.get(id);
      j.row = pr.row;
      j.column = pr.column;
      if (pr.entering) j.insideBoard = true;

      // Recoger la bandera si cae sobre ella y está disponible/caída (§11).
      if (
        (this.bandera.status === 'AVAILABLE' || this.bandera.status === 'DROPPED') &&
        j.row === this.bandera.row && j.column === this.bandera.column
      ) {
        j.hasFlag = true;
        this.bandera.status = 'CARRIED';
        this.bandera.carrierId = id;
        eventos.push({ type: 'FLAG_PICKED_UP', gameId: this.gameId, tick: this.tick, playerId: id });
      }
    }

    // 8: la bandera sigue al portador.
    if (this.bandera.status === 'CARRIED') {
      const c = this.jugadores.get(this.bandera.carrierId);
      if (c) { this.bandera.row = c.row; this.bandera.column = c.column; }
    }

    // 11: victoria — un portador con movimiento de salida (§18).
    for (const [id, pr] of movimientos) {
      if (!pr.exit) continue;
      const j = this.jugadores.get(id);
      if (!j.hasFlag) continue;
      j.insideBoard = false;
      this.estado = ESTADOS.FINISHED;
      this.ganadorId = id;
      this.bandera.status = 'OUTSIDE';
      eventos.push({ type: 'GAME_OVER', gameId: this.gameId, winnerId: id, winnerName: j.name, reason: 'EXITED_WITH_FLAG' });
      break;
    }

    // §30 paso 14: incrementar el tick al final del ciclo.
    this.tick++;

    return { eventos, estado: this.estado };
  }

  // --- serialización (payloads del protocolo) ------------------------------

  serializarInicio() {
    return {
      gameId: this.gameId,
      rows: this.cfg.rows,
      columns: this.cfg.columns,
      movementIntervalMs: this.cfg.movementIntervalMs,
      protectionTimeMs: this.cfg.protectionTimeMs,
      obstacles: this.obstaculos.map((o) => ({ row: o.row, column: o.column })),
      flag: { row: this.bandera.row, column: this.bandera.column, status: this.bandera.status, carrierId: this.bandera.carrierId },
      players: [...this.jugadores.values()].filter((j) => j.connected).map((j) => this._jugadorPublico(j)),
    };
  }

  serializarEstado() {
    const ahora = Date.now();
    return {
      gameId: this.gameId,
      tick: this.tick,
      players: [...this.jugadores.values()].filter((j) => j.connected).map((j) => this._jugadorPublico(j, ahora)),
      flag: { status: this.bandera.status, row: this.bandera.row, column: this.bandera.column, carrierId: this.bandera.carrierId },
    };
  }

  _jugadorPublico(j, ahora = Date.now()) {
    return {
      playerId: j.playerId,
      name: j.name,
      row: j.row,
      column: j.column,
      direction: j.direction,
      insideBoard: j.insideBoard,
      hasFlag: j.hasFlag,
      protected: this._protegido(j, ahora),
    };
  }

  // --- helpers internos ----------------------------------------------------

  _protegido(j, ahora = Date.now()) {
    return j.protectedUntil > ahora;
  }

  // Orden estable de playerId para desempates (§16). Compara la parte numérica
  // ("P07" -> 7) para que P8 < P10 aunque el padding se quede corto con muchos
  // jugadores; si el formato no es numérico, cae a comparación lexicográfica.
  _compararId(a, b) {
    const na = parseInt(String(a).replace(/\D/g, ''), 10);
    const nb = parseInt(String(b).replace(/\D/g, ''), 10);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a < b ? -1 : a > b ? 1 : 0;
  }

  _fuera(r, c) {
    return r < 0 || c < 0 || r >= this.cfg.rows || c >= this.cfg.columns;
  }

  // Posición inicial aleatoria fuera del tablero, mirando hacia adentro (§7).
  _posicionInicial() {
    const { rows, columns } = this.cfg;
    const lado = Math.floor(Math.random() * 4);
    if (lado === 0) return { row: -1, column: this._rnd(columns), direction: 'DOWN' };       // arriba
    if (lado === 1) return { row: rows, column: this._rnd(columns), direction: 'UP' };        // abajo
    if (lado === 2) return { row: this._rnd(rows), column: -1, direction: 'RIGHT' };           // izquierda
    return { row: this._rnd(rows), column: columns, direction: 'LEFT' };                        // derecha
  }

  // Casilla de entrada al tablero según el borde donde está el jugador.
  _celdaEntrada(j) {
    const { rows, columns } = this.cfg;
    if (j.row === -1) return [0, j.column];
    if (j.row === rows) return [rows - 1, j.column];
    if (j.column === -1) return [j.row, 0];
    if (j.column === columns) return [j.row, columns - 1];
    return [j.row, j.column]; // ya dentro (no debería pasar)
  }

  // El portador puede salir solo por el borde correcto según su dirección (§17).
  _salidaValida(j) {
    const { rows, columns } = this.cfg;
    return (
      (j.row === 0 && j.direction === 'UP') ||
      (j.row === rows - 1 && j.direction === 'DOWN') ||
      (j.column === 0 && j.direction === 'LEFT') ||
      (j.column === columns - 1 && j.direction === 'RIGHT')
    );
  }

  _rnd(n) { return Math.floor(Math.random() * n); }

  // Obstáculos aleatorios que NO tapan la bandera ni bloquean rutas (§10).
  _generarObstaculos() {
    const { rows, columns, obstaclePercentage } = this.cfg;
    const total = Math.floor((rows * columns * obstaclePercentage) / 100);
    this.obstaculos = [];
    this._obstSet = new Set();
    let intentos = 0;
    while (this.obstaculos.length < total && intentos < total * 40) {
      intentos++;
      const r = this._rnd(rows), c = this._rnd(columns);
      const k = clave(r, c);
      if (this._obstSet.has(k)) continue;
      // Las casillas del borde son entradas posibles (§7). Si se bloquean,
      // un jugador que aparezca frente a una de ellas no puede entrar nunca.
      if (r === 0 || c === 0 || r === rows - 1 || c === columns - 1) continue;
      // No en el centro (donde va la bandera).
      const cr = Math.floor(rows / 2), cc = Math.floor(columns / 2);
      if (Math.abs(r - cr) <= 1 && Math.abs(c - cc) <= 1) continue;
      this._obstSet.add(k);
      this.obstaculos.push({ row: r, column: c });
      // Verificar que el tablero siga conectado; si no, revertir.
      if (!this._tableroConectado()) {
        this._obstSet.delete(k);
        this.obstaculos.pop();
      }
    }
  }

  // BFS/flood-fill: comprueba que todas las casillas libres sean alcanzables
  // desde el centro (garantiza rutas al centro y a los bordes, §10).
  _tableroConectado() {
    const { rows, columns } = this.cfg;
    const cr = Math.floor(rows / 2), cc = Math.floor(columns / 2);
    if (this._obstSet.has(clave(cr, cc))) return false;
    const vistas = new Set([clave(cr, cc)]);
    const cola = [[cr, cc]];
    while (cola.length) {
      const [r, c] = cola.shift();
      for (const [dr, dc] of Object.values(DELTA)) {
        const nr = r + dr, nc = c + dc;
        const k = clave(nr, nc);
        if (this._fuera(nr, nc) || vistas.has(k) || this._obstSet.has(k)) continue;
        vistas.add(k);
        cola.push([nr, nc]);
      }
    }
    const libres = rows * columns - this._obstSet.size;
    return vistas.size === libres;
  }

  // Bandera cerca del centro, dentro del área central (§11).
  _colocarBandera() {
    const { rows, columns, centralFlagAreaPercentage } = this.cfg;
    const rr = Math.max(1, Math.floor((rows * centralFlagAreaPercentage) / 100));
    const rc = Math.max(1, Math.floor((columns * centralFlagAreaPercentage) / 100));
    const cr = Math.floor(rows / 2), cc = Math.floor(columns / 2);
    for (let i = 0; i < 200; i++) {
      const r = cr + this._rnd(rr) - Math.floor(rr / 2);
      const c = cc + this._rnd(rc) - Math.floor(rc / 2);
      if (this._fuera(r, c) || this._obstSet.has(clave(r, c))) continue;
      this.bandera = { row: r, column: c, status: 'AVAILABLE', carrierId: null };
      return;
    }
    this.bandera = { row: cr, column: cc, status: 'AVAILABLE', carrierId: null };
  }
}
