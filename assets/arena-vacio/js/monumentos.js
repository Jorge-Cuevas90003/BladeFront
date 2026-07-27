// ============================================================================
//  LOS DOCE TESTIGOS — monumentos procedurales de una sola pieza.
//
//  Efigies colosales de campeones caídos de la arena. Cada una es única y
//  determinista: la misma semilla da siempre la misma estatua.
//
//  ── Por qué el cuerpo se genera con campos de distancia ──
//
//  La primera versión ensamblaba cilindros y esferas por articulación. A
//  distancia de juego colaba, pero en primer plano se veían las juntas: un
//  hombro es una bola metida en un tubo, y eso lee como muñeco articulado, no
//  como talla.
//
//  Ahora el cuerpo entero es UNA superficie continua. Se define un esqueleto
//  de huesos, cada hueso siembra esferas de influencia en un campo escalar, y
//  se extrae la isosuperficie con marching cubes. Donde dos huesos se acercan,
//  sus campos se suman y la superficie los funde con un empalme suave — que es
//  exactamente lo que hace un escultor al desbastar la transición del deltoides
//  al bíceps. No hay junta que ver porque no hay dos piezas.
//
//  ── Cómo se marca la musculatura ──
//
//  La regla es sembrar masa, no restarla. Un pectoral es una banda extra sobre
//  el torso; el surco del esternón es el hueco que queda ENTRE los dos
//  pectorales. Lo mismo con los seis paños del abdomen. La resta queda para lo
//  que sí es un agujero: las cuencas de los ojos y las fracturas.
//
//  ── El número que hay que tener en la cabeza ──
//
//  El "radio" que se le pasa a addBall NO es el radio de la superficie: es el
//  alcance del campo, la distancia a la que su aportación llega a cero. La
//  superficie se extrae donde la suma de campos vale 80, mucho más adentro.
//  Medido sobre una cadena de bolas (test/verify-monumentos.mjs deja la sonda
//  documentada):
//
//      radio nominal   0.03   0.05   0.08   0.10
//      superficie      0.011  0.024  0.046  0.062      ≈ la mitad
//
//  Ignorar esto costó una tanda entera de estatuas con verrugas en la cara: la
//  nariz iba a 0.05 del eje del cráneo cuando la piel estaba a 0.024, o sea
//  flotando fuera, y marching cubes la sacaba como una bolita aparte. La regla
//  práctica: una bola de detalle se funde bien si su CENTRO cae dentro de la
//  superficie o como mucho a medio alcance por fuera, y sobresale más o menos
//  lo que se aleje del centro más 0.35 de su radio.
//
//  ── Lo que NO se genera así ──
//
//  Los paños siguen siendo superficies de revolución con pliegues, porque un
//  campo escalar los redondearía y perderían el filo del pliegue, que es
//  justamente lo que los hace leer como tela. Y el pedestal es arquitectura:
//  ahí la arista viva es correcta.
// ============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';

// Resolución del campo. Con la anatomía marcada hace falta más rejilla que
// antes: los rasgos de la cara miden ~0.02 del campo y a 112 se comían entre
// dos vóxeles. Medido: 128 cuesta ~46 ms y ~9500 triángulos por figura; 144
// sube a ~68 ms sin diferencia visible a la distancia a la que se ven.
const RESOLUCION = 128;
const RESTA = 12;   // dureza del decaimiento del campo

// Una sola instancia para las doce: el campo ocupa ~34 MB y no tiene sentido
// pagarlo doce veces cuando se puede reiniciar entre estatuas.
let _campo = null;
function campo() {
  if (!_campo) {
    _campo = new MarchingCubes(RESOLUCION, new THREE.MeshBasicMaterial(), false, false, 1400000);
  }
  return _campo;
}

// ---------------------------------------------------------------------------
//  Fusión robusta: mergeGeometries exige los mismos atributos y el mismo
//  estado de indexado en todas. Las primitivas de three.js, las superficies de
//  revolución y la malla de marching cubes no coinciden, así que se aplana
//  todo a una forma común. Elimina de raíz una familia entera de fallos.
// ---------------------------------------------------------------------------
function fusionar(lote) {
  const normalizadas = lote.map((g) => {
    const h = g.index ? g.toNonIndexed() : g;
    const pos = h.getAttribute('position');
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', pos);
    out.setAttribute('normal', h.getAttribute('normal') ?? new THREE.Float32BufferAttribute(new Float32Array(pos.count * 3), 3));
    out.setAttribute('uv', h.getAttribute('uv') ?? new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2));
    return out;
  });
  return mergeGeometries(normalizadas, false);
}

// --- azar determinista ------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
//  Superficie de revolución con pliegues — para los paños.
//  El radio se modula con el ÁNGULO (los pliegues) además de con la altura (el
//  perfil), y la torsión los hace caer en hélice en vez de bajar rectos.
// ---------------------------------------------------------------------------
function revolucion({
  perfil, radial = 48, pliegues = 0, amplitud = 0, torsion = 0,
  escalaZ = 1, cerrarAbajo = false, cerrarArriba = false,
}) {
  const filas = perfil.length;
  const pos = [], nor = [], uv = [], idx = [];

  for (let i = 0; i < filas; i++) {
    const { y, r } = perfil[i];
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      const mod = pliegues > 0 ? 1 + amplitud * Math.cos(pliegues * th + torsion * y) : 1;
      const rr = r * mod;
      pos.push(Math.cos(th) * rr, y, Math.sin(th) * rr * escalaZ);
      nor.push(Math.cos(th), 0, Math.sin(th) * escalaZ);
      uv.push(j / radial, i / (filas - 1));
    }
  }
  for (let i = 0; i < filas - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);

  const tapas = [];
  if (cerrarAbajo) {
    const t = new THREE.CircleGeometry(perfil[0].r, radial);
    t.rotateX(Math.PI / 2); t.translate(0, perfil[0].y, 0); tapas.push(t);
  }
  if (cerrarArriba) {
    const u = perfil[filas - 1];
    const t = new THREE.CircleGeometry(u.r, radial);
    t.rotateX(-Math.PI / 2); t.translate(0, u.y, 0); tapas.push(t);
  }
  const salida = tapas.length ? fusionar([g, ...tapas]) : g;
  salida.computeVertexNormals();
  return salida;
}

