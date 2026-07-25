// ============================================================================
//  Pruebas del motor continuo PRFC v3 (assets/captura-v3/js/motor-v3.js).
//  Correr:  node test/verify-motor-v3.mjs
//
//  Cada bloque cita el párrafo de la spec que verifica. Los casos marcados
//  como INTERPRETACIÓN cubren huecos que el PRFC no cierra; si el equipo los
//  enmienda, estas pruebas son las que hay que actualizar.
// ============================================================================

import { MotorV3 } from '../assets/captura-v3/js/motor-v3.js';
import {
  DIRECCIONES, ESTADO_BANDERA, ESTADO_PARTIDA, RAZON_RECHAZO, TIPOS, PARAMS_DEFECTO,
} from '../red/v3/protocolo-v3.js';

let ok = 0, fail = 0;
const check = (cond, msg) => {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ FALLA: ${msg}`); }
};

// Partida arrancada con N jugadores, colocados a mano para que sea determinista.
function partida(n = 2, params = {}) {
  const m = new MotorV3(params);
  for (let i = 0; i < n; i++) m.agregarJugador('J' + (i + 1));
  m.iniciar();
  return m;
}
const poner = (m, id, x, y, dir = DIRECCIONES.NONE) => {
  const j = m.jugadores.get(id);
  Object.assign(j, { x, y, direction: dir });
  return j;
};

// ── 1. Spawn (§9) ───────────────────────────────────────────────────────────
console.log('\n== 1. Posición inicial (§9) ==');
{
  const m = new MotorV3();
  const radioEsperado = PARAMS_DEFECTO.circleRadius + PARAMS_DEFECTO.spawnMargin; // 580
  let todosBien = true, todosFuera = true;
  for (let i = 0; i < 50; i++) {
    const { jugador } = m.agregarJugador('J' + i);
    const d = Math.hypot(jugador.x, jugador.y);
    if (Math.abs(d - radioEsperado) > 1e-9) todosBien = false;
    if (d <= PARAMS_DEFECTO.circleRadius) todosFuera = false;
  }
  check(todosBien, `todos aparecen a exactamente ${radioEsperado} del origen`);
  check(todosFuera, 'y ninguno aparece dentro del círculo central');
  check(m.jugadores.get(1).direction === DIRECCIONES.NONE, 'arrancan sin dirección (NONE)');
}

// ── 2. Movimiento (§10, §5) ─────────────────────────────────────────────────
console.log('\n== 2. Movimiento y ejes (§10, §5) ==');
{
  const m = partida(1);
  const paso = (PARAMS_DEFECTO.playerSpeed * PARAMS_DEFECTO.tickIntervalMs) / 1000;
  check(paso === 11, `el paso por ciclo es 220×50/1000 = 11 (calculado ${paso})`);

  poner(m, 1, 0, 0, DIRECCIONES.UP);
  m.ciclo();
  check(Math.abs(m.jugadores.get(1).y - (-11)) < 1e-9, `UP RESTA en y porque y crece hacia abajo (y=${m.jugadores.get(1).y})`);

  poner(m, 1, 0, 0, DIRECCIONES.DOWN); m.ciclo();
  check(Math.abs(m.jugadores.get(1).y - 11) < 1e-9, 'DOWN suma en y');
  poner(m, 1, 0, 0, DIRECCIONES.RIGHT); m.ciclo();
  check(Math.abs(m.jugadores.get(1).x - 11) < 1e-9, 'RIGHT suma en x');
  poner(m, 1, 0, 0, DIRECCIONES.LEFT); m.ciclo();
  check(Math.abs(m.jugadores.get(1).x - (-11)) < 1e-9, 'LEFT resta en x');
  poner(m, 1, 5, 5, DIRECCIONES.NONE); m.ciclo();
  check(m.jugadores.get(1).x === 5 && m.jugadores.get(1).y === 5, 'NONE no mueve');
}

// ── 3. Recorte a los límites del mapa (§30.5, §5) ───────────────────────────
console.log('\n== 3. Recorte al mapa (§30.5) ==');
{
  const m = partida(1);
  const mitad = PARAMS_DEFECTO.mapSize / 2; // 1000
  poner(m, 1, mitad - 2, 0, DIRECCIONES.RIGHT);
  m.ciclo();
  check(m.jugadores.get(1).x === mitad, `se recorta en +${mitad} (x=${m.jugadores.get(1).x})`);
  for (let i = 0; i < 5; i++) m.ciclo();
  check(m.jugadores.get(1).x === mitad, 'y se queda ahí por más ciclos que pasen');

  poner(m, 1, -mitad + 2, 0, DIRECCIONES.LEFT); m.ciclo();
  check(m.jugadores.get(1).x === -mitad, `se recorta en -${mitad}`);
}

// ── 4. Recoger la bandera (§13) ─────────────────────────────────────────────
console.log('\n== 4. Recoger la bandera (§13) ==');
{
  const m = partida(2);
  // Justo en el borde del radio de interacción: 60 exactos → sí alcanza.
  poner(m, 1, PARAMS_DEFECTO.interactionRadius, 0);
  poner(m, 2, 900, 900);
  m.encolarInteract(1);
  const { eventos } = m.ciclo();
  check(eventos.some((e) => e.type === TIPOS.FLAG_PICKED_UP && e.playerId === 1), 'a 60 exactos SÍ la recoge (≤, no <)');
  check(m.bandera.status === ESTADO_BANDERA.CARRIED && m.bandera.carrierId === 1, 'la bandera queda CARRIED por él');

  // Un pelo más lejos: no alcanza.
  const m2 = partida(2);
  poner(m2, 1, PARAMS_DEFECTO.interactionRadius + 0.01, 0);
  m2.encolarInteract(1);
  m2.ciclo();
  check(m2.bandera.status === ESTADO_BANDERA.AVAILABLE, 'a 60.01 NO la alcanza');

  // Sin INTERACT no pasa nada por más encima que esté.
  const m3 = partida(2);
  poner(m3, 1, 0, 0);
  m3.ciclo();
  check(m3.bandera.status === ESTADO_BANDERA.AVAILABLE, 'estar encima sin mandar INTERACT no la recoge');
}

// ── 5. La bandera sigue al portador (§7, §30.7) ─────────────────────────────
console.log('\n== 5. La bandera sigue al portador (§7) ==');
{
  const m = partida(1);
  poner(m, 1, 0, 0);
  m.encolarInteract(1);
  m.ciclo();
  poner(m, 1, 0, 0, DIRECCIONES.RIGHT);
  m.ciclo();
  check(m.bandera.x === m.jugadores.get(1).x && m.bandera.y === m.jugadores.get(1).y,
    `la bandera va pegada al portador (${m.bandera.x}, ${m.bandera.y})`);
}

// ── 6. Robo sin inmunidad (§14) ─────────────────────────────────────────────
console.log('\n== 6. Robo instantáneo, sin inmunidad (§14) ==');
{
  const m = partida(2);
  poner(m, 1, 0, 0);
  m.encolarInteract(1);
  m.ciclo();
  check(m.bandera.carrierId === 1, 'J1 tiene la bandera');

  // J2 pegado a J1 se la roba al ciclo siguiente, sin esperar nada.
  poner(m, 2, 10, 0);
  m.encolarInteract(2);
  const { eventos } = m.ciclo();
  const robo = eventos.find((e) => e.type === TIPOS.FLAG_STOLEN);
  check(!!robo, 'hay FLAG_STOLEN');
  check(robo?.previousCarrierId === 1 && robo?.newCarrierId === 2, 'pasa de J1 a J2');
  check(m.jugadores.get(1).hasFlag === false && m.jugadores.get(2).hasFlag === true, 'la posesión cambia de verdad');

  // Y el robo puede devolverse de inmediato: sin inmunidad, esto es un ping-pong.
  m.encolarInteract(1);
  const r2 = m.ciclo();
  check(r2.eventos.some((e) => e.type === TIPOS.FLAG_STOLEN && e.newCarrierId === 1),
    'J1 se la puede robar de vuelta al ciclo siguiente (consecuencia de "sin inmunidad")');

  // Fuera de rango no hay robo.
  const m2 = partida(2);
  poner(m2, 1, 0, 0); m2.encolarInteract(1); m2.ciclo();
  poner(m2, 2, PARAMS_DEFECTO.interactionRadius + 1, 0);
  m2.encolarInteract(2); m2.ciclo();
  check(m2.bandera.carrierId === 1, 'a 61 de distancia no se la puede robar');
}

// ── 7. INTERPRETACIÓN: un solo cambio de dueño por ciclo (§15 extendido) ────
console.log('\n== 7. INTERPRETACIÓN: un cambio de dueño por ciclo ==');
{
  // Tres jugadores amontonados sobre la bandera, los tres piden INTERACT.
  const m = partida(3);
  poner(m, 1, 0, 0); poner(m, 2, 5, 0); poner(m, 3, 10, 0);
  m.encolarInteract(3); m.encolarInteract(1); m.encolarInteract(2);
  const { eventos } = m.ciclo();
  const cambios = eventos.filter((e) => e.type === TIPOS.FLAG_PICKED_UP || e.type === TIPOS.FLAG_STOLEN);
  check(cambios.length === 1, `solo UN cambio de dueño aunque los 3 interactúen (hubo ${cambios.length})`);
  check(cambios[0].type === TIPOS.FLAG_PICKED_UP && cambios[0].playerId === 1,
    'gana el playerId más bajo (§30.6 en orden ascendente)');
  check(m.jugadores.get(2).hasFlag === false && m.jugadores.get(3).hasFlag === false,
    'los otros dos NO se la roban en el mismo ciclo (si no, el 1 la tendría 0 ms)');

  // Al ciclo siguiente sí pueden robar: "reintentan el ciclo siguiente" (§15).
  m.encolarInteract(2);
  const r2 = m.ciclo();
  check(r2.eventos.some((e) => e.type === TIPOS.FLAG_STOLEN && e.newCarrierId === 2),
    'y al ciclo siguiente el robo sí procede');
}

// ── 8. Victoria (§16, §6) ───────────────────────────────────────────────────
console.log('\n== 8. Condición de victoria (§16) ==');
{
  const R = PARAMS_DEFECTO.circleRadius, pr = PARAMS_DEFECTO.playerRadius; // 500, 15

  // La frontera exacta: gana si dist - playerRadius > circleRadius, o sea > 515.
  const justo = partida(1);
  poner(justo, 1, 0, 0); justo.encolarInteract(1); justo.ciclo();
  poner(justo, 1, R + pr, 0); // 515 exactos → 515-15 = 500, NO es > 500
  justo.ciclo();
  check(justo.estado === ESTADO_PARTIDA.RUNNING, `a ${R + pr} exactos todavía NO gana (es >, no ≥)`);

  const pasado = partida(1);
  poner(pasado, 1, 0, 0); pasado.encolarInteract(1); pasado.ciclo();
  poner(pasado, 1, R + pr + 0.5, 0);
  const { eventos, estado } = pasado.ciclo();
  check(estado === ESTADO_PARTIDA.FINISHED, `a ${R + pr + 0.5} sí gana`);
  check(eventos.some((e) => e.type === TIPOS.GAME_OVER && e.winnerId === 1), 'emite GAME_OVER con el ganador');
  check(pasado.bandera.status === ESTADO_BANDERA.OUTSIDE, 'la bandera queda OUTSIDE');

  // Estar fuera SIN bandera no gana.
  const sin = partida(1);
  poner(sin, 1, 900, 0);
  sin.ciclo();
  check(sin.estado === ESTADO_PARTIDA.RUNNING, 'salir del círculo sin la bandera no gana');

  // Una vez FINISHED el motor deja de simular.
  const t = pasado.tick;
  pasado.ciclo();
  check(pasado.tick === t, 'tras FINISHED los ciclos ya no avanzan');
}

// ── 9. Desconexión (§17, §30.8) ─────────────────────────────────────────────
console.log('\n== 9. Desconexión (§17) ==');
{
  const m = partida(2);
  poner(m, 1, 0, 0); m.encolarInteract(1); m.ciclo();
  poner(m, 1, 123, -45);
  m.desconectar(1);
  const { eventos } = m.ciclo();

  check(eventos.some((e) => e.type === TIPOS.PLAYER_DISCONNECTED && e.playerId === 1), 'emite PLAYER_DISCONNECTED');
  check(m.bandera.status === ESTADO_BANDERA.DROPPED, 'la bandera queda DROPPED');
  check(m.bandera.carrierId === 0, 'y sin portador');
  check(m.serializarEstado().players.every((p) => p.playerId !== 1), 'el jugador desaparece del GAME_STATE');

  // Otro la puede recoger: DROPPED es recuperable (§17).
  poner(m, 2, m.bandera.x, m.bandera.y);
  m.encolarInteract(2);
  m.ciclo();
  check(m.bandera.carrierId === 2, 'otro jugador puede recoger la DROPPED');

  // Desconectarse es idempotente.
  const m2 = partida(2);
  m2.desconectar(1); m2.ciclo();
  const antes = m2.ciclo().eventos.filter((e) => e.type === TIPOS.PLAYER_DISCONNECTED).length;
  check(antes === 0, 'no se repite el evento en ciclos siguientes');
}

// ── 10. El que se desconecta no gana en ese ciclo (§30: paso 8 antes del 9) ──
console.log('\n== 10. Orden desconexión → victoria (§30.8 antes de §30.9) ==');
{
  const m = partida(2);
  poner(m, 1, 0, 0); m.encolarInteract(1); m.ciclo();
  // Lo ponemos ya completamente fuera Y lo desconectamos el mismo ciclo.
  poner(m, 1, 600, 0);
  m.desconectar(1);
  const { estado } = m.ciclo();
  check(estado === ESTADO_PARTIDA.RUNNING, 'un portador que se desconecta no gana aunque esté fuera');
  check(m.bandera.status === ESTADO_BANDERA.DROPPED, 'su bandera queda DROPPED donde estaba');
}

// ── 11. Colas de intención (§30.1, §30.2) ───────────────────────────────────
console.log('\n== 11. Colas de INPUT e INTERACT (§30.1, §30.2) ==');
{
  const m = partida(1);
  poner(m, 1, 0, 0);
  m.encolarInput(1, DIRECCIONES.UP);
  m.encolarInput(1, DIRECCIONES.DOWN);
  m.encolarInput(1, DIRECCIONES.RIGHT); // este es el que vale
  m.ciclo();
  check(m.jugadores.get(1).x === 11 && m.jugadores.get(1).y === 0, 'de varios INPUT solo cuenta el último');

  check(m.encolarInput(1, 0x09).error === 'INVALID_INPUT', 'una dirección inválida se rechaza (§32)');
  check(m.encolarInput(999, DIRECCIONES.UP).error === 'UNKNOWN_PLAYER', 'un jugador desconocido se rechaza (§32)');

  // Mandar INTERACT diez veces cuenta como una.
  const m2 = partida(2);
  poner(m2, 1, 0, 0); poner(m2, 2, 20, 0);
  for (let i = 0; i < 10; i++) m2.encolarInteract(1);
  const { eventos } = m2.ciclo();
  check(eventos.filter((e) => e.type === TIPOS.FLAG_PICKED_UP).length === 1, '10 INTERACT en un ciclo cuentan como 1');
}

// ── 12. Tick y orden de eventos (§30.10, §29.11) ────────────────────────────
console.log('\n== 12. Tick y orden de eventos (§29.11) ==');
{
  const m = partida(2);
  check(m.tick === 0, 'la partida arranca en tick 0');
  m.ciclo();
  check(m.tick === 1, 'el primer ciclo deja tick 1');
  check(m.serializarEstado().tick === 1, 'y el GAME_STATE sale con tick 1');

  // Evento y GAME_STATE del mismo ciclo comparten número de tick.
  poner(m, 1, 0, 0);
  m.encolarInteract(1);
  const { eventos } = m.ciclo();
  const pick = eventos.find((e) => e.type === TIPOS.FLAG_PICKED_UP);
  check(pick.tick === m.tick && pick.tick === m.serializarEstado().tick,
    `el evento lleva el mismo tick que su GAME_STATE (${pick.tick})`);

  // GAME_OVER va al final, después de todo (§29.11: GAME_STATE antes que GAME_OVER).
  const f = partida(2);
  poner(f, 1, 0, 0); f.encolarInteract(1); f.ciclo();
  poner(f, 1, 600, 0);
  f.desconectar(2);
  const r = f.ciclo();
  check(r.eventos[r.eventos.length - 1].type === TIPOS.GAME_OVER, 'GAME_OVER es siempre el último evento');

  // Varias desconexiones salen en orden ascendente de playerId.
  const d = partida(4);
  d.desconectar(4); d.desconectar(2); d.desconectar(3);
  const ids = d.ciclo().eventos
    .filter((e) => e.type === TIPOS.PLAYER_DISCONNECTED)
    .map((e) => e.playerId);
  check(JSON.stringify(ids) === '[2,3,4]', `eventos en orden ascendente de playerId (${ids})`);
}

// ── 13. Altas: validaciones (§28.1, §21) ────────────────────────────────────
console.log('\n== 13. Validación de altas (§28.1) ==');
{
  const m = new MotorV3();
  check(m.agregarJugador('').error === RAZON_RECHAZO.INVALID_NAME, 'nombre vacío → INVALID_NAME');
  check(m.agregarJugador('   ').error === RAZON_RECHAZO.INVALID_NAME, 'solo espacios → INVALID_NAME');
  check(m.agregarJugador('x'.repeat(21)).error === RAZON_RECHAZO.INVALID_NAME, '21 caracteres → INVALID_NAME');
  check(!!m.agregarJugador('x'.repeat(20)).jugador, '20 caracteres se acepta');
  check(m.agregarJugador('  Ana  ').jugador.name === 'Ana', 'se recortan los espacios');

  const lleno = new MotorV3({ maximumPlayers: 2 });
  lleno.agregarJugador('A'); lleno.agregarJugador('B');
  check(lleno.agregarJugador('C').error === RAZON_RECHAZO.GAME_FULL, 'partida llena → GAME_FULL');

  const corriendo = partida(1);
  check(corriendo.agregarJugador('Tarde').error === RAZON_RECHAZO.GAME_ALREADY_STARTED, 'ya arrancada → GAME_ALREADY_STARTED');

  // Los playerId son consecutivos desde 1 y caben en u16.
  const ids = new MotorV3();
  const a = ids.agregarJugador('A').jugador, b = ids.agregarJugador('B').jugador;
  check(a.playerId === 1 && b.playerId === 2, 'los playerId arrancan en 1 y son consecutivos');
}

// ── 14. Partida completa de verdad ──────────────────────────────────────────
console.log('\n== 14. Partida completa (bot ingenuo) ==');
{
  const m = partida(3);
  // J1 va al centro, recoge y sale en línea recta hacia la derecha.
  poner(m, 1, 0, 0);
  m.encolarInteract(1);
  m.ciclo();
  check(m.jugadores.get(1).hasFlag, 'recogió la bandera en el centro');

  m.encolarInput(1, DIRECCIONES.RIGHT);
  let ciclos = 0;
  while (m.estado === ESTADO_PARTIDA.RUNNING && ciclos < 200) { m.ciclo(); ciclos++; }

  check(m.estado === ESTADO_PARTIDA.FINISHED, `la partida termina (${ciclos} ciclos)`);
  check(m.ganadorId === 1, 'gana J1');

  // Cuenta exacta, sin tolerancia: sale del centro y avanza 11 por ciclo, así
  // que gana en el primer n con 11n - playerRadius > circleRadius, o sea
  // 11n > 515 → n = 47. A 50 ms el ciclo, unos 2.4 s de carrera.
  const paso = (PARAMS_DEFECTO.playerSpeed * PARAMS_DEFECTO.tickIntervalMs) / 1000;
  const umbral = PARAMS_DEFECTO.circleRadius + PARAMS_DEFECTO.playerRadius;
  const esperados = Math.floor(umbral / paso) + 1; // primer entero que lo supera
  check(ciclos === esperados, `tarda exactamente lo que dice la aritmética: ${esperados} ciclos (fueron ${ciclos})`);
  check(Math.hypot(m.jugadores.get(1).x, m.jugadores.get(1).y) - PARAMS_DEFECTO.playerRadius > PARAMS_DEFECTO.circleRadius,
    'y al terminar cumple la desigualdad de §16');
}

console.log(`\n${'='.repeat(52)}`);
console.log(`Resultado: ${ok} OK, ${fail} FALLAS`);
process.exit(fail ? 1 : 0);
