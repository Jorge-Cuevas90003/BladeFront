// ============================================================================
//  Pruebas del descubrimiento por vecinos de la red virtual.
//  Correr:  node test/verify-vecinos-v3.mjs
//
//  El análisis de la tabla se prueba con texto SINTÉTICO, no con la tabla real
//  de la máquina: si dependiera del ARP de quien corre las pruebas, el
//  resultado cambiaría en cada equipo y en cada momento. La lectura real se
//  comprueba aparte, y solo se exige que no reviente ni invente.
// ============================================================================

import { parsearTablaVecinos, vecinosVivos, prefijosRadminLocales } from '../red/v3/vecinos.js';

let ok = 0, fail = 0;
const check = (cond, msg) => {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ FALLA: ${msg}`); }
};

// Salida real de `arp -a` en Windows, con acentos incluidos.
const ARP_WINDOWS = `
Interfaz: 26.11.206.94 --- 0x11
  Direcci¢n de Internet     Direcci¢n f¡sica      Tipo
  26.0.0.1              02-00-00-00-51-00     din mico
  26.52.44.2            02-50-8b-a1-58-bf     din mico
  26.63.72.136          02-50-44-4f-27-4e     din mico
  26.157.21.141         02-50-59-62-37-4d     din mico
  26.230.5.15           00-00-00-00-00-00     inv lido
  26.255.255.255        ff-ff-ff-ff-ff-ff     est tico
  224.0.0.22            01-00-5e-00-00-16     est tico

Interfaz: 192.168.1.20 --- 0x8
  192.168.1.1           a4-2b-b0-11-22-33     din mico
`;

// Salida de `ip neigh` en Linux, otro formato para la misma información.
const IP_NEIGH = `
26.52.44.2 dev radmin0 lladdr 02:50:8b:a1:58:bf STALE
26.99.36.148 dev radmin0  FAILED
26.63.72.136 dev radmin0 lladdr 02:50:44:4f:27:4e REACHABLE
192.168.1.1 dev wlan0 lladdr a4:2b:b0:11:22:33 REACHABLE
`;

// ── 1. Solo cuentan los vecinos con dirección física real ───────────────────
// Una entrada con la MAC a ceros es una pregunta que nadie contestó: o el
// equipo está apagado, o es una IP que sondeamos nosotros y no existe. Tomarla
// por buena significaría preguntar cada vez a gente que no está.
console.log('\n== 1. Distinguir vivos de entradas muertas ==');
{
  const v = parsearTablaVecinos(ARP_WINDOWS, { prefijos: ['26.'] });
  const ips = v.map((x) => x.ip).sort();
  check(!ips.includes('26.230.5.15'), 'la entrada con MAC de ceros se descarta (nadie respondió)');
  check(ips.includes('26.52.44.2') && ips.includes('26.63.72.136') && ips.includes('26.157.21.141'),
    `se quedan los que sí respondieron (${ips.length})`);
  check(!ips.includes('26.255.255.255'), 'la dirección de difusión no es un jugador');
  check(!ips.some((i) => i.startsWith('192.168.')), 'las interfaces que no son de la VPN se ignoran');
  check(!ips.some((i) => i.startsWith('224.')), 'la multidifusión tampoco');
}

// ── 2. El nodo de servicio de Radmin no es un compañero ─────────────────────
console.log('\n== 2. Infraestructura de la VPN ==');
{
  const sin = parsearTablaVecinos(ARP_WINDOWS, { prefijos: ['26.'] });
  const con = parsearTablaVecinos(ARP_WINDOWS, { prefijos: ['26.'], incluirInfraestructura: true });
  check(!sin.some((x) => x.ip === '26.0.0.1'), '26.0.0.1 se excluye por defecto');
  check(con.some((x) => x.ip === '26.0.0.1'), 'y se puede incluir si alguien lo necesita');
  check(con.length === sin.length + 1, 'es la única diferencia entre los dos modos');
}

// ── 3. El formato de Linux también ──────────────────────────────────────────
console.log('\n== 3. Formato de ip neigh (Linux) ==');
{
  const v = parsearTablaVecinos(IP_NEIGH, { prefijos: ['26.'] });
  const ips = v.map((x) => x.ip).sort();
  check(ips.length === 2, `se leen los dos con lladdr (${ips.join(', ')})`);
  check(!ips.includes('26.99.36.148'), 'el FAILED sin lladdr se descarta');
  check(v.every((x) => /^[0-9a-f]{2}(-[0-9a-f]{2}){5}$/.test(x.mac)),
    'las MAC se normalizan al mismo formato que en Windows');
}

// ── 4. Sin duplicados aunque la IP salga en varias tablas ───────────────────
console.log('\n== 4. Fusión de las dos fuentes ==');
{
  const v = parsearTablaVecinos(ARP_WINDOWS + IP_NEIGH, { prefijos: ['26.'] });
  const ips = v.map((x) => x.ip);
  check(new Set(ips).size === ips.length, `sin duplicados (${ips.length} entradas)`);
  check(ips.filter((i) => i === '26.52.44.2').length === 1, '26.52.44.2 sale en las dos tablas y aparece una vez');
}

// ── 5. Basura y tablas vacías ───────────────────────────────────────────────
// Si el sistema no tiene la herramienta o cambia el formato, esto debe devolver
// una lista vacía y dejar que el descubrimiento siga por sus otras vías. Que
// una fuente auxiliar tumbe la búsqueda entera sería mucho peor que no tenerla.
console.log('\n== 5. Robustez ==');
{
  check(parsearTablaVecinos('', { prefijos: ['26.'] }).length === 0, 'texto vacío → lista vacía');
  check(parsearTablaVecinos('no hay nada aquí\nni aquí', { prefijos: ['26.'] }).length === 0, 'texto sin IPs → lista vacía');
  check(parsearTablaVecinos('26.1.2.3 sin-mac\n', { prefijos: ['26.'] }).length === 0, 'una IP sin MAC no cuenta');
  let lanzo = false;
  try { parsearTablaVecinos(null, { prefijos: ['26.'] }); } catch { lanzo = true; }
  check(!lanzo, 'ni siquiera lanza con una entrada nula');
}

// ── 6. Prefijos ─────────────────────────────────────────────────────────────
console.log('\n== 6. Filtrado por prefijo ==');
{
  check(parsearTablaVecinos(ARP_WINDOWS, { prefijos: ['192.168.'] }).length === 1,
    'con otro prefijo se leen otras interfaces');
  check(parsearTablaVecinos(ARP_WINDOWS, { prefijos: ['10.'] }).length === 0,
    'un prefijo sin coincidencias da lista vacía');
  check(prefijosRadminLocales().includes('26.'), 'el 26. siempre está entre los prefijos buscados');
}

// ── 7. Lectura real del sistema ─────────────────────────────────────────────
// Aquí no se puede exigir un número: depende de la máquina y del momento. Lo
// que sí se exige es que responda, que no invente y que no tarde.
console.log('\n== 7. Lectura real (sin exigir cuántos) ==');
{
  const t0 = Date.now();
  const v = await vecinosVivos();
  const ms = Date.now() - t0;
  console.log(`     → ${v.length} vecinos en la VPN, leídos en ${ms} ms`);
  check(Array.isArray(v), 'devuelve una lista');
  check(ms < 5000, `no se queda colgado (${ms} ms)`);
  check(v.every((x) => /^\d{1,3}(\.\d{1,3}){3}$/.test(x.ip)), 'todas las entradas son IPv4 bien formadas');
  check(v.every((x) => x.ip.startsWith('26.')), 'y todas del rango de la VPN');
  check(!v.some((x) => x.ip === '26.0.0.1'), 'sin el nodo de servicio');
}

console.log(`\n${'='.repeat(52)}`);
console.log(`Resultado: ${ok} OK, ${fail} FALLAS`);
process.exit(fail ? 1 : 0);