function perfilSuave(control, pasos = 14) {
  const out = [];
  for (let i = 0; i < pasos; i++) {
    const t = i / (pasos - 1);
    const p = t * (control.length - 1);
    const i0 = Math.floor(p), i1 = Math.min(control.length - 1, i0 + 1);
    const f = p - i0, s = f * f * (3 - 2 * f);
    out.push({
      y: control[i0].y + (control[i1].y - control[i0].y) * s,
      r: control[i0].r + (control[i1].r - control[i0].r) * s,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
//  Greca (meandro): la cenefa griega del pedestal.
//
//  Es la firma visual del estilo — más reconocible que cualquier moldura — y
//  sale barata: la celda unidad es una polilínea de seis tramos y cada tramo
//  una barra fina. Toda la banda acaba fundida en la malla de metal, así que
//  no cuesta ni una llamada de dibujo extra.
// ---------------------------------------------------------------------------
const CELDA_GRECA = [
  [0.00, 0.00, 0.00, 0.88], [0.00, 0.88, 0.74, 0.88],
  [0.74, 0.88, 0.74, 0.26], [0.74, 0.26, 0.30, 0.26],
  [0.30, 0.26, 0.30, 0.60], [0.30, 0.60, 0.54, 0.60],
];

function bandaGreca(celdas, altoCelda, grosor) {
  const barras = [];
  for (let c = 0; c < celdas; c++) {
    for (const [x0, y0, x1, y1] of CELDA_GRECA) {
      const g = new THREE.BoxGeometry(
        Math.abs(x1 - x0) * altoCelda + grosor,
        Math.abs(y1 - y0) * altoCelda + grosor,
        grosor
      );
      g.translate((c + (x0 + x1) / 2) * altoCelda, ((y0 + y1) / 2 - 0.44) * altoCelda, 0);
      barras.push(g);
    }
  }
  const banda = fusionar(barras);
  banda.translate(-celdas * altoCelda / 2, 0, 0);
  return banda;
}

// ---------------------------------------------------------------------------
//  Materiales: una piedra y un metal por estatua.
//
//  El contraste entre los dos es lo que da identidad a cada monumento a
//  distancia, mucho más que la pose o la altura. Obsidiana con oro no se
//  confunde con mármol y plata ni de lejos.
// ---------------------------------------------------------------------------
//  El campo `sheen` merece una nota. Estaba puesto a 0.15 para todas con un
//  color casi blanco, y eso lavaba las piedras oscuras: la obsidiana, que es
//  0x0a0c11 —negro— se veía gris claro, indistinguible del mármol. El sheen es
//  un lóbulo retrorreflectante pensado para terciopelo y telas; sobre una
//  piedra pulida no describe nada real y solo sube el suelo del color. Ahora
//  solo lo llevan las piedras claras y translúcidas, donde hace de subsuelo
//  barato, y la obsidiana y el basalto van a cero.
const PIEDRAS = {
  marmol:    { color: 0xa8a294, roughness: 0.78, clearcoat: 0.14, clearcoatRoughness: 0.7,  veta: 1.0,  sheen: 0.16 },
  obsidiana: { color: 0x0a0c11, roughness: 0.15, clearcoat: 0.9,  clearcoatRoughness: 0.10, veta: 0.35, sheen: 0 },
  basalto:   { color: 0x24272d, roughness: 0.9,  clearcoat: 0.04, clearcoatRoughness: 0.9,  veta: 0.5,  sheen: 0 },
  alabastro: { color: 0xc4b494, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.4,  veta: 0.75, sheen: 0.5 },
  porfido:   { color: 0x6b3b3f, roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.5,  veta: 0.9,  sheen: 0.06 },
};
const METALES = {
  oro:    { color: 0xc9a227, roughness: 0.26 },
  plata:  { color: 0xd6dbe2, roughness: 0.17 },
  bronce: { color: 0x96742f, roughness: 0.36 },
  cobre:  { color: 0xa85f34, roughness: 0.3 },
  electro:{ color: 0xd9c98a, roughness: 0.22 },   // aleación de oro y plata
};

// Doce parejas fijas: así el anillo entero tiene variedad garantizada en vez
// de depender de que el azar no repita.
const COMBOS = [
  ['obsidiana', 'oro'],   ['marmol', 'plata'],    ['marmol', 'oro'],
  ['obsidiana', 'plata'], ['alabastro', 'oro'],   ['basalto', 'cobre'],
  ['porfido', 'oro'],     ['marmol', 'bronce'],   ['obsidiana', 'electro'],
  ['alabastro', 'plata'], ['basalto', 'oro'],     ['porfido', 'plata'],
];

// ---------------------------------------------------------------------------
//  Complexiones. No es solo escala: cambia la relación hombro/cadera, cuánto
//  se marca el músculo y qué prendas y peinados pegan. Doce cuerpos con el
//  mismo canon se reconocen como doce copias por muy distinto que sea el
//  mármol; con esto cada uno es otra persona.
// ---------------------------------------------------------------------------
const COMPLEXIONES = {
  heroica:  { hombros: 1.00, cadera: 1.00, musculo: 1.00, esbeltez: 1.00, barba: 0.4 },
  atletica: { hombros: 0.95, cadera: 0.94, musculo: 0.85, esbeltez: 1.05, barba: 0.15 },
  colosal:  { hombros: 1.12, cadera: 1.06, musculo: 1.30, esbeltez: 0.95, barba: 0.75 },
  esbelta:  { hombros: 0.85, cadera: 1.08, musculo: 0.45, esbeltez: 1.07, barba: 0, femenina: true },
};

function materialPiedra(nombre) {
  const p = PIEDRAS[nombre];
  return new THREE.MeshPhysicalMaterial({
    vertexColors: true, color: p.color, metalness: 0.0,
    roughness: p.roughness, clearcoat: p.clearcoat, clearcoatRoughness: p.clearcoatRoughness,
    sheen: p.sheen,
    sheenColor: new THREE.Color(0xffeed6), sheenRoughness: 0.8,
  });
}
function materialMetal(nombre) {
  const m = METALES[nombre];
  return new THREE.MeshStandardMaterial({ color: m.color, metalness: 1.0, roughness: m.roughness });
}

// ---------------------------------------------------------------------------
//  Oclusión de ambiente, leída del propio campo escalar.
//
//  Sin esto la musculatura no se ve: la luz de la escena es suave y un
//  pectoral solo se distingue por un gradiente flojísimo. Lo que hace legible
//  una talla es la sombra que se acumula en los huecos — axila, ingle, cuenca
//  del ojo, surco entre los abdominales.
//
//  Lo normal sería trazar rayos contra la malla, que es caro. Pero aquí ya
//  tenemos el volumen resuelto en una rejilla: basta lanzar unos pocos rayos
//  cortos desde cada vértice hacia fuera y mirar si el campo sigue estando
//  DENTRO. Son lecturas sueltas de un Float32Array, sin geometría de por medio.
//  Medido: ~24 ms por figura para 42 muestras por vértice.
//
//  El radio va al revés de lo que parece. Medido sobre un torso con
//  abdominales:
//
//      radio    0.018  0.028  0.040  0.055  0.075
//      rango    0.67   0.55   0.43   0.36   0.26
//
//  Con radio grande los rayos se van tan lejos que casi siempre acaban fuera y
//  todo sale igual de iluminado — que es lo que pasaba con 0.055: media 0.95,
//  o sea nada. Con radio corto la sonda se queda pegada a la superficie y mide
//  curvatura, que es justo lo que oscurece un surco entre dos abdominales.
// ---------------------------------------------------------------------------

// Direcciones repartidas por una esfera con la espiral de Fibonacci. Fijas
// para todas las estatuas: no hace falta azar y así el resultado es estable.
const DIRS_AO = (() => {
  const n = 14, out = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = phi * i;
    out.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  return out;
})();
const PASOS_AO = [0.3, 0.62, 1.0];

function oclusionDeCampo(mc, geom, radio) {
  const pos = geom.getAttribute('position'), nor = geom.getAttribute('normal');
  const size = mc.size, yd = mc.yd, zd = mc.zd, f = mc.field, iso = mc.isolation;
  const ao = new Float32Array(pos.count);
  // Las posiciones salen en [-1,1]; la rejilla se indexa en [0,size).
  const alcance = radio * size;

  for (let v = 0; v < pos.count; v++) {
    const gx = (pos.getX(v) + 1) * 0.5 * size;
    const gy = (pos.getY(v) + 1) * 0.5 * size;
    const gz = (pos.getZ(v) + 1) * 0.5 * size;
    const nx = nor.getX(v), ny = nor.getY(v), nz = nor.getZ(v);

    let tapadas = 0, total = 0;
    for (const d of DIRS_AO) {
      // Hemisferio: la dirección que apunte hacia dentro se refleja hacia
      // fuera en vez de descartarse, así todas las muestras cuentan.
      const s = (d[0] * nx + d[1] * ny + d[2] * nz) < 0 ? -1 : 1;
      const dx = d[0] * s, dy = d[1] * s, dz = d[2] * s;
      for (const t of PASOS_AO) {
        const x = (gx + dx * alcance * t) | 0;
        const y = (gy + dy * alcance * t) | 0;
        const z = (gz + dz * alcance * t) | 0;
        total++;
        if (x < 0 || y < 0 || z < 0 || x >= size || y >= size || z >= size) continue;
        if (f[z * zd + y * yd + x] > iso) tapadas++;
      }
    }
    ao[v] = 1 - tapadas / total;
  }
  return ao;
}

// --- veteado por vértice ----------------------------------------------------
// Modula el color base. En obsidiana casi no se nota (es piedra homogénea); en
// mármol y pórfido es lo que le da vida a la superficie. Encima va la oclusión
// del cuerpo, que ocupa los primeros vértices de la geometría fusionada.
function vetear(geom, rng, intensidad, ao) {
  const fase = rng() * 100;
  const dx = rng() - 0.5, dy = rng() * 0.3, dz = rng() - 0.5;
  const n = Math.hypot(dx, dy, dz) || 1;
  const p = geom.attributes.position;
  const nrm = geom.attributes.normal;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = (x * dx + y * dy + z * dz) / n;
    let v = Math.abs(Math.sin(d * 3.1 + fase) * 0.5 + Math.sin(d * 11.3 + fase * 1.7) * 0.28);
    const veta = Math.pow(Math.max(0, 1 - v * 1.9), 3) * 0.4 * intensidad;
    const patina = Math.max(0, 0.45 - y * 0.1) * 0.28 * intensidad;
    let k = 1 - veta - patina;
    if (ao && i < ao.length) k *= 0.34 + 0.66 * ao[i];
    // A la intemperie las caras hacia arriba se lavan y las de abajo cogen
    // suciedad. Es poco, pero asienta la figura en el sitio.
    const ny = nrm.getY(i);
    k *= 1 + 0.07 * Math.max(0, ny) - 0.06 * Math.max(0, -ny);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// ---------------------------------------------------------------------------
//  Cuerpo continuo.
//
//  Se trabaja en el espacio del campo, [0,1] en los tres ejes; la malla sale
//  en [-1,1] (el cubo unidad de marching cubes) y al final se reescala a la
//  altura pedida a partir de la caja envolvente real. Así el esqueleto se
//  escribe con números legibles y no hay que calibrar a mano.
// ---------------------------------------------------------------------------
function cuerpoContinuo(construir, radioAO = 0.024) {
  const mc = campo();
  mc.reset();

  // radio → intensidad: en MarchingCubes el radio de soporte de una esfera de
  // influencia es sqrt(intensidad / resta).
  const bola = (x, y, z, r) => {
    if (r <= 0) return;
    mc.addBall(x, y, z, r * r * RESTA, RESTA);
  };
  // Esfera negativa: resta masa. Con esto se tallan las fracturas.
  const hueco = (x, y, z, r) => mc.addBall(x, y, z, -r * r * RESTA, RESTA);

  // Un hueso es una cadena de esferas entre dos puntos, con el radio
  // interpolado. Al solaparse forman un tronco continuo, y al acercarse a otro
  // hueso los campos se suman y la unión sale sola.
  const hueso = (a, b, r0, r1, n = 8) => {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      bola(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
           r0 + (r1 - r0) * t);
    }
  };

  construir({ bola, hueco, hueso });
  mc.update();

  const n = mc.count;
  if (!n) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mc.geometry.getAttribute('position').array.slice(0, n * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(mc.geometry.getAttribute('normal').array.slice(0, n * 3), 3));
  // La oclusión se calcula ahora, mientras el campo sigue en pie: en cuanto se
  // reinicie para la siguiente estatua ya no se puede recuperar.
  g.userData.ao = oclusionDeCampo(mc, g, radioAO);
  return g;
}

// ---------------------------------------------------------------------------
//  Una efigie.
// ---------------------------------------------------------------------------
export function crearMonumento(semilla = 1, indiceCombo = 0) {
  const rng = mulberry32(semilla * 2654435761);
  const az = (a, b) => a + rng() * (b - a);
  const elegir = (arr) => arr[Math.floor(rng() * arr.length)];

  const [nombrePiedra, nombreMetal] = COMBOS[indiceCombo % COMBOS.length];
  const grupo = new THREE.Group();
  const piedraExtra = [];   // paños: misma piedra, geometría aparte
  const metal = [];

  const pieza = (geom, lote, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, sx, sy, sz } = {}) => {
    const g = geom.clone();
    g.scale(sx ?? s, sy ?? s, sz ?? s);
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    lote.push(g);
  };

  // ── carácter ─────────────────────────────────────────────────────────────
  const nombreComplexion = elegir(['heroica', 'heroica', 'atletica', 'colosal', 'esbelta']);
  const cn = COMPLEXIONES[nombreComplexion];
  const alturaFig = az(3.4, 4.3) * cn.esbeltez;
  const corpulencia = az(0.9, 1.15);
  const ladoFirme = rng() < 0.5 ? -1 : 1;
  const ropaje = cn.femenina
    ? elegir(['peplo', 'peplo', 'chiton', 'himation'])
    : elegir(['chiton', 'chiton', 'himation', 'himation', 'peplo', 'desnudo']);
  const atributo = elegir(['lanza', 'escudo', 'laurel', 'urna', 'espada', 'antorcha', 'ninguno']);
  const dano = elegir(['intacta', 'intacta', 'sin-cabeza', 'sin-brazo', 'erosionada']);
  const pedestal = elegir(['tambor', 'gradas', 'ortostato']);
  const barbado = rng() < cn.barba;
  const melena = cn.femenina || barbado || rng() < 0.35;

  // ── el cuerpo, de una pieza ──────────────────────────────────────────────
  // Coordenadas del campo: pies en y≈0.10, coronilla en y≈0.93.
  const brazoPerdido = dano === 'sin-brazo' ? (rng() < 0.5 ? -1 : 1) : 0;
  const ladoAtributo = brazoPerdido === 1 ? -1 : (brazoPerdido === -1 ? 1 : (rng() < 0.5 ? -1 : 1));
  const cx = 0.5, cz = 0.5;
  const k = corpulencia;
  const kH = k * cn.hombros;      // anchura de hombros
  const kC = k * cn.cadera;       // anchura de cadera
  // Los volúmenes musculares se escalan aparte del hueso: el esqueleto es el
  // mismo canon para todos y lo que cambia entre un atleta y un coloso es
  // cuánto sobresale la carne encima.
  const mus = (r) => r * k * (0.55 + 0.45 * cn.musculo);

  // Contrapposto: la cadera del lado que aguanta el peso sube y los hombros
  // contragiran. Sin esto la figura queda en posición de firmes.
  const subeCadera = 0.012 * ladoFirme;
  const inclHombro = -0.010 * ladoFirme;
  const desvio = 0.012 * ladoFirme;         // el eje del cuerpo cae sobre la pierna firme

  // Canon de ocho cabezas, medido desde el suelo: la entrepierna cae a la
  // mitad justa de la altura, los hombros a seis cabezas y media, y la barbilla
  // a siete. Con la cadera más baja el torso se alarga y la figura deja de leer
  // como humana.
  //
  // El hueco entre hombro y barbilla es el cuello, y hay que dárselo con
  // holgura: la masa de la clavícula sube ~0.03 por encima de su eje y la de la
  // cabeza baja otro tanto, así que un cuello corto sobre el papel desaparece
  // del todo en la malla. Con 0.075 de separación queda cuello visible.
  const yPies = 0.10, yCoronilla = 0.93;
  const alto = yCoronilla - yPies;
  const yCadera = yPies + alto * 0.50;
  const yHombro = yPies + alto * 0.790;
  const yBarbilla = yPies + alto * 0.885;
  const manoPos = {};
  let cabezaPos = null;

  const cuerpo = cuerpoContinuo(({ bola, hueco, hueso }) => {
    // ── Piernas ──────────────────────────────────────────────────────────
    // Los radios salen del canon: el muslo es casi tan ancho como media
    // cabeza. Con miembros finos la figura lee como alambre, no como talla.
    for (const lado of [-1, 1]) {
      const firme = lado === ladoFirme;
      const xCad = cx + desvio + lado * 0.052 * kC;
      const yCad = yCadera + (firme ? subeCadera : -subeCadera);
      const xPie = cx + lado * (firme ? 0.055 : 0.105) * k;
      const zPie = cz + (firme ? 0.0 : az(0.05, 0.085));
      const zRod = cz + (zPie - cz) * 0.4;
      const xRod = (xCad + xPie) / 2 + (firme ? 0 : lado * 0.006);
      const yRod = yPies + alto * 0.27;

      hueso([xCad, yCad, cz], [xRod, yRod, zRod], 0.082 * k, 0.056 * k, 10);
      // Cuádriceps. El vasto interno baja más que el externo y esa asimetría
      // es lo que impide que el muslo lea como un tubo torneado.
      bola(xCad + (xRod - xCad) * 0.55, yCad + (yRod - yCad) * 0.55, cz + 0.028 * k, mus(0.046));
      bola(xCad + (xRod - xCad) * 0.78 - lado * 0.010 * k, yCad + (yRod - yCad) * 0.80, cz + 0.026 * k, mus(0.036));
      // Glúteo
      bola(xCad + lado * 0.008 * kC, yCad - alto * 0.030, cz - 0.046 * kC, mus(0.054));

      // Rótula: pequeña y saliente, para que la rodilla tenga un punto duro.
      bola(xRod, yRod, zRod + 0.024 * k, 0.030 * k);

      hueso([xRod, yRod, zRod], [xPie, yPies + 0.03, zPie], 0.060 * k, 0.034 * k, 10);
      // Gemelo, alto y por detrás; y el tendón que baja al talón.
      bola(xRod + (xPie - xRod) * 0.26, yRod - alto * 0.052, zRod - 0.026 * k, mus(0.046));
      bola(xRod + (xPie - xRod) * 0.45, yRod - alto * 0.090, zRod - 0.014 * k, mus(0.032));

      bola(xPie, yPies + 0.026, zPie - 0.014, 0.034 * k);   // talón
      bola(xPie, yPies + 0.018, zPie + 0.022, 0.040 * k);   // empeine
      bola(xPie, yPies + 0.012, zPie + 0.05, 0.031 * k);    // punta del pie
    }

    // ── Torso ────────────────────────────────────────────────────────────
    const yOmbligo = yCadera + alto * 0.105;
    const yCintura = yCadera + alto * 0.150;
    const yPecho = yHombro - alto * 0.075;

    hueso([cx + desvio, yCadera + subeCadera * 0.5, cz], [cx + desvio * 0.6, yOmbligo, cz], 0.100 * kC, 0.082 * k, 7);
    hueso([cx + desvio * 0.6, yOmbligo, cz], [cx, yCintura, cz], 0.082 * k, 0.086 * k, 5);
    hueso([cx, yCintura, cz], [cx - desvio * 0.4, yPecho, cz], 0.086 * k, 0.100 * k, 8);
    hueso([cx - desvio * 0.4, yPecho, cz], [cx - desvio * 0.5, yHombro, cz], 0.100 * k, 0.090 * k, 5);
    // Clavículas: el ancho de hombros es lo que da porte heroico. El radio es
    // ajustado a propósito — con más, la masa sube y se traga el cuello.
    hueso([cx - 0.112 * kH, yHombro + inclHombro, cz], [cx + 0.112 * kH, yHombro - inclHombro, cz], 0.050 * k, 0.050 * k, 9);
    // Trapecio: el puente cuello-hombro. Sin él el cuello sale de una losa —
    // pero si sube demasiado se traga el cuello entero, así que va bajo.
    for (const lado of [-1, 1]) {
      hueso([cx, yHombro + alto * 0.008, cz - 0.012], [cx + lado * 0.076 * kH, yHombro + inclHombro * lado, cz - 0.006],
            mus(0.022), mus(0.030), 5);
    }

    for (const lado of [-1, 1]) {
      if (cn.femenina) {
        bola(cx + lado * 0.040 * k, yPecho + alto * 0.012, cz + 0.046 * k, 0.046 * k);
      } else {
        // Pectoral: un PARCHE de masas pequeñas repartidas por el área, no una
        // bola ni un tubo. Los dos primeros intentos salieron redondos —leían
        // como pechos— porque una esfera o una cadena de esferas solo saben dar
        // una cúpula.
        //
        // Y el parche tiene que ARRANCAR EN LA CLAVÍCULA. El tercer intento
        // seguía leyendo como pecho aunque fuera un parche, porque ocupaba un
        // tercio de lo que ocupa un pectoral y colgaba en mitad del tórax. Un
        // pectoral va de la clavícula a la línea del pezón: casi la décima
        // parte de la altura de la figura.
        for (let ix = 0; ix < 4; ix++) {
          for (let iy = 0; iy < 4; iy++) {
            const fx = ix / 3, fy = iy / 3;
            bola(cx + lado * (0.012 + fx * 0.056) * k,
                 yHombro - alto * (0.022 + fy * 0.080),
                 cz + (0.042 - fx * 0.018 - fy * 0.006) * k,
                 mus(0.030 - fy * 0.006));
          }
        }
      }
      // Deltoides, dorsal ancho y el hueco de la axila entre los dos.
      bola(cx + lado * 0.098 * kH, yHombro + inclHombro * lado - alto * 0.014, cz, mus(0.050));
      bola(cx + lado * 0.080 * k, yPecho - alto * 0.030, cz - 0.030 * k, mus(0.044));
    }

    // Recto abdominal: seis paños en dos columnas. El surco central y las
    // líneas transversales son el hueco que queda entre ellos — sembrado en
    // positivo, sin tallar nada (ver cabecera del archivo).
    if (!cn.femenina) {
      for (let f = 0; f < 3; f++) {
        const yf = yOmbligo + alto * (0.014 + f * 0.036);
        for (const lado of [-1, 1]) {
          bola(cx + lado * (0.030 - f * 0.003) * k, yf, cz + 0.056 * k, mus(0.034));
        }
      }
      // Ingles: la "V" que baja de la cresta ilíaca al pubis.
      for (const lado of [-1, 1]) {
        hueso([cx + lado * 0.070 * kC, yCadera + alto * 0.040, cz + 0.042 * k],
              [cx + lado * 0.016 * kC, yCadera - alto * 0.012, cz + 0.058 * k], mus(0.026), mus(0.019), 5);
      }
    }

    // ── Brazos ───────────────────────────────────────────────────────────
    for (const lado of [-1, 1]) {
      if (lado === brazoPerdido) {
        // Muñón: se deja el hombro y se talla la rotura restando masa.
        bola(cx + lado * 0.10 * kH, yHombro + inclHombro * lado, cz, 0.058 * k);
        hueco(cx + lado * 0.145 * kH, yHombro - 0.02, cz + az(-0.02, 0.02), 0.06);
        continue;
      }
      const sostiene = lado === ladoAtributo && atributo !== 'ninguno' && atributo !== 'laurel';
      // Brazo en alto: el codo se abre a la altura del hombro y la mano queda
      // por encima de la cabeza. Es la pose que se lee a distancia, cuando la
      // cara ya no se distingue.
      const alzado = sostiene && (atributo === 'lanza' || atributo === 'antorcha' || atributo === 'espada') && rng() < 0.45;

      const xH = cx + lado * 0.10 * kH, yH = yHombro + inclHombro * lado;
      let xC, yC, zC, xM, yM, zM;
      if (alzado) {
        xC = xH + lado * az(0.05, 0.075);
        yC = yH + alto * az(0.005, 0.03);
        zC = cz - az(0.0, 0.025);
        xM = xC - lado * az(0.0, 0.022);
        yM = yC + alto * az(0.125, 0.165);
        zM = cz + az(0.015, 0.05);
      } else {
        xC = xH + lado * az(0.025, 0.05);
        // Brazo caído: la muñeca cae a la altura de la cadera, ni más ni menos.
        yC = yH - (sostiene ? alto * 0.14 : alto * 0.19);
        zC = cz + (sostiene ? az(0.02, 0.05) : az(-0.01, 0.02));
        xM = xC + lado * (sostiene ? az(0.0, 0.02) : az(0.005, 0.018));
        yM = yC - (sostiene ? az(0.02, 0.07) : alto * 0.175);
        zM = zC + (sostiene ? az(0.06, 0.1) : az(0.0, 0.02));
      }

      hueso([xH, yH, cz], [xC, yC, zC], 0.056 * k, 0.042 * k, 9);
      hueso([xC, yC, zC], [xM, yM, zM], 0.042 * k, 0.032 * k, 9);
      // Bíceps por delante, tríceps por detrás: el brazo deja de ser un cono.
      bola(xH + (xC - xH) * 0.45, yH + (yC - yH) * 0.45, cz + (zC - cz) * 0.45 + 0.024 * k, mus(0.040));
      bola(xH + (xC - xH) * 0.52, yH + (yC - yH) * 0.52, cz + (zC - cz) * 0.52 - 0.022 * k, mus(0.033));
      // Masa del antebrazo, justo bajo el codo.
      bola(xC + (xM - xC) * 0.26, yC + (yM - yC) * 0.26, zC + (zM - zC) * 0.26, mus(0.036));

      // Mano: palma y nudillos, alineados con el antebrazo. Con una sola bola
      // salía un disco pegado a la muñeca que parecía una aleta.
      const dx = xM - xC, dy = yM - yC, dz = zM - zC;
      const largoAnte = Math.hypot(dx, dy, dz) || 1;
      const av = (t) => [xM + dx / largoAnte * t, yM + dy / largoAnte * t, zM + dz / largoAnte * t];
      bola(...av(0.010), 0.032 * k);
      bola(...av(0.030), 0.026 * k);
      if (sostiene) manoPos[lado] = [xM, yM, zM];
    }

    // ── Cuello y cabeza ──────────────────────────────────────────────────
    if (dano !== 'sin-cabeza') {
      // La cabeza gira hacia el lado contrario al de la cadera alta — la otra
      // mitad del contrapposto. Todos los rasgos se colocan en el marco de la
      // cara, así que basta este giro para que la mirada vaya a alguna parte.
      const giro = -0.30 * ladoFirme;
      const cg = Math.cos(giro), sg = Math.sin(giro);
      const xCab = cx + Math.sin(giro) * 0.014;
      const yOjos = yBarbilla + alto * 0.052;
      // dx a la derecha de la figura, dy arriba, dz hacia donde mira.
      const cara = (dx, dy, dz) => [xCab + dx * cg + dz * sg, yOjos + dy, cz - dx * sg + dz * cg];

      // Cuello. Sube desde los hombros hasta la barbilla; se le da radio
      // generoso porque un cuello fino se rompe visualmente bajo el peso de la
      // cabeza.
      hueso([cx, yHombro + 0.008, cz], cara(0, -alto * 0.052, -0.004), 0.050 * k, 0.042 * k, 6);
      // Esternocleidomastoideo: los dos tendones que bajan de detrás de la
      // oreja al hueco del esternón. Detalle pequeño que se nota mucho con la
      // cabeza girada, que es siempre.
      for (const lado of [-1, 1]) {
        hueso([cx + lado * 0.026 * k, yHombro + 0.014, cz + 0.016],
              cara(lado * 0.020, -alto * 0.050, 0.008), mus(0.020), mus(0.016), 4);
      }

      // ── El cráneo fija la escala de la cara ──────────────────────────────
      // Una cabeza es un octavo del alto total y su anchura el 72 % de eso, o
      // sea 0.030 de medio ancho en este campo. Por la conversión de la
      // cabecera eso pide radio nominal ~0.058. Los rasgos se colocan contra
      // PIEL —la piel real— y no contra el radio nominal, que es el error que
      // llenó de verrugas la primera versión.
      //
      // Y va la cadena de abajo arriba con una bola extra en el occipucio: si
      // se engorda el cráneo para que la cabeza tenga volumen, sale una bola
      // más ancha que alta. El fondo se añade por detrás, no por los lados.
      //
      // La longitud de la cadena es lo que decide si la cabeza es un óvalo o
      // un balón. Medido con la sonda de perfiles: con un tramo corto salía
      // 0.96 de ancho/alto —una esfera— cuando el canon pide 0.72. Estirar el
      // tramo y adelgazar el radio arregla las dos cosas a la vez.
      const PIEL = 0.030;
      hueso(cara(0, -alto * 0.012, 0.000), cara(0, alto * 0.050, -0.012), 0.054, 0.048, 9);
      bola(...cara(0, alto * 0.010, -PIEL * 0.95), 0.044);   // occipucio

      // Mandíbula y mentón: la mandíbula va metida y solo el mentón asoma.
      hueso(cara(-0.022, -alto * 0.044, 0.008), cara(0.022, -alto * 0.044, 0.008), 0.034, 0.034, 5);
      bola(...cara(0, -alto * 0.046, PIEL * 0.72), 0.030);
      // Pómulos
      for (const lado of [-1, 1]) bola(...cara(lado * 0.022, alto * 0.002, PIEL * 0.62), 0.026);
      // Arco superciliar: en la escultura griega es una ceja continua y
      // sobresaliente. Es el rasgo que fija el estilo aunque no haya más cara.
      hueso(cara(-0.020, alto * 0.019, PIEL * 0.78), cara(0.020, alto * 0.019, PIEL * 0.78), 0.024, 0.024, 5);
      // Perfil griego: la nariz baja recta desde la frente, sin escalón. El
      // caballete queda enterrado y solo la punta se sale de la piel.
      hueso(cara(0, alto * 0.018, PIEL * 0.80), cara(0, -alto * 0.014, PIEL * 1.16), 0.020, 0.024, 6);
      bola(...cara(0, -alto * 0.029, PIEL * 0.92), 0.022);   // labios
      // Cuencas: aquí sí se resta, porque un ojo es literalmente un hueco. El
      // centro va justo por fuera de la piel para que muerda sin perforar.
      for (const lado of [-1, 1]) hueco(...cara(lado * 0.016, alto * 0.005, PIEL * 1.18), 0.026);
      // Orejas
      for (const lado of [-1, 1]) bola(...cara(lado * PIEL * 0.98, -alto * 0.010, -0.008), 0.022);

      // Pelo: un casquete apenas mayor que el cráneo, y encima mechones
      // apoyados en él. Los mechones son lo que impide que lea como un casco
      // liso — pero tienen que tocar la piel o salen flotando, y si se pasan de
      // gordos hinchan la cabeza entera.
      bola(...cara(0, alto * 0.040, -0.012), 0.046);
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        bola(...cara(Math.cos(a) * PIEL * 0.85, alto * 0.032 + Math.sin(a * 2) * 0.007, -0.006 + Math.sin(a) * PIEL * 0.85),
             az(0.018, 0.025));
      }
      if (melena) {
        for (const lado of [-1, 1]) {
          hueso(cara(lado * PIEL * 0.85, alto * 0.020, -0.018), cara(lado * PIEL * 0.95, -alto * 0.056, -0.024), 0.034, 0.026, 6);
        }
        hueso(cara(0, alto * 0.014, -PIEL * 0.9), cara(0, -alto * 0.072, -PIEL * 0.8), 0.044, 0.032, 7);
      }
      if (barbado) {
        hueso(cara(-0.022, -alto * 0.040, PIEL * 0.5), cara(0.022, -alto * 0.040, PIEL * 0.5), 0.032, 0.032, 5);
        bola(...cara(0, -alto * 0.062, PIEL * 0.6), 0.036);
        for (let i = 0; i < 5; i++) {
          bola(...cara(az(-0.020, 0.020), -alto * az(0.046, 0.072), az(0.004, PIEL * 0.7)), az(0.020, 0.027));
        }
      }
      cabezaPos = cara(0, alto * 0.024, 0);
    } else {
      bola(cx, yHombro + 0.02, cz, 0.05 * k);
      hueco(cx + az(-0.03, 0.03), yHombro + 0.075, cz + az(-0.03, 0.03), 0.065);
    }

    // Erosión: mordidas al azar en la masa. Es lo que separa una ruina de una
    // figura lisa a la que le falta un trozo.
    if (dano === 'erosionada') {
      for (let i = 0; i < 5; i++) {
        hueco(cx + az(-0.11, 0.11), az(0.3, 0.8), cz + az(-0.09, 0.09), az(0.035, 0.07));
      }
    }
    for (let i = 0; i < 3; i++) {
      hueco(cx + az(-0.12, 0.12), az(0.15, 0.85), cz + az(-0.1, 0.1), az(0.018, 0.032));
    }
  });

  const aoCuerpo = cuerpo.userData.ao;

  // Reescalado a partir de la caja real: el esqueleto se escribe en números
  // cómodos y la altura final la fija esta normalización.
  cuerpo.computeBoundingBox();
  const bb = cuerpo.boundingBox.clone();
  const escala = alturaFig / (bb.max.y - bb.min.y);
  const cxG = (bb.min.x + bb.max.x) / 2, czG = (bb.min.z + bb.max.z) / 2;
  cuerpo.translate(-cxG, -bb.min.y, -czG);
  cuerpo.scale(escala, escala, escala);

  // ── pedestal ─────────────────────────────────────────────────────────────
  let yBase = 0;
  if (pedestal === 'tambor') {
    const h = az(1.0, 1.35);
    pieza(revolucion({
      perfil: [{ y: 0, r: 0.82 }, { y: h, r: 0.74 }],
      radial: 64, pliegues: 20, amplitud: 0.035, cerrarArriba: true, cerrarAbajo: true,
    }), piedraExtra);
    pieza(new THREE.CylinderGeometry(0.9, 0.96, 0.14, 64), piedraExtra, { y: 0.07 });
    pieza(new THREE.CylinderGeometry(0.86, 0.8, 0.1, 64), piedraExtra, { y: h - 0.05 });
    pieza(new THREE.TorusGeometry(0.79, 0.024, 8, 64), metal, { y: h - 0.24, rx: Math.PI / 2 });
    // Corona de laurel alrededor del tambor: en un cilindro la greca tendría
    // que curvarse tramo a tramo, y una guirnalda de hojas queda mejor y sale
    // más barata.
    const hojas = 34;
    for (let i = 0; i < hojas; i++) {
      const a = (i / hojas) * Math.PI * 2;
      const r = 0.80;
      pieza(new THREE.SphereGeometry(0.05, 8, 6), metal, {
        x: Math.cos(a) * r, z: Math.sin(a) * r, y: h * 0.42 + Math.sin(a * 5) * 0.02,
        ry: -a, sx: 0.35, sy: 0.9, sz: 1.5, rz: (i % 2 ? 1 : -1) * 0.5,
      });
    }
    yBase = h;
  } else if (pedestal === 'gradas') {
    const alturas = [0.24, 0.2, 0.16], anchos = [1.05, 0.92, 0.8];
    let y = 0;
    for (let i = 0; i < 3; i++) {
      pieza(new THREE.BoxGeometry(anchos[i] * 2, alturas[i], anchos[i] * 2), piedraExtra, { y: y + alturas[i] / 2 });
      y += alturas[i];
    }
    // La banda se dibuja en el plano XY; el giro la orienta a cada cara y la
    // traslación (que pieza aplica DESPUÉS de rotar) la empuja hacia fuera.
    const banda = bandaGreca(8, 0.155, 0.022);
    const fuera = anchos[2] + 0.012;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      pieza(banda, metal, {
        y: y - alturas[2] / 2, ry: a,
        x: Math.sin(a) * fuera, z: Math.cos(a) * fuera,
      });
    }
    yBase = y;
  } else {
    const h = az(1.15, 1.45);
    pieza(new THREE.BoxGeometry(1.55, h, 1.3), piedraExtra, { y: h / 2 });
    pieza(new THREE.BoxGeometry(1.72, 0.13, 1.46), piedraExtra, { y: 0.065 });
    pieza(new THREE.BoxGeometry(1.68, 0.1, 1.42), piedraExtra, { y: h - 0.05 });
    const banda = bandaGreca(7, 0.185, 0.024);
    for (const dz of [0.664, -0.664]) {
      pieza(banda, metal, { y: h * 0.56, z: dz, ry: dz > 0 ? 0 : Math.PI });
    }
    for (const dx of [0.788, -0.788]) {
      pieza(bandaGreca(6, 0.185, 0.024), metal, { y: h * 0.56, x: dx, ry: dx > 0 ? Math.PI / 2 : -Math.PI / 2 });
    }
    yBase = h;
  }
  cuerpo.translate(0, yBase, 0);

  // ── del campo al mundo ───────────────────────────────────────────────────
  // Exacto, no aproximado: se aplica la misma cadena que sufrió la geometría
  // (campo [0,1] → cubo [-1,1] → centrado → escala → sobre el pedestal). Antes
  // esto se estimaba a mano y los atributos quedaban unos centímetros fuera.
  const alMundo = (p) => ({
    x: (p[0] * 2 - 1 - cxG) * escala,
    y: (p[1] * 2 - 1 - bb.min.y) * escala + yBase,
    z: (p[2] * 2 - 1 - czG) * escala,
  });

  // ── paños ────────────────────────────────────────────────────────────────
  const yCaderaM = alMundo([cx, yCadera, cz]).y;
  const yHombroM = alMundo([cx, yHombro, cz]).y;

  // Radio del cuerpo en el mundo, para que la tela nunca sea más estrecha que
  // lo que envuelve. La primera versión usaba un número fijo y dejaba un
  // escalón visible entre el torso y la falda.
  //
  // El 0.6 es la conversión de radio nominal a piel de la cabecera. Sin él la
  // tela se dimensionaba contra un cuerpo un 60 % más gordo del que hay, y el
  // chitón salía como un miriñaque: una campana del 40 % de la altura de la
  // figura cuando una túnica griega no pasa del 25 %.
  const PIEL_TORSO = 0.6;
  const rCuerpo = (rCampo) => rCampo * PIEL_TORSO * 2 * escala;
  const rCintura = rCuerpo(0.088 * k);

  if (ropaje !== 'desnudo') {
    const yAlto = ropaje === 'peplo' ? yHombroM - alturaFig * 0.05 : yCaderaM + alturaFig * 0.035;
    const largo = ropaje === 'himation' ? (yAlto - yBase) * az(0.5, 0.68) : (yAlto - yBase) * az(0.88, 0.98);
    // El perfil va normalizado a 1 en su punto más ancho; el factor lo ata al
    // cuerpo: arriba algo más ancho que la cintura, abajo bien acampanado.
    const fTela = rCintura * 1.16;
    pieza(revolucion({
      perfil: perfilSuave([
        { y: 0, r: 1.62 }, { y: 0.2, r: 1.46 }, { y: 0.55, r: 1.24 },
        { y: 0.85, r: 1.08 }, { y: 1, r: 1.0 },
      ], 24),
      radial: 72, pliegues: Math.floor(az(10, 16)), amplitud: az(0.08, 0.13),
      torsion: az(-3.0, 3.0), escalaZ: 0.88,
    }), piedraExtra, {
      y: yAlto - largo, sy: largo, sx: fTela, sz: fTela, rz: subeCadera * 6, ry: az(0, Math.PI),
    });

    if (ropaje === 'peplo') {
      // Apoptygma: el doblez que cae sobre el pecho. Es lo que identifica la
      // prenda, y va por fuera del torso para que se lea como una capa aparte.
      const fDobl = rCuerpo(0.098 * k) * 1.14;
      pieza(revolucion({
        perfil: perfilSuave([{ y: 0, r: 1.0 }, { y: 0.6, r: 1.1 }, { y: 1, r: 1.0 }], 10),
        radial: 64, pliegues: 12, amplitud: 0.11, torsion: 1.4, escalaZ: 0.88,
      }), piedraExtra, { y: yCaderaM + alturaFig * 0.12, sy: alturaFig * 0.15, sx: fDobl, sz: fDobl });
    }
    if (ropaje === 'himation') {
      const ladoManto = rng() < 0.5 ? -1 : 1;
      const fManto = rCuerpo(0.10 * k) * 1.12;
      pieza(revolucion({
        perfil: perfilSuave([{ y: 0, r: 1.0 }, { y: 0.5, r: 0.94 }, { y: 1, r: 0.72 }], 12),
        radial: 56, pliegues: 9, amplitud: 0.12, torsion: 2.2, escalaZ: 0.8,
      }), piedraExtra, {
        y: yCaderaM + alturaFig * 0.07, sy: alturaFig * 0.27, sx: fManto, sz: fManto, rz: ladoManto * 0.1,
      });
    }
    // Cinturón: el metal a media altura ancla la silueta y es donde primero se
    // ve de qué está hecha cada estatua.
    pieza(new THREE.TorusGeometry(fTela * 1.02, 0.032, 8, 44), metal, { y: yAlto - largo * 0.04, rx: Math.PI / 2 });
  }

  // ── atributo, en metal ───────────────────────────────────────────────────
  const lado = ladoAtributo;
  const mp = manoPos[lado];
  if (mp) {
    const { x, y, z } = alMundo(mp);

    if (atributo === 'lanza') {
      const largo = alturaFig * az(1.0, 1.18);
      pieza(new THREE.CylinderGeometry(0.024, 0.028, largo, 16), metal, { x, y: y + largo * 0.3, z });
      pieza(new THREE.ConeGeometry(0.055, 0.26, 16), metal, { x, y: y + largo * 0.3 + largo / 2 + 0.11, z });
      pieza(new THREE.ConeGeometry(0.034, 0.13, 12), metal, { x, y: y + largo * 0.3 - largo / 2 - 0.055, z, rx: Math.PI });
    } else if (atributo === 'escudo') {
      pieza(revolucion({
        perfil: perfilSuave([{ y: 0, r: 0.48 }, { y: 0.5, r: 0.43 }, { y: 1, r: 0.2 }], 12),
        radial: 56,
      }), metal, { x: x + lado * 0.13, y: y - 0.05, z: z + 0.07, rx: Math.PI / 2, sy: 0.18, rz: az(-0.3, 0.3) });
      pieza(new THREE.SphereGeometry(0.08, 20, 14), metal, { x: x + lado * 0.13, y: y - 0.05, z: z + 0.17 });
    } else if (atributo === 'urna') {
      pieza(revolucion({
        perfil: perfilSuave([
          { y: 0, r: 0.1 }, { y: 0.12, r: 0.17 }, { y: 0.5, r: 0.23 },
          { y: 0.82, r: 0.13 }, { y: 1, r: 0.18 },
        ], 16),
        radial: 40, cerrarAbajo: true,
      }), metal, { x, y: y - 0.16, z, sy: 0.5 });
    } else if (atributo === 'espada') {
      const l = alturaFig * 0.32;
      pieza(new THREE.BoxGeometry(0.08, l, 0.024), metal, { x, y: y - l / 2 - 0.06, z });
      pieza(new THREE.BoxGeometry(0.24, 0.038, 0.055), metal, { x, y: y - 0.05, z });
      pieza(new THREE.SphereGeometry(0.048, 16, 12), metal, { x, y: y + 0.04, z });
    } else if (atributo === 'antorcha') {
      pieza(new THREE.CylinderGeometry(0.028, 0.034, 0.5, 14), metal, { x, y: y + 0.16, z });
      pieza(revolucion({
        perfil: perfilSuave([{ y: 0, r: 0.05 }, { y: 0.5, r: 0.13 }, { y: 1, r: 0.1 }], 8),
        radial: 24,
      }), metal, { x, y: y + 0.41, z, sy: 0.2 });
      grupo.userData.antorcha = new THREE.Vector3(x, y + 0.6, z);
    }
  }
  if (atributo === 'laurel' && cabezaPos) {
    const c = alMundo(cabezaPos);
    pieza(new THREE.TorusGeometry(alturaFig * 0.050, 0.017, 8, 40), metal,
      { x: c.x, y: c.y, z: c.z, rx: Math.PI / 2 + 0.12 });
  }

  // ── mallas ───────────────────────────────────────────────────────────────
  const matPiedra = materialPiedra(nombrePiedra);
  // El cuerpo va primero: así sus vértices ocupan el tramo inicial de la
  // geometría fusionada y el array de oclusión indexa directamente sobre ella.
  const geomPiedra = fusionar([cuerpo, ...piedraExtra]);
  vetear(geomPiedra, rng, PIEDRAS[nombrePiedra].veta, aoCuerpo);
  const mallaPiedra = new THREE.Mesh(geomPiedra, matPiedra);
  mallaPiedra.castShadow = mallaPiedra.receiveShadow = true;
  grupo.add(mallaPiedra);

  if (metal.length) {
    const mallaMetal = new THREE.Mesh(fusionar(metal), materialMetal(nombreMetal));
    mallaMetal.castShadow = true;
    grupo.add(mallaMetal);
  }

  grupo.userData.perfil = {
    alturaFig: +alturaFig.toFixed(2), piedra: nombrePiedra, metal: nombreMetal,
    complexion: nombreComplexion, ropaje, atributo, dano, pedestal, ladoFirme,
    barbado, melena,
    triangulos: geomPiedra.getAttribute('position').count / 3,
  };
  return grupo;
}

// ---------------------------------------------------------------------------
//  El anillo completo.
// ---------------------------------------------------------------------------
export function crearMonumentos({ cantidad = 12, radio = 16, escala = 1 } = {}) {
  const group = new THREE.Group();
  const llamas = [];

  for (let i = 0; i < cantidad; i++) {
    const a = (i / cantidad) * Math.PI * 2 + Math.PI / cantidad;
    const m = crearMonumento(i + 1, i);
    m.scale.setScalar(escala);
    m.position.set(Math.cos(a) * radio, 0, Math.sin(a) * radio);
    m.rotation.y = -a + Math.PI / 2 + (mulberry32(i * 7919)() - 0.5) * 0.5;
    group.add(m);

    // Si la efigie lleva antorcha, arde. Es el único elemento animado: la
    // piedra debe quedarse quieta o deja de parecer piedra.
    if (m.userData.antorcha) {
      const llama = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.11, 1),
        new THREE.MeshBasicMaterial({ color: 0xffc766, transparent: true, opacity: 0.85, fog: false })
      );
      llama.position.copy(m.userData.antorcha);
      m.add(llama);
      llamas.push({ llama, semilla: i * 2.1 });
    }
  }

  return {
    group,
    update(dt, t) {
      for (const { llama, semilla } of llamas) {
        const p = 1 + Math.sin(t * 7 + semilla) * 0.16 + Math.sin(t * 13.3 + semilla) * 0.08;
        llama.scale.set(p, p * 1.3, p);
        llama.material.opacity = 0.68 + Math.sin(t * 9 + semilla) * 0.18;
      }
    },
  };
}
