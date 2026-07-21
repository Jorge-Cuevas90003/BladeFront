// ============================================================================
//  Verificación headless de los 3 fixes del protocolo.
//  Correr:  node scratchpad/verify-fixes.mjs
// ============================================================================

import { JuegoCaptura, ESTADOS } from '../assets/captura-bandera/js/juego-captura.js';

let ok = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ ${msg}`); }
}

// ============================================================================
// FIX 2: playerId padding
// ============================================================================
console.log('\n=== FIX 2: playerId padding ===');
{
  const juego = new JuegoCaptura({ maximumPlayers: 150, rows: 10, columns: 10 });
  const ids = [];
  for (let i = 0; i < 110; i++) {
    const r = juego.agregarJugador('T' + i);
    if (r.jugador) ids.push(r.jugador.playerId);
  }
  assert(ids[0] === 'P001', `Primer ID es P001 (got ${ids[0]})`);
  assert(ids[9] === 'P010', `10mo ID es P010 (got ${ids[9]})`);
  assert(ids[99] === 'P100', `100mo ID es P100 (got ${ids[99]})`);
  assert(ids[109] === 'P110', `110mo ID es P110 (got ${ids[109]})`);

  // Verificar que sort lexicográfico = numérico
  const sorted = [...ids].sort();
  const isSame = sorted.every((v, i) => v === ids[i]);
  assert(isSame, 'Sort lexicográfico preserva orden numérico');
}

// ============================================================================
// FIX 2b: padding con default config (maximumPlayers: 30)
// ============================================================================
console.log('\n=== FIX 2b: padding con default (max 30) ===');
{
  const juego = new JuegoCaptura({ rows: 10, columns: 10 });
  const r = juego.agregarJugador('Test');
  assert(r.jugador.playerId === 'P001', `Default config da P001 (got ${r.jugador.playerId})`);
}

// ============================================================================
// FIX 1: §14 — víctima no se mueve en robo
// ============================================================================
console.log('\n=== FIX 1: §14 — víctima no se mueve ===');
{
  const juego = new JuegoCaptura({ rows: 5, columns: 5, obstaclePercentage: 0, maximumPlayers: 10 });
  const p1 = juego.agregarJugador('Víctima').jugador;
  const p2 = juego.agregarJugador('Atacante').jugador;
  juego.iniciar();

  // Forzar posiciones: víctima en (2,2) con bandera yendo RIGHT, atacante en (2,1) yendo RIGHT.
  const v = juego.jugadores.get(p1.playerId);
  const a = juego.jugadores.get(p2.playerId);
  v.row = 2; v.column = 2; v.direction = 'RIGHT'; v.insideBoard = true;
  v.hasFlag = true; v.protectedUntil = 0;
  a.row = 2; a.column = 1; a.direction = 'RIGHT'; a.insideBoard = true;
  a.hasFlag = false;
  juego.bandera = { row: 2, column: 2, status: 'CARRIED', carrierId: p1.playerId };

  const { eventos } = juego.ciclo();

  const robo = eventos.find(e => e.type === 'FLAG_STOLEN');
  assert(!!robo, 'Se generó evento FLAG_STOLEN');
  assert(robo.newCarrierId === p2.playerId, 'Atacante tiene la bandera');

  // §14: "ninguno de los jugadores cambiará de posición"
  assert(v.row === 2 && v.column === 2, `Víctima NO se movió (pos: ${v.row},${v.column})`);
  assert(a.row === 2 && a.column === 1, `Atacante NO se movió (pos: ${a.row},${a.column})`);
  assert(!v.hasFlag, 'Víctima perdió la bandera');
  assert(a.hasFlag, 'Atacante tiene la bandera');
}

// ============================================================================
// FIX 3a: tick++ al final del ciclo (§30 paso 14)
// ============================================================================
console.log('\n=== FIX 3a: tick++ al final ===');
{
  const juego = new JuegoCaptura({ rows: 5, columns: 5, obstaclePercentage: 0, maximumPlayers: 10 });
  juego.agregarJugador('A');
  juego.iniciar();

  assert(juego.tick === 0, `tick inicial es 0 (got ${juego.tick})`);
  juego.ciclo();
  assert(juego.tick === 1, `Después del 1er ciclo, tick es 1 (got ${juego.tick})`);

  // Verificar que los eventos discretos usan el tick ANTES del incremento
  const j2 = new JuegoCaptura({ rows: 5, columns: 5, obstaclePercentage: 0, maximumPlayers: 10 });
  const pa = j2.agregarJugador('Vic').jugador;
  const pb = j2.agregarJugador('Atk').jugador;
  j2.iniciar();

  j2.ciclo(); j2.ciclo(); j2.ciclo(); // tick ahora es 3

  // Forzar robo en el siguiente ciclo
  const va = j2.jugadores.get(pa.playerId);
  const ab = j2.jugadores.get(pb.playerId);
  va.row = 2; va.column = 2; va.direction = 'RIGHT'; va.insideBoard = true;
  va.hasFlag = true; va.protectedUntil = 0;
  ab.row = 2; ab.column = 1; ab.direction = 'RIGHT'; ab.insideBoard = true;
  j2.bandera = { row: 2, column: 2, status: 'CARRIED', carrierId: pa.playerId };

  const tickAntes = j2.tick; // 3
  const { eventos } = j2.ciclo();
  const tickDespues = j2.tick; // 4

  const stolen = eventos.find(e => e.type === 'FLAG_STOLEN');
  assert(stolen.tick === tickAntes, `FLAG_STOLEN tiene tick del ciclo (${stolen.tick} === ${tickAntes})`);
  assert(tickDespues === tickAntes + 1, `tick incrementó al final (${tickDespues} === ${tickAntes + 1})`);
}

// ============================================================================
// FIX 3b: quitarJugador funciona correctamente
// ============================================================================
console.log('\n=== FIX 3b: quitarJugador ===');
{
  const juego = new JuegoCaptura({ rows: 5, columns: 5, obstaclePercentage: 0, maximumPlayers: 10 });
  const p1 = juego.agregarJugador('Carrier').jugador;
  const p2 = juego.agregarJugador('Other').jugador;
  juego.iniciar();

  const j = juego.jugadores.get(p1.playerId);
  j.row = 2; j.column = 2; j.insideBoard = true;
  j.hasFlag = true;
  juego.bandera = { row: 2, column: 2, status: 'CARRIED', carrierId: p1.playerId };

  const { eventos } = juego.quitarJugador(p1.playerId);
  assert(eventos.length === 1, 'Un evento generado');
  assert(eventos[0].type === 'PLAYER_DISCONNECTED', 'Evento es PLAYER_DISCONNECTED');
  assert(eventos[0].gameId === juego.gameId, 'Tiene gameId');
  assert(!('tick' in eventos[0]), 'PLAYER_DISCONNECTED NO tiene tick (per spec §29.7)');
  assert(juego.bandera.status === 'DROPPED', 'Bandera cayó a DROPPED');

  // Idempotente
  const { eventos: e2 } = juego.quitarJugador(p1.playerId);
  assert(e2.length === 0, 'Segunda desconexión es idempotente');
}

// ============================================================================
// Smoke test: partida completa
// ============================================================================
console.log('\n=== Smoke test: partida completa ===');
{
  const juego = new JuegoCaptura({ rows: 10, columns: 10, obstaclePercentage: 5, maximumPlayers: 10 });
  for (let i = 0; i < 4; i++) juego.agregarJugador('Bot' + i);
  const inicio = juego.iniciar();
  assert(inicio.players.length === 4, '4 jugadores en inicio');
  assert(juego.estado === ESTADOS.RUNNING, 'Estado RUNNING');

  let ciclos = 0;
  while (juego.estado === ESTADOS.RUNNING && ciclos < 500) {
    for (const j of juego.jugadores.values()) {
      if (j.connected) {
        const dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
        juego.cambiarDireccion(j.playerId, dirs[Math.floor(Math.random() * 4)]);
      }
    }
    juego.ciclo();
    ciclos++;
  }
  assert(ciclos > 0, `Partida corrió ${ciclos} ciclos sin crash`);
  assert(juego.tick === ciclos, `tick === ciclos (${juego.tick} === ${ciclos})`);
}

// ============================================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Resultado: ${ok} OK, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
