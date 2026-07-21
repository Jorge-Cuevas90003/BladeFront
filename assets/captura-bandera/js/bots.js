// ============================================================================
//  IA simple para rellenar jugadores en el MODO LOCAL de prueba. No es parte
//  del protocolo: solo decide direcciones para que haya movimiento y se pueda
//  testear el juego sin 12 personas conectadas. ES module sin dependencias.
//
//  Estrategia: greedy hacia el objetivo (la bandera, o el borde más cercano si
//  ya la llevo), PERO solo entre direcciones realmente LIBRES (mira obstáculos,
//  bordes y otros jugadores 1 casilla adelante). Con memoria anti-atasco: si
//  deja de acercarse al objetivo durante varios ciclos (atascado contra un
//  obstáculo o haciendo ping-pong), explora para escapar del rincón.
// ============================================================================

const DELTAS = { UP: [-1, 0], DOWN: [1, 0], LEFT: [0, -1], RIGHT: [0, 1] };
const OPUESTA = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
const ORDEN = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

// Memoria por bot para detectar falta de progreso. Se reutiliza entre partidas
// (los ids P01.. se repiten); es auto-sanable: si la posición no calza, se
// reinicia sola en el primer ciclo.
const memoria = new Map(); // playerId -> { mejorDist, sinAvanzar, teniaBandera }

// Permite reiniciar la memoria al empezar una nueva partida local (opcional).
export function reiniciarBots() { memoria.clear(); }

function salidaValida(j, dir, rows, columns) {
  return (
    (j.row === 0 && dir === 'UP') ||
    (j.row === rows - 1 && dir === 'DOWN') ||
    (j.column === 0 && dir === 'LEFT') ||
    (j.column === columns - 1 && dir === 'RIGHT')
  );
}

// jugador: estado público del bot; estado: serializarEstado(); cfg: config;
// obstaculos: [{row,column}] del tablero (viene del motor en modo local).
export function decidirDireccion(jugador, estado, cfg, obstaculos = []) {
  // Aún fuera del tablero: mantener la dirección de entrada (hacia adentro).
  if (!jugador.insideBoard) return jugador.direction;

  const { rows, columns } = cfg;

  // --- objetivo: bandera, o el borde más cercano si ya la llevo ---
  let tr, tc;
  if (jugador.hasFlag) {
    const bordes = [
      [jugador.row, 0, jugador.column],                 // arriba
      [rows - 1 - jugador.row, rows - 1, jugador.column], // abajo
      [jugador.column, jugador.row, 0],                 // izquierda
      [columns - 1 - jugador.column, jugador.row, columns - 1], // derecha
    ];
    bordes.sort((a, b) => a[0] - b[0]);
    tr = bordes[0][1]; tc = bordes[0][2];
  } else {
    tr = estado.flag.row; tc = estado.flag.column;
  }
  const distA = (r, c) => Math.abs(r - tr) + Math.abs(c - tc);

  // --- memoria anti-atasco: ¿sigo acercándome al objetivo? ---
  let m = memoria.get(jugador.playerId);
  if (!m || m.teniaBandera !== jugador.hasFlag) {
    m = { mejorDist: Infinity, sinAvanzar: 0, teniaBandera: jugador.hasFlag };
    memoria.set(jugador.playerId, m);
  }
  const distActual = distA(jugador.row, jugador.column);
  if (distActual < m.mejorDist) { m.mejorDist = distActual; m.sinAvanzar = 0; }
  else m.sinAvanzar++;
  const explorando = m.sinAvanzar >= 6; // 6 ciclos sin acercarse → escapar

  // --- direcciones realmente libres 1 casilla adelante ---
  const obstSet = new Set(obstaculos.map((o) => o.row + ',' + o.column));
  const ocupadas = new Set();
  for (const p of estado.players) {
    if (p.playerId !== jugador.playerId && p.insideBoard) ocupadas.add(p.row + ',' + p.column);
  }

  const opciones = [];
  for (const dir of ORDEN) {
    const [dr, dc] = DELTAS[dir];
    const nr = jugador.row + dr, nc = jugador.column + dc;
    const fuera = nr < 0 || nc < 0 || nr >= rows || nc >= columns;
    if (fuera) {
      // salir del tablero solo cuenta si llevo la bandera por mi borde correcto
      if (jugador.hasFlag && salidaValida(jugador, dir, rows, columns)) opciones.push({ dir, score: -1 });
      continue;
    }
    const k = nr + ',' + nc;
    if (obstSet.has(k) || ocupadas.has(k)) continue; // bloqueada por obstáculo/jugador
    opciones.push({ dir, score: distA(nr, nc) });
  }

  if (opciones.length === 0) return jugador.direction; // encerrado: nada que hacer

  opciones.sort((a, b) => a.score - b.score); // menor distancia = mejor progreso

  // Una salida ganadora (score < 0) SIEMPRE se toma, aunque el bot esté
  // "explorando": es la condición de victoria del docx (§17-18), nunca conviene
  // vagar en vez de salir con la bandera por el borde correcto.
  if (opciones[0].score < 0) return opciones[0].dir;

  // Atascado o en ping-pong sin progreso: elegir una LIBRE distinta para salir
  // del mínimo local (evita la dirección actual si hay alternativa).
  if (explorando && opciones.length > 1) {
    const alt = opciones.filter((o) => o.dir !== jugador.direction && o.dir !== OPUESTA[jugador.direction]);
    const pool = alt.length ? alt : opciones;
    m.sinAvanzar = 3; // seguir explorando un par de ciclos más, no reiniciar de golpe
    return pool[Math.floor(Math.random() * pool.length)].dir;
  }

  // Marcha normal: mejor progreso, evitando dar media vuelta si hay algo casi igual de bueno.
  const mejor = opciones[0];
  if (mejor.dir === OPUESTA[jugador.direction] && opciones.length > 1 && opciones[1].score <= mejor.score + 1) {
    return opciones[1].dir;
  }
  return mejor.dir;
}
