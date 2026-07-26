// ============================================================================
//  Pruebas de los bots del modo local v3.
//  Correr:  node test/verify-bots-v3.mjs
//
//  Lo que importa aquí no es que jueguen bien, sino que la partida AVANCE:
//  que lleguen a la bandera, que el portador salga y que nadie se quede
//  girando en el sitio. Un bot atascado deja la partida colgada para siempre.
// ============================================================================

import { MotorV3 } from '../assets/captura-v3/js/motor-v3.js';
import { decidirBot, reiniciarBots } from '../assets/captura-v3/js/bots-v3.js';
import { DIRECCIONES, ESTADO_BANDERA, ESTADO_PARTIDA, PARAMS_DEFECTO } from '../red/v3/protocolo-v3.js';

let ok = 0, fail = 0;
const check = (cond, msg) => {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ FALLA: ${msg}`); }
};

// Corre una partida entera con TODOS los jugadores manejados por bots.
function partidaDeBots(nBots, maxCiclos = 3000, params = {}) {
  reiniciarBots();
  const m = new MotorV3(params);
  for (let i = 0; i < nBots; i++) m.agregarJugador('Bot' + (i + 1));
  m.iniciar();

  let ciclos = 0;
  let movimientos = 0;
  let recogidas = 0, robos = 0;
  const previas = new Map();

  while (m.estado === ESTADO_PARTIDA.RUNNING && ciclos < maxCiclos) {
    const visible = m.serializarEstado();
    for (const p of visible.players) {
      const { direction, interactuar } = decidirBot(p, visible, m.p);
      m.encolarInput(p.playerId, direction);
      if (interactuar) m.encolarInteract(p.playerId);
    }
    const { eventos } = m.ciclo();
    for (const e of eventos) {
      if (e.type === 0x26) recogidas++;
      if (e.type === 0x27) robos++;
    }

    for (const p of m.serializarEstado().players) {
      const clave = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
      if (previas.get(p.playerId) !== clave) movimientos++;
      previas.set(p.playerId, clave);
    }
    ciclos++;
  }
  return { motor: m, ciclos, movimientos, recogidas, robos };
}

// ── 1. Sin rival, la partida siempre termina ────────────────────────────────
// Un jugador solo es el único caso donde NADIE puede disputar la bandera, así
// que sirve de referencia de que los bots saben jugar: llegan, la toman y salen.
console.log('\n== 1. Un jugador solo (nadie puede disputar) ==');
for (let i = 0; i < 5; i++) {
  const r = partidaDeBots(1);
  check(r.motor.estado === ESTADO_PARTIDA.FINISHED && r.recogidas === 1,
    `intento ${i + 1}: recoge y sale (${r.ciclos} ciclos)`);
}

// ── 2. EL HALLAZGO: con §14 al pie de la letra la partida se bloquea ────────
//
// §14: "no existe tiempo de espera, no existe inmunidad, el robo es
// instantáneo". §10: "los jugadores no colisionan entre sí". §21: una única
// playerSpeed para todos.
//
// Juntas, las tres hacen que un perseguidor pegado al portador le robe la
// bandera cada ciclo, y como van a la misma velocidad y pueden ocupar el mismo
// punto, ninguno logra separarse nunca. Esto NO es un defecto de los bots: es
// consecuencia directa de la especificación, y le pasaría igual a dos humanos.
//
// Se mide sobre varios intentos porque el spawn usa un ángulo aleatorio (§9):
// que dos jugadores acaben bloqueados depende de si aparecen cerca o en lados
// opuestos. Que sea INTERMITENTE lo empeora, no lo mejora — una partida
// oficial puede colgarse o no según la suerte del reparto inicial.
console.log('\n== 2. Bloqueo por falta de inmunidad (§14) ==');

// 2a. Demostración DETERMINISTA, sin depender del spawn ni de los bots: dos
// jugadores en el mismo punto, ambos corriendo hacia el mismo lado a la misma
// velocidad, ambos pulsando interactuar cada ciclo. Es exactamente lo que §14
// permite. Devuelve quién gana y cuántos robos hubo.
function duelo({ x0 = 0 } = {}) {
  const m = new MotorV3(); // protectionTimeMs = 0, el valor oficial
  const a = m.agregarJugador('Portador').jugador;
  const b = m.agregarJugador('Perseguidor').jugador;
  m.iniciar();
  Object.assign(m.jugadores.get(a.playerId), { x: x0, y: 0, hasFlag: true });
  Object.assign(m.jugadores.get(b.playerId), { x: x0, y: 0 });
  m.bandera = { x: x0, y: 0, status: ESTADO_BANDERA.CARRIED, carrierId: a.playerId };

  let robos = 0, ciclos = 0;
  while (m.estado === ESTADO_PARTIDA.RUNNING && ciclos < 400) {
    m.encolarInput(a.playerId, DIRECCIONES.RIGHT);
    m.encolarInput(b.playerId, DIRECCIONES.RIGHT);
    m.encolarInteract(a.playerId);
    m.encolarInteract(b.playerId);
    const { eventos } = m.ciclo();
    robos += eventos.filter((e) => e.type === 0x27).length;
    ciclos++;
  }
  const ja = m.jugadores.get(a.playerId), jb = m.jugadores.get(b.playerId);
  return { motor: m, robos, ciclos, separacion: Math.hypot(ja.x - jb.x, ja.y - jb.y) };
}
{
  const d = duelo();
  check(d.robos >= d.ciclos - 1,
    `la bandera cambia de dueño en CADA ciclo: ${d.robos} robos en ${d.ciclos} ciclos`);
  check(d.separacion < 1,
    `nadie logra separarse nunca (distancia final ${d.separacion.toFixed(2)})`);
  console.log(`     → duelo: ${d.robos} robos / ${d.ciclos} ciclos, gana #${d.motor.ganadorId}`);

  // Y lo más grave: como la posesión alterna cada ciclo, quien gana depende de
  // la PARIDAD del ciclo en que se cruza el borde. Arrancar un solo paso más
  // atrás (11 unidades, lo que avanza un ciclo) le da la victoria al otro, sin
  // que ninguno de los dos haya jugado distinto.
  const cerca = duelo({ x0: 0 });
  const unPasoAtras = duelo({ x0: -11 });
  check(cerca.ciclos !== unPasoAtras.ciclos, `un paso atrás cambia la duración: ${cerca.ciclos} vs ${unPasoAtras.ciclos} ciclos`);
  check(cerca.motor.ganadorId !== unPasoAtras.motor.ganadorId,
    `y con ello cambia el GANADOR: #${cerca.motor.ganadorId} vs #${unPasoAtras.motor.ganadorId}`);
  console.log(`     → el ganador lo decide la paridad del ciclo, no el juego`);
}

