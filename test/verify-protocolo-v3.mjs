// ============================================================================
//  Pruebas del códec binario PRFC v3 (red/v3/protocolo-v3.js).
//  Correr:  node test/verify-protocolo-v3.mjs
//
//  Cubre la prueba de oro de §28.2 y las tres "trampas mortales" del documento
//  de consideraciones: fragmentación TCP, escalado ×100 y strings UTF-8.
// ============================================================================

import {
  TIPOS, VERSION, DIRECCIONES, ESTADO_BANDERA, ESTADO_PARTIDA, ERRORES,
  codificar, decodificar, enmarcar, AcumuladorTCP, aHex, esc, desesc,
} from '../red/v3/protocolo-v3.js';

let ok = 0, fail = 0;
const check = (cond, msg) => {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ FALLA: ${msg}`); }
};

// ── 1. LA PRUEBA DE ORO (§28.2) ─────────────────────────────────────────────
// "5 bytes. Ejemplo, P07 moviéndose hacia arriba: 11 03 00 07 01"
console.log('\n== 1. Prueba de oro §28.2 ==');
{
  const bytes = codificar(TIPOS.INPUT, { playerId: 7, direction: DIRECCIONES.UP });
  check(aHex(bytes) === '11 03 00 07 01', `INPUT P07 UP === "11 03 00 07 01" (obtenido "${aHex(bytes)}")`);
  check(bytes.length === 5, `son exactamente 5 bytes (obtenido ${bytes.length})`);

  // Sobre TCP el mismo mensaje lleva el prefijo de longitud u16 (§23).
  const marco = enmarcar(TIPOS.INPUT, { playerId: 7, direction: DIRECCIONES.UP });
  check(aHex(marco) === '00 05 11 03 00 07 01', `enmarcado TCP === "00 05 11 03 00 07 01" (obtenido "${aHex(marco)}")`);
}

// ── 2. Big-endian de verdad ─────────────────────────────────────────────────
console.log('\n== 2. Orden de bytes big-endian (§23) ==');
{
  // playerId 0x0102 debe salir como 01 02, no 02 01.
  const b = codificar(TIPOS.INTERACT, { playerId: 0x0102 });
  check(aHex(b) === '12 03 01 02', `u16 big-endian (obtenido "${aHex(b)}")`);

  // tick 0x01020304 en GAME_STATE.
  const g = codificar(TIPOS.GAME_STATE, {
    tick: 0x01020304, flagStatus: ESTADO_BANDERA.AVAILABLE, flagCarrierId: 0,
    flagX: 0, flagY: 0, players: [],
  });
  check(aHex(g).startsWith('25 03 01 02 03 04'), `u32 big-endian (obtenido "${aHex(g).slice(0, 17)}")`);
}

// ── 3. Tamaños declarados por la spec ───────────────────────────────────────
console.log('\n== 3. Tamaños que la spec fija explícitamente ==');
{
  // §29.6: "bloque por jugador: 12 bytes; cuerpo de dos jugadores: ~42 bytes
  //         + 2 de prefijo = 44 en total".
  const dos = enmarcar(TIPOS.GAME_STATE, {
    tick: 1, flagStatus: ESTADO_BANDERA.CARRIED, flagCarrierId: 3,
    flagX: 10.5, flagY: -20.25,
    players: [
      { playerId: 1, x: 100, y: 200, direction: DIRECCIONES.UP, hasFlag: false },
      { playerId: 3, x: -50.5, y: 0, direction: DIRECCIONES.LEFT, hasFlag: true },
    ],
  });
  check(dos.length === 44, `GAME_STATE con 2 jugadores === 44 bytes con prefijo (obtenido ${dos.length})`);

  const uno = codificar(TIPOS.GAME_STATE, {
    tick: 1, flagStatus: 1, flagCarrierId: 0, flagX: 0, flagY: 0,
    players: [{ playerId: 1, x: 0, y: 0, direction: 0, hasFlag: false }],
  });
  const cero = codificar(TIPOS.GAME_STATE, {
    tick: 1, flagStatus: 1, flagCarrierId: 0, flagX: 0, flagY: 0, players: [],
  });
  check(uno.length - cero.length === 12, `bloque por jugador === 12 bytes (obtenido ${uno.length - cero.length})`);

  // §28.3 INTERACT y §29.9 PLAYER_DISCONNECTED: 4 bytes cada uno.
  check(codificar(TIPOS.INTERACT, { playerId: 1 }).length === 4, 'INTERACT === 4 bytes');
  check(codificar(TIPOS.PLAYER_DISCONNECTED, { playerId: 1 }).length === 4, 'PLAYER_DISCONNECTED === 4 bytes');

  // §27 DISCOVER_REQUEST: solo cabecera "01 03".
  check(aHex(codificar(TIPOS.DISCOVER_REQUEST, {})) === '01 03', 'DISCOVER_REQUEST === "01 03"');
}

// ── 4. Trampa 2: escalado ×100 y negativos (§24) ────────────────────────────
console.log('\n== 4. Escalado ×100 con signo (§24) ==');
{
  check(esc(60) === 6000, 'esc(60) === 6000 (el radio de interacción escalado)');
  check(desesc(6000) === 60, 'desesc(6000) === 60');

  // i32 con signo: una coordenada negativa debe sobrevivir el viaje.
  const m = decodificar(codificar(TIPOS.GAME_STATE, {
    tick: 0, flagStatus: 1, flagCarrierId: 0, flagX: -999.99, flagY: 750.25,
    players: [{ playerId: 1, x: -1000, y: -0.01, direction: 0, hasFlag: false }],
  }));
  check(Math.abs(m.flagX - (-999.99)) < 1e-9, `flagX negativo sobrevive (${m.flagX})`);
  check(Math.abs(m.flagY - 750.25) < 1e-9, `flagY con decimales sobrevive (${m.flagY})`);
  check(Math.abs(m.players[0].x - (-1000)) < 1e-9, `x = -1000 sobrevive (${m.players[0].x})`);
  check(Math.abs(m.players[0].y - (-0.01)) < 1e-9, `y = -0.01 sobrevive (${m.players[0].y})`);

  // Los extremos del mapa (§21: mapSize 2000 → ±1000) caben de sobra en i32.
  check(esc(1000) === 100000 && esc(-1000) === -100000, 'los bordes del mapa caben en i32');
}

// ── 5. Trampa 3: strings UTF-8 medidos en BYTES ─────────────────────────────
console.log('\n== 5. Strings UTF-8 (§23) ==');
{
  for (const nombre of ['Ana', 'José', 'Ñandú', '龍', 'Zoë-Ω', '']) {
    const m = decodificar(codificar(TIPOS.JOIN, { name: nombre }));
    check(m.name === nombre, `round-trip de "${nombre}"`);
  }

  // "José" = 4 caracteres pero 5 bytes: la longitud declarada debe ser 5.
  const b = codificar(TIPOS.JOIN, { name: 'José' });
  check(b[2] === 5, `el prefijo de "José" declara 5 BYTES, no 4 caracteres (declaró ${b[2]})`);

  // Un nombre de 20 caracteres acentuados son 40 bytes: cabe en el u8, pero
  // demuestra que "20 caracteres" (§28.1) y el campo de bytes no son lo mismo.
  const largo = 'á'.repeat(20);
  const bl = codificar(TIPOS.JOIN, { name: largo });
  check(bl[2] === 40, `20 caracteres "á" ocupan 40 bytes (declaró ${bl[2]})`);
  check(decodificar(bl).name === largo, 'y aun así hacen round-trip correcto');
}

// ── 6. Round-trip de TODOS los mensajes (§28, §29) ──────────────────────────
console.log('\n== 6. Round-trip de todos los tipos ==');
{
  const casos = [
    [TIPOS.DISCOVER_REQUEST, {}],
    [TIPOS.DISCOVER_RESPONSE, { gameId: 1, serverName: 'BladeFront', tcpPort: 5000, state: ESTADO_PARTIDA.WAITING, playerCount: 2, maximumPlayers: 100 }],
    [TIPOS.JOIN, { name: 'Jorge' }],
    [TIPOS.INPUT, { playerId: 7, direction: DIRECCIONES.RIGHT }],
    [TIPOS.INTERACT, { playerId: 7 }],
    [TIPOS.LEAVE, { playerId: 7 }],
    [TIPOS.JOIN_ACCEPTED, { playerId: 7, gameId: 42 }],
    [TIPOS.JOIN_REJECTED, { reason: 0x02 }],
    [TIPOS.LOBBY_STATE, { state: ESTADO_PARTIDA.WAITING, players: [{ playerId: 1, name: 'Ana' }, { playerId: 2, name: 'José' }] }],
    [TIPOS.GAME_COUNTDOWN, { secondsRemaining: 5 }],
    [TIPOS.GAME_STARTED, {
      mapSize: 2000, circleRadius: 500, playerRadius: 15, playerSpeed: 220,
      interactionRadius: 60, tickIntervalMs: 50, flagStatus: ESTADO_BANDERA.AVAILABLE,
      flagCarrierId: 0, flagX: 0, flagY: 0,
      players: [{ playerId: 1, name: 'Ana', x: -900.5, y: 12.25, direction: DIRECCIONES.UP, hasFlag: false }],
    }],
    [TIPOS.GAME_STATE, { tick: 123456, flagStatus: ESTADO_BANDERA.CARRIED, flagCarrierId: 1, flagX: 1.5, flagY: -2.5, players: [{ playerId: 1, x: 1.5, y: -2.5, direction: DIRECCIONES.DOWN, hasFlag: true }] }],
    [TIPOS.FLAG_PICKED_UP, { tick: 10, playerId: 3 }],
    [TIPOS.FLAG_STOLEN, { tick: 11, previousCarrierId: 3, newCarrierId: 5 }],
    [TIPOS.PLAYER_DISCONNECTED, { playerId: 3 }],
    [TIPOS.GAME_OVER, { winnerId: 5, winnerName: 'Ganador', reason: 1 }],
    [TIPOS.ERROR, { code: ERRORES.INVALID_INPUT, description: 'dirección inválida' }],
  ];

  for (const [tipo, campos] of casos) {
    const m = decodificar(codificar(tipo, campos));
    let bien = m.type === tipo && m.ver === VERSION;
    for (const [k, v] of Object.entries(campos)) {
      if (k === 'players') {
        bien = bien && m.players.length === v.length &&
          v.every((p, i) => Object.entries(p).every(([pk, pv]) =>
            typeof pv === 'number' ? Math.abs(m.players[i][pk] - pv) < 1e-9 : m.players[i][pk] === pv));
      } else if (typeof v === 'number') {
        bien = bien && Math.abs(m[k] - v) < 1e-9;
      } else {
        bien = bien && m[k] === v;
      }
    }
    check(bien, `round-trip 0x${tipo.toString(16).padStart(2, '0')}`);
  }

  // La versión siempre sale como 0x03 en el segundo byte.
  check(codificar(TIPOS.JOIN, { name: 'x' })[1] === 0x03, 'el byte de versión es 0x03');
}

// ── 7. TRAMPA 1: fragmentación TCP ──────────────────────────────────────────
console.log('\n== 7. Fragmentación TCP (trampa 1) ==');
{
  // Cinco mensajes distintos, concatenados en un solo flujo de bytes.
  const salientes = [
    enmarcar(TIPOS.JOIN, { name: 'Ana' }),
    enmarcar(TIPOS.INPUT, { playerId: 7, direction: DIRECCIONES.UP }),
    enmarcar(TIPOS.GAME_STATE, { tick: 9, flagStatus: 1, flagCarrierId: 0, flagX: 5, flagY: 5, players: [{ playerId: 1, x: 1, y: 2, direction: 1, hasFlag: false }] }),
    enmarcar(TIPOS.INTERACT, { playerId: 7 }),
    enmarcar(TIPOS.GAME_OVER, { winnerId: 7, winnerName: 'José', reason: 0 }),
  ];
  const total = new Uint8Array(salientes.reduce((n, m) => n + m.length, 0));
  let off = 0;
  for (const m of salientes) { total.set(m, off); off += m.length; }

  // (a) byte por byte — el peor caso posible.
  {
    const recibidos = [];
    const acc = new AcumuladorTCP((m) => recibidos.push(m));
    for (const b of total) acc.alimentar(new Uint8Array([b]));
    check(recibidos.length === 5, `byte a byte: llegan los 5 mensajes (llegaron ${recibidos.length})`);
    check(recibidos[0]?.name === 'Ana' && recibidos[4]?.winnerName === 'José', 'byte a byte: contenido intacto');
  }

  // (b) todo de un golpe.
  {
    const recibidos = [];
    const acc = new AcumuladorTCP((m) => recibidos.push(m));
    acc.alimentar(total);
    check(recibidos.length === 5, `de un golpe: llegan los 5 (llegaron ${recibidos.length})`);
  }

  // (c) cortes irregulares, incluyendo justo en medio del prefijo de longitud.
  for (const corte of [1, 2, 3, 7, 13, 31]) {
    const recibidos = [];
    const acc = new AcumuladorTCP((m) => recibidos.push(m));
    for (let i = 0; i < total.length; i += corte) acc.alimentar(total.subarray(i, i + corte));
    check(recibidos.length === 5, `trozos de ${corte} bytes: llegan los 5 (llegaron ${recibidos.length})`);
  }

  // (d) dos mensajes en el mismo chunk no deben perderse.
  {
    const recibidos = [];
    const acc = new AcumuladorTCP((m) => recibidos.push(m));
    acc.alimentar(total.subarray(0, salientes[0].length + salientes[1].length));
    check(recibidos.length === 2, `dos mensajes en un chunk (llegaron ${recibidos.length})`);
  }
}

// ── 8. Robustez ante basura (§32) ───────────────────────────────────────────
console.log('\n== 8. Mensajes corruptos ==');
{
  // Payload truncado: el decodificador debe lanzar, no devolver basura.
  let lanzo = false;
  try { decodificar(new Uint8Array([TIPOS.INPUT, VERSION, 0x00])); } catch { lanzo = true; }
  check(lanzo, 'un INPUT truncado lanza en vez de inventar campos');

  // Tipo desconocido.
  lanzo = false;
  try { decodificar(new Uint8Array([0xff, VERSION])); } catch { lanzo = true; }
  check(lanzo, 'un tipo desconocido lanza');

  // El acumulador reporta el error pero NO se traga los mensajes siguientes.
  {
    const recibidos = [], errores = [];
    const acc = new AcumuladorTCP((m) => recibidos.push(m), (c) => errores.push(c));
    const malo = new Uint8Array([0x00, 0x03, TIPOS.INPUT, VERSION, 0x00]); // largo 3, cuerpo truncado
    const bueno = enmarcar(TIPOS.INTERACT, { playerId: 9 });
    const flujo = new Uint8Array(malo.length + bueno.length);
    flujo.set(malo); flujo.set(bueno, malo.length);
    acc.alimentar(flujo);
    check(errores.length === 1 && errores[0] === ERRORES.INVALID_ENCODING, 'reporta INVALID_ENCODING del mensaje corrupto');
    check(recibidos.length === 1 && recibidos[0].playerId === 9, 'y aun así entrega el mensaje siguiente');
  }

  // Longitud imposible → se descarta el flujo y se avisa.
  {
    const errores = [];
    const acc = new AcumuladorTCP(() => {}, (c) => errores.push(c));
    acc.alimentar(new Uint8Array([0xff, 0xff, 0x00])); // 65535 bytes anunciados
    check(errores.length === 1 && errores[0] === ERRORES.INVALID_MESSAGE, 'una longitud desmedida corta el flujo');
  }

  // Longitud cero: no existe mensaje de 0 bytes (la cabecera ya son 2).
  {
    const errores = [];
    const acc = new AcumuladorTCP(() => {}, (c) => errores.push(c));
    acc.alimentar(new Uint8Array([0x00, 0x00]));
    check(errores.length === 1, 'una longitud de 0 se rechaza');
  }
}

// ── 9. El tope defensivo no estorba al tráfico legítimo ─────────────────────
console.log('\n== 9. El mensaje legítimo más grande cabe bajo el tope ==');
{
  // Peor caso real: GAME_STARTED con los 100 jugadores de §21 y nombres de 20
  // caracteres de 4 bytes cada uno. Si el tope defensivo lo rechazara, una
  // partida llena no podría arrancar.
  const players = Array.from({ length: 100 }, (_, i) => ({
    playerId: i + 1, name: '龍'.repeat(20),
    x: -999.99, y: 999.99, direction: DIRECCIONES.UP, hasFlag: false,
  }));
  const marco = enmarcar(TIPOS.GAME_STARTED, {
    mapSize: 2000, circleRadius: 500, playerRadius: 15, playerSpeed: 220,
    interactionRadius: 60, tickIntervalMs: 50, flagStatus: ESTADO_BANDERA.AVAILABLE,
    flagCarrierId: 0, flagX: 0, flagY: 0, players,
  });
  console.log(`  (partida llena: ${marco.length} bytes)`);
  check(marco.length < 16 * 1024, `una partida de 100 jugadores cabe bajo el tope (${marco.length} bytes)`);
  check(marco.length - 2 <= 0xffff, 'y su longitud cabe en el prefijo u16');

  const recibidos = [];
  const acc = new AcumuladorTCP((m) => recibidos.push(m));
  for (let i = 0; i < marco.length; i += 997) acc.alimentar(marco.subarray(i, i + 997));
  check(recibidos.length === 1 && recibidos[0].players.length === 100,
    'y atraviesa el acumulador fragmentado sin perder jugadores');
}

console.log(`\n${'='.repeat(52)}`);
console.log(`Resultado: ${ok} OK, ${fail} FALLAS`);
process.exit(fail ? 1 : 0);
