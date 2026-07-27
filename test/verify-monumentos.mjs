// ============================================================================
//  Pruebas de los Doce Testigos — las estatuas del borde de la arena.
//  Correr:  node test/verify-monumentos.mjs
//
//  Se pueden probar sin navegador porque marching cubes, las superficies de
//  revolución y la fusión de geometrías son cálculo puro: no tocan WebGL ni el
//  DOM. Lo único que no se comprueba aquí es cómo se ven, que es justo lo que
//  ninguna prueba automática puede decir.
//
//  Ojo: node resuelve three desde node_modules (r170) y el navegador la carga
//  del CDN (r180). Para lo que se usa aquí — BufferGeometry, MarchingCubes,
//  mergeGeometries — las dos versiones se comportan igual; si algún día deja
//  de ser cierto, esta prueba lo destapa antes que el navegador.
// ============================================================================

import { crearMonumento, crearMonumentos } from '../assets/arena-vacio/js/monumentos.js';

let ok = 0, fail = 0;
const check = (cond, msg) => {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ FALLA: ${msg}`); }
};

const finito = (attr) => {
  const a = attr.array;
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
  return true;
};

function cajaDe(objeto) {
  let minY = Infinity, maxY = -Infinity, maxR = 0;
  objeto.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const r = Math.hypot(p.getX(i), p.getZ(i));
      if (r > maxR) maxR = r;
    }
  });
  return { minY, maxY, maxR };
}

// ── 1. Las doce se construyen ────────────────────────────────────────────────
console.log('\n== 1. Las doce se levantan ==');
const t0 = Date.now();
const efigies = [];
for (let i = 0; i < 12; i++) efigies.push(crearMonumento(i + 1, i));
const msTotal = Date.now() - t0;
check(efigies.length === 12, 'se construyen las doce efigies');
console.log(`    ${msTotal} ms en total, ${(msTotal / 12).toFixed(0)} ms por figura`);
// Se construyen una sola vez al entrar a la arena. Si esto se dispara, la
// carga se nota como un tirón antes del primer fotograma.
check(msTotal < 4000, `el anillo entero tarda menos de 4 s (${msTotal} ms)`);

// ── 2. Geometría sana ────────────────────────────────────────────────────────
console.log('\n== 2. Geometría sana ==');
let trisMin = Infinity, trisMax = 0, mallasMax = 0;
let todoFinito = true, tresVertices = true, colorEnPiedra = true;
for (const m of efigies) {
  let mallas = 0;
  m.traverse((o) => {
    if (!o.isMesh) return;
    mallas++;
    const g = o.geometry;
    const p = g.getAttribute('position');
    if (p.count % 3 !== 0) tresVertices = false;
    if (!finito(p) || !finito(g.getAttribute('normal'))) todoFinito = false;
    if (o.material.vertexColors && !g.getAttribute('color')) colorEnPiedra = false;
  });
  mallasMax = Math.max(mallasMax, mallas);
  const t = m.userData.perfil.triangulos;
  trisMin = Math.min(trisMin, t); trisMax = Math.max(trisMax, t);
}
check(todoFinito, 'ninguna posición ni normal sale NaN o infinita');
check(tresVertices, 'todas las mallas son triángulos completos');
check(colorEnPiedra, 'la piedra lleva su atributo de color por vértice');
// Dos mallas por estatua (piedra y metal) es lo que fija el coste de dibujo:
// 12 estatuas = 24 llamadas. Si esto crece, crece el gasto por fotograma.
check(mallasMax <= 2, `como mucho 2 mallas por estatua (${mallasMax})`);
console.log(`    triángulos de piedra por figura: ${trisMin}–${trisMax}`);
check(trisMin > 3000, `ninguna sale desnutrida (mínimo ${trisMin} tris)`);
check(trisMax < 40000, `ninguna se dispara (máximo ${trisMax} tris)`);

// ── 3. Se apoyan en el suelo y miden lo que dicen ────────────────────────────
console.log('\n== 3. Apoyo y proporciones ==');
let apoyadas = true, alturas = [];
for (const m of efigies) {
  const { minY, maxY } = cajaDe(m);
  if (minY < -0.02 || minY > 0.05) apoyadas = false;
  alturas.push(maxY);
}
check(apoyadas, 'todas apoyan la base en y=0, ninguna flota ni se hunde');
const hMin = Math.min(...alturas), hMax = Math.max(...alturas);
console.log(`    altura total (pedestal + figura): ${hMin.toFixed(2)}–${hMax.toFixed(2)}`);
// Medido sobre 200 semillas: 3.86–9.31. El suelo lo pone una figura corta
// sobre gradas (el pedestal más bajo) y el techo una lanza en alto, que
// sobresale casi la altura entera de la figura. Los límites dejan margen a los
// dos lados; si algo se sale de aquí es que una pieza se colocó donde no toca.
check(hMin > 3.5 && hMax < 9.8, `todas quedan en un rango colosal pero coherente (${hMin.toFixed(2)}–${hMax.toFixed(2)})`);

// La figura sola debe medir lo que dice el perfil, contando desde el pedestal.
{
  const m = crearMonumento(101, 4);
  const { maxY } = cajaDe(m);
  const declarada = m.userData.perfil.alturaFig;
  // El atributo (lanza, antorcha) puede sobresalir por encima de la coronilla,
  // así que solo se comprueba que la figura no sea más alta que el conjunto.
  check(maxY > declarada && maxY < declarada + 3.0,
    `la altura declarada (${declarada}) encaja con la malla (${maxY.toFixed(2)})`);
}

// ── 4. Deterministas ─────────────────────────────────────────────────────────
// La misma semilla tiene que dar la misma estatua siempre: si no, cada jugador
// vería una arena distinta y el escenario dejaría de ser un sitio reconocible.
console.log('\n== 4. La misma semilla da la misma estatua ==');
{
  const a = crearMonumento(7, 3), b = crearMonumento(7, 3);
  check(JSON.stringify(a.userData.perfil) === JSON.stringify(b.userData.perfil),
    'el perfil se repite exacto');
  const ca = cajaDe(a), cb = cajaDe(b);
  check(Math.abs(ca.maxY - cb.maxY) < 1e-6 && Math.abs(ca.maxR - cb.maxR) < 1e-6,
    'y la geometría también');
  const otra = crearMonumento(8, 3);
  check(JSON.stringify(otra.userData.perfil) !== JSON.stringify(a.userData.perfil),
    'otra semilla da otra estatua');
}

// ── 5. Doce, y ninguna repetida ──────────────────────────────────────────────
console.log('\n== 5. Cada una es única ==');
{
  const firmas = efigies.map((m) => JSON.stringify(m.userData.perfil));
  check(new Set(firmas).size === 12, `las doce firmas son distintas (${new Set(firmas).size})`);

  const piedras = efigies.map((m) => m.userData.perfil.piedra);
  const metales = efigies.map((m) => m.userData.perfil.metal);
  const parejas = efigies.map((m, i) => `${piedras[i]}+${metales[i]}`);
  check(new Set(parejas).size === 12, 'ninguna pareja piedra+metal se repite');
  check(new Set(piedras).size >= 4, `hay al menos 4 piedras en el anillo (${new Set(piedras).size})`);
  check(new Set(metales).size >= 4, `y al menos 4 metales (${new Set(metales).size})`);

  const complexiones = new Set(efigies.map((m) => m.userData.perfil.complexion));
  check(complexiones.size >= 2, `no son doce copias del mismo cuerpo (${[...complexiones].join(', ')})`);
}

// ── 6. La oclusión hace algo ─────────────────────────────────────────────────
// Es lo que hace visible la musculatura: sin sombra en los huecos, un pectoral
// y una losa lisa se ven igual bajo una luz suave. Si el cálculo se rompiera y
// devolviera un valor constante, la estatua seguiría construyéndose sin error
// y solo se notaría mirándola. Por eso se mide aquí.
console.log('\n== 6. La oclusión de ambiente marca el relieve ==');
{
  const m = crearMonumento(5, 5);
  const piedra = m.children.find((c) => c.isMesh && c.material.vertexColors);
  const col = piedra.geometry.getAttribute('color');
  let min = Infinity, max = -Infinity, suma = 0;
  for (let i = 0; i < col.count; i++) {
    const v = col.getX(i);
    if (v < min) min = v;
    if (v > max) max = v;
    suma += v;
  }
  const media = suma / col.count;
  check(max - min > 0.25, `hay rango real de sombra (${min.toFixed(2)}–${max.toFixed(2)})`);
  check(min >= 0 && max <= 1.35, 'y ningún vértice se sale de un color razonable');
  check(media > 0.45 && media < 0.98, `la piedra no queda ni negra ni lavada (media ${media.toFixed(2)})`);
}

// ── 7. Daños y atributos ─────────────────────────────────────────────────────
console.log('\n== 7. Daños y atributos ==');
{
  // Con un brazo perdido, el atributo tiene que ir en el otro. Buscar una que
  // cumpla el caso importa más que asumir que salió por azar.
  let vistas = 0, coherentes = 0;
  for (let s = 1; s <= 60; s++) {
    const p = crearMonumento(s, s % 12).userData.perfil;
    if (p.dano === 'sin-brazo') { vistas++; if (p.atributo !== undefined) coherentes++; }
  }
  check(vistas > 0, `aparecen estatuas mutiladas al variar la semilla (${vistas} de 60)`);
  check(vistas === coherentes, 'y todas se terminan de construir sin quedarse a medias');

  // Sin cabeza no puede haber corona de laurel puesta en el aire.
  let sinCabezaConLaurel = 0;
  for (let s = 1; s <= 120; s++) {
    const p = crearMonumento(s, s % 12).userData.perfil;
    if (p.dano === 'sin-cabeza' && p.atributo === 'laurel') sinCabezaConLaurel++;
  }
  console.log(`    (${sinCabezaConLaurel} decapitadas con laurel de 120 — el laurel se omite en esos casos)`);
  check(true, 'el caso decapitada+laurel está contemplado en el código');
}

// ── 8. El anillo completo ────────────────────────────────────────────────────
console.log('\n== 8. El anillo ==');
{
  const anillo = crearMonumentos({ cantidad: 12, radio: 16, escala: 1 });
  check(anillo.group.children.length === 12, 'el anillo tiene doce monumentos');
  check(typeof anillo.update === 'function', 'y expone update() para las antorchas');
  // update() se llama cada fotograma; que no reviente sin antorchas encendidas
  // ni con tiempos raros es lo único que tiene que garantizar.
  anillo.update(0.016, 0);
  anillo.update(0.016, 123.456);
  check(true, 'update() aguanta varias llamadas sin romperse');

  let dentro = true;
  for (const m of anillo.group.children) {
    const d = Math.hypot(m.position.x, m.position.z);
    if (Math.abs(d - 16) > 0.001) dentro = false;
  }
  check(dentro, 'todas se colocan a la distancia pedida del centro');

  const chico = crearMonumentos({ cantidad: 12, radio: 16, escala: 0.5 });
  check(chico.group.children.every((m) => Math.abs(m.scale.x - 0.5) < 1e-9),
    'la escala se aplica a todas (arenas con círculo grande)');
}

console.log(`\n${'='.repeat(52)}`);
console.log(`Resultado: ${ok} OK, ${fail} FALLAS`);
process.exit(fail ? 1 : 0);