// 2b. Con qué frecuencia pasa en partidas reales. Es estadístico porque el
// ángulo de aparición es aleatorio (§9), así que se toman muchos intentos y se
// afirma sobre el agregado, no sobre una partida concreta.
for (const n of [2, 5]) {
  const INTENTOS = 20;
  let bloqueadas = 0, robosTotales = 0, ciclosTotales = 0;
  for (let i = 0; i < INTENTOS; i++) {
    const r = partidaDeBots(n, 1200);
    if (r.motor.estado !== ESTADO_PARTIDA.FINISHED) bloqueadas++;
    robosTotales += r.robos;
    ciclosTotales += r.ciclos;
  }
  // Con 20 intentos y una tasa de bloqueo observada del 35-60%, que salgan
  // CERO es prácticamente imposible; la prueba ya no es intermitente.
  check(bloqueadas > 0,
    `con ${n} jugadores se cuelgan ${bloqueadas}/${INTENTOS} partidas`);
  console.log(`     → ${n} jugadores: ${bloqueadas}/${INTENTOS} colgadas · ${robosTotales} robos en ${ciclosTotales} ciclos`);
}

// ── 3. Con inmunidad, las mismas partidas sí terminan ───────────────────────
// protectionTimeMs está FUERA de la spec y por defecto vale 0. Esta prueba
// mide cuánta inmunidad hace falta para que el juego sea jugable, que es el
// dato concreto que le hace falta al equipo para decidir el valor.
console.log('\n== 3. La inmunidad desbloquea la partida ==');
for (const ms of [200, 400, 1000]) {
  const r = partidaDeBots(5, 3000, { protectionTimeMs: ms });
  check(r.motor.estado === ESTADO_PARTIDA.FINISHED,
    `con protectionTimeMs=${ms} sí termina (${r.ciclos} ciclos, ${r.robos} robos)`);
}
{
  const r = partidaDeBots(12, 4000, { protectionTimeMs: 400 });
  check(r.motor.estado === ESTADO_PARTIDA.FINISHED,
    `y aguanta 12 jugadores (${r.ciclos} ciclos, ${r.robos} robos)`);
}

// ── 4. Nadie se queda atascado ──────────────────────────────────────────────
console.log('\n== 4. Sin atascos ==');
{
  const r = partidaDeBots(6, 3000, { protectionTimeMs: 400 });
  check(r.movimientos > r.ciclos * 2, `se mueven de forma sostenida (${r.movimientos} cambios en ${r.ciclos} ciclos)`);
  check(r.ciclos < 2000, `sin agotar el límite de ciclos (${r.ciclos})`);
}

// ── 3. El portador se aleja del centro ──────────────────────────────────────
console.log('\n== 5. Quien lleva la bandera busca la salida ==');
{
  reiniciarBots();
  const m = new MotorV3();
  const a = m.agregarJugador('Portador').jugador;
  m.iniciar();
  // Se le pone en el centro con la bandera.
  Object.assign(m.jugadores.get(a.playerId), { x: 0, y: 0, hasFlag: true });
  m.bandera = { x: 0, y: 0, status: ESTADO_BANDERA.CARRIED, carrierId: a.playerId };

  let distAnterior = 0;
  let siempreCrece = true;
  for (let i = 0; i < 60 && m.estado === ESTADO_PARTIDA.RUNNING; i++) {
    const visible = m.serializarEstado();
    const p = visible.players[0];
    const { direction } = decidirBot(p, visible, m.p);
    m.encolarInput(a.playerId, direction);
    m.ciclo();
    const j = m.jugadores.get(a.playerId);
    const d = Math.hypot(j.x, j.y);
    if (i > 0 && d < distAnterior - 1e-9) siempreCrece = false;
    distAnterior = d;
  }
  check(siempreCrece, 'la distancia al centro nunca disminuye mientras lleva la bandera');
  check(m.estado === ESTADO_PARTIDA.FINISHED, `y consigue salir (${m.estado === ESTADO_PARTIDA.FINISHED ? 'sí' : 'no'})`);
}

// ── 6. Persiguen al portador cuando otro la lleva ───────────────────────────
console.log('\n== 6. Persecución del portador ==');
{
  reiniciarBots();
  const m = new MotorV3();
  const portador = m.agregarJugador('Portador').jugador;
  const cazador = m.agregarJugador('Cazador').jugador;
  m.iniciar();

  Object.assign(m.jugadores.get(portador.playerId), { x: 0, y: 0, hasFlag: true });
  Object.assign(m.jugadores.get(cazador.playerId), { x: 400, y: 0 });
  m.bandera = { x: 0, y: 0, status: ESTADO_BANDERA.CARRIED, carrierId: portador.playerId };

  const dInicial = 400;
  for (let i = 0; i < 25; i++) {
    const visible = m.serializarEstado();
    const c = visible.players.find((p) => p.playerId === cazador.playerId);
    const { direction } = decidirBot(c, visible, m.p);
    m.encolarInput(cazador.playerId, direction);
    m.ciclo(); // el portador no se mueve: no se le encola dirección
  }
  const c = m.jugadores.get(cazador.playerId);
  const p = m.jugadores.get(portador.playerId);
  const dFinal = Math.hypot(c.x - p.x, c.y - p.y);
  check(dFinal < dInicial, `el cazador se acerca al portador (${dInicial} → ${dFinal.toFixed(1)})`);
}

// ── 7. Solo usan direcciones válidas (§10) ──────────────────────────────────
console.log('\n== 7. Solo direcciones legales ==');
{
  reiniciarBots();
  const m = new MotorV3();
  for (let i = 0; i < 8; i++) m.agregarJugador('B' + i);
  m.iniciar();
  const validas = new Set(Object.values(DIRECCIONES));
  let todasValidas = true;
  for (let i = 0; i < 200 && m.estado === ESTADO_PARTIDA.RUNNING; i++) {
    const visible = m.serializarEstado();
    for (const p of visible.players) {
      const { direction } = decidirBot(p, visible, m.p);
      if (!validas.has(direction)) todasValidas = false;
      m.encolarInput(p.playerId, direction);
    }
    m.ciclo();
  }
  check(todasValidas, 'nunca proponen una dirección fuera de las cinco de §25');
}

// ── 8. Aguantan configuraciones raras ───────────────────────────────────────
// Con inmunidad activada, para aislar el efecto de los parámetros del bloqueo
// de §14 que ya quedó medido arriba.
console.log('\n== 8. Parámetros no estándar ==');
for (const params of [
  { circleRadius: 150, mapSize: 800 },
  { circleRadius: 900, mapSize: 2000 },
  { playerSpeed: 60, tickIntervalMs: 100 },
  { interactionRadius: 20 },
]) {
  const r = partidaDeBots(4, 6000, { ...params, protectionTimeMs: 400 });
  const desc = Object.entries(params).map(([k, v]) => `${k}=${v}`).join(' ');
  check(r.motor.estado === ESTADO_PARTIDA.FINISHED, `termina con ${desc} (${r.ciclos} ciclos)`);
}

console.log(`\n${'='.repeat(52)}`);
console.log(`Resultado: ${ok} OK, ${fail} FALLAS`);
process.exit(fail ? 1 : 0);
