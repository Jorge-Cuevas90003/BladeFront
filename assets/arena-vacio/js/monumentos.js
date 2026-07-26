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
//  La erosión se talla igual pero al revés: esferas de influencia NEGATIVA que
//  restan masa. Así una fractura tiene borde irregular en vez de un corte liso.
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

// Resolución del campo. Medida: 112 cuesta ~33 ms y da ~6000 triángulos por
// figura; 128 sube a 54 ms sin una mejora visible a la escala a la que se ven.
const RESOLUCION = 112;
const RESTA = 12;   // dureza del decaimiento del campo

// Una sola instancia para las doce: el campo ocupa ~27 MB y no tiene sentido
// pagarlo doce veces cuando se puede reiniciar entre estatuas.
let _campo = null;
function campo() {
  if (!_campo) {
    _campo = new MarchingCubes(RESOLUCION, new THREE.MeshBasicMaterial(), false, false, 900000);
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
//  Materiales: una piedra y un metal por estatua.
//
//  El contraste entre los dos es lo que da identidad a cada monumento a
//  distancia, mucho más que la pose o la altura. Obsidiana con oro no se
//  confunde con mármol y plata ni de lejos.
// ---------------------------------------------------------------------------
const PIEDRAS = {
  marmol:    { color: 0xa8a294, roughness: 0.78, clearcoat: 0.14, clearcoatRoughness: 0.7,  veta: 1.0 },
  obsidiana: { color: 0x0a0c11, roughness: 0.09, clearcoat: 1.0,  clearcoatRoughness: 0.06, veta: 0.35 },
  basalto:   { color: 0x24272d, roughness: 0.9,  clearcoat: 0.04, clearcoatRoughness: 0.9,  veta: 0.5 },
  alabastro: { color: 0xc4b494, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.4,  veta: 0.75 },
  porfido:   { color: 0x6b3b3f, roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.5,  veta: 0.9 },
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

function materialPiedra(nombre) {
  const p = PIEDRAS[nombre];
  return new THREE.MeshPhysicalMaterial({
    vertexColors: true, color: p.color, metalness: 0.0,
    roughness: p.roughness, clearcoat: p.clearcoat, clearcoatRoughness: p.clearcoatRoughness,
    sheen: nombre === 'alabastro' ? 0.5 : 0.15,
    sheenColor: new THREE.Color(0xffeed6), sheenRoughness: 0.8,
  });
}
function materialMetal(nombre) {
  const m = METALES[nombre];
  return new THREE.MeshStandardMaterial({ color: m.color, metalness: 1.0, roughness: m.roughness });
}

// --- veteado por vértice ----------------------------------------------------
// Modula el color base. En obsidiana casi no se nota (es piedra homogénea); en
// mármol y pórfido es lo que le da vida a la superficie.
function vetear(geom, rng, intensidad) {
  const fase = rng() * 100;
  const dx = rng() - 0.5, dy = rng() * 0.3, dz = rng() - 0.5;
  const n = Math.hypot(dx, dy, dz) || 1;
  const p = geom.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = (x * dx + y * dy + z * dz) / n;
    let v = Math.abs(Math.sin(d * 3.1 + fase) * 0.5 + Math.sin(d * 11.3 + fase * 1.7) * 0.28);
    const veta = Math.pow(Math.max(0, 1 - v * 1.9), 3) * 0.4 * intensidad;
    const patina = Math.max(0, 0.45 - y * 0.1) * 0.28 * intensidad;
    const k = 1 - veta - patina;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// ---------------------------------------------------------------------------
//  Cuerpo continuo.
//
//  Se trabaja en el espacio del campo, [0,1] en los tres ejes, y al final se
//  reescala a la altura pedida a partir de la caja envolvente real. Así el
//  esqueleto se escribe con números legibles y no hay que calibrar a mano.
// ---------------------------------------------------------------------------
function cuerpoContinuo(construir) {
  const mc = campo();
  mc.reset();

  // radio → intensidad: en MarchingCubes el radio efectivo de una esfera de
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
  const alturaFig = az(3.4, 4.3);
  const corpulencia = az(0.9, 1.15);
  const ladoFirme = rng() < 0.5 ? -1 : 1;
  const ropaje = elegir(['chiton', 'chiton', 'himation', 'himation', 'peplo', 'desnudo']);
  const atributo = elegir(['lanza', 'escudo', 'laurel', 'urna', 'espada', 'antorcha', 'ninguno']);
  const dano = elegir(['intacta', 'intacta', 'sin-cabeza', 'sin-brazo', 'erosionada']);
  const pedestal = elegir(['tambor', 'gradas', 'ortostato']);

  // ── el cuerpo, de una pieza ──────────────────────────────────────────────
  // Coordenadas del campo: pies en y≈0.10, coronilla en y≈0.93.
  const brazoPerdido = dano === 'sin-brazo' ? (rng() < 0.5 ? -1 : 1) : 0;
  const ladoAtributo = brazoPerdido === 1 ? -1 : (brazoPerdido === -1 ? 1 : (rng() < 0.5 ? -1 : 1));
  const cx = 0.5, cz = 0.5;
  const k = corpulencia;

  // Contrapposto: la cadera del lado que aguanta el peso sube y los hombros
  // contragiran. Sin esto la figura queda en posición de firmes.
  const subeCadera = 0.012 * ladoFirme;
  const inclHombro = -0.010 * ladoFirme;
  const desvio = 0.012 * ladoFirme;         // el eje del cuerpo cae sobre la pierna firme

  // Canon de siete cabezas y media, medido desde el suelo: la entrepierna cae
  // a la mitad justa de la altura, los hombros a cinco cabezas y cuarto, y la
  // coronilla arriba. Con la cadera más baja el torso se alarga y la figura
  // deja de leer como humana.
  const yPies = 0.10, yCoronilla = 0.93;
  const alto = yCoronilla - yPies;
  const yCadera = yPies + alto * 0.50;
  const yHombro = yPies + alto * 0.835;
  const manoPos = {};

  const cuerpo = cuerpoContinuo(({ bola, hueco, hueso }) => {
    // Piernas. Los radios salen del canon: el muslo es casi tan ancho como
    // media cabeza. Con miembros finos la figura lee como alambre, no como
    // mármol tallado.
    for (const lado of [-1, 1]) {
      const firme = lado === ladoFirme;
      const xCad = cx + desvio + lado * 0.052 * k;
      const yCad = yCadera + (firme ? subeCadera : -subeCadera);
      const xPie = cx + lado * (firme ? 0.055 : 0.105) * k;
      const zPie = cz + (firme ? 0.0 : az(0.05, 0.085));
      const xRod = (xCad + xPie) / 2 + (firme ? 0 : lado * 0.006);
      const yRod = yPies + alto * 0.27;

      hueso([xCad, yCad, cz], [xRod, yRod, cz + (zPie - cz) * 0.4], 0.082 * k, 0.058 * k, 10);
      hueso([xRod, yRod, cz + (zPie - cz) * 0.4], [xPie, yPies + 0.03, zPie], 0.062 * k, 0.036 * k, 10);
      bola(xPie, yPies + 0.018, zPie + 0.022, 0.040 * k);   // empeine
      bola(xPie, yPies + 0.012, zPie + 0.05, 0.031 * k);    // punta del pie
    }

    // Pelvis y torso: caja torácica ancha, cintura marcada.
    hueso([cx + desvio, yCadera + subeCadera * 0.5, cz], [cx + desvio * 0.6, yCadera + alto * 0.1, cz], 0.105 * k, 0.088 * k, 7);
    hueso([cx + desvio * 0.6, yCadera + alto * 0.1, cz], [cx, yCadera + alto * 0.21, cz], 0.088 * k, 0.098 * k, 7);
    hueso([cx, yCadera + alto * 0.21, cz], [cx - desvio * 0.4, yHombro, cz], 0.098 * k, 0.105 * k, 8);
    // Clavículas: el ancho de hombros es lo que da porte heroico.
    hueso([cx - 0.10 * k, yHombro + inclHombro, cz], [cx + 0.10 * k, yHombro - inclHombro, cz], 0.058 * k, 0.058 * k, 8);

    // Brazos
    for (const lado of [-1, 1]) {
      if (lado === brazoPerdido) {
        // Muñón: se deja el hombro y se talla la rotura restando masa.
        bola(cx + lado * 0.10 * k, yHombro + inclHombro * lado, cz, 0.058 * k);
        hueco(cx + lado * 0.145 * k, yHombro - 0.02, cz + az(-0.02, 0.02), 0.06);
        continue;
      }
      const sostiene = lado === ladoAtributo && atributo !== 'ninguno' && atributo !== 'laurel';
      const xH = cx + lado * 0.10 * k, yH = yHombro + inclHombro * lado;
      const xC = xH + lado * az(0.025, 0.05);
      // Brazo caído: la muñeca cae a la altura de la cadera, ni más ni menos.
      const yC = yH - (sostiene ? alto * 0.14 : alto * 0.19);
      const zC = cz + (sostiene ? az(0.02, 0.05) : az(-0.01, 0.02));
      const xM = xC + lado * (sostiene ? az(0.0, 0.02) : az(0.005, 0.018));
      const yM = yC - (sostiene ? az(0.02, 0.07) : alto * 0.175);
      const zM = zC + (sostiene ? az(0.06, 0.1) : az(0.0, 0.02));

      hueso([xH, yH, cz], [xC, yC, zC], 0.058 * k, 0.044 * k, 9);
      hueso([xC, yC, zC], [xM, yM, zM], 0.044 * k, 0.033 * k, 9);
      bola(xM, yM - 0.016, zM + 0.01, 0.036 * k);   // mano
      if (sostiene) manoPos[lado] = [xM, yM, zM];
    }

    // Cuello y cabeza
    if (dano !== 'sin-cabeza') {
      const giro = -0.3 * ladoFirme;
      const yBarbilla = yHombro + alto * 0.055;
      const xCab = cx + Math.sin(giro) * 0.012;
      hueso([cx, yHombro + 0.005, cz], [xCab, yBarbilla, cz - 0.004], 0.046 * k, 0.040 * k, 5);
      // Cráneo: óvalo idealizado del canon, no una esfera.
      hueso([xCab, yBarbilla + 0.005, cz - 0.002], [xCab, yCoronilla - 0.012, cz - 0.008], 0.056, 0.048, 8);
      // Perfil griego: la nariz sale recta desde la frente, sin escalón. Es el
      // rasgo que identifica el estilo aunque la cara no tenga nada más.
      bola(xCab + Math.sin(giro) * 0.052, yBarbilla + alto * 0.045, cz + Math.cos(giro) * 0.052, 0.021);
      bola(xCab, yCoronilla - 0.03, cz - 0.035, 0.052);   // masa de pelo en la nuca
      bola(xCab, yBarbilla + alto * 0.05, cz - 0.055, 0.045);
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

  // Reescalado a partir de la caja real: el esqueleto se escribe en números
  // cómodos y la altura final la fija esta normalización.
  cuerpo.computeBoundingBox();
  const bb = cuerpo.boundingBox;
  const escala = alturaFig / (bb.max.y - bb.min.y);
  cuerpo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
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
    yBase = h;
  } else if (pedestal === 'gradas') {
    const alturas = [0.24, 0.2, 0.16], anchos = [1.05, 0.92, 0.8];
    let y = 0;
    for (let i = 0; i < 3; i++) {
      pieza(new THREE.BoxGeometry(anchos[i] * 2, alturas[i], anchos[i] * 2), piedraExtra, { y: y + alturas[i] / 2 });
      y += alturas[i];
    }
    pieza(new THREE.TorusGeometry(0.74, 0.02, 8, 48), metal, { y: y - 0.02, rx: Math.PI / 2 });
    yBase = y;
  } else {
    const h = az(1.15, 1.45);
    pieza(new THREE.BoxGeometry(1.55, h, 1.3), piedraExtra, { y: h / 2 });
    pieza(new THREE.BoxGeometry(1.72, 0.13, 1.46), piedraExtra, { y: 0.065 });
    pieza(new THREE.BoxGeometry(1.68, 0.1, 1.42), piedraExtra, { y: h - 0.05 });
    for (const dz of [0.652, -0.652]) {
      pieza(new THREE.BoxGeometry(1.1, 0.014, 0.014), metal, { y: h * 0.62, z: dz });
      pieza(new THREE.BoxGeometry(1.1, 0.014, 0.014), metal, { y: h * 0.5, z: dz });
    }
    yBase = h;
  }
  cuerpo.translate(0, yBase, 0);

  // ── paños ────────────────────────────────────────────────────────────────
  // Del espacio del campo a la altura real del monumento.
  const aMonumento = (yCampo) => yBase + (yCampo - yPies) / alto * alturaFig;
  const yCaderaM = aMonumento(yCadera);
  const yHombroM = aMonumento(yHombro);

  // Radio del cuerpo en el mundo, para que la tela nunca sea más estrecha que
  // lo que envuelve. La primera versión usaba un número fijo y dejaba un
  // escalón visible entre el torso y la falda.
  const rCuerpo = (rCampo) => rCampo * 2 * escala;
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
    // De coordenadas del campo a las del monumento. El campo [0,1] sale de
    // marching cubes en [-1,1], de ahí el factor 2, y luego va la escala que
    // fijó la normalización de altura.
    const x = (mp[0] - cx) * escala * 2;
    const y = aMonumento(mp[1]);
    const z = (mp[2] - cz) * escala * 2;

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
  if (atributo === 'laurel' && dano !== 'sin-cabeza') {
    const yCab = aMonumento(yHombro + alto * 0.105);
    pieza(new THREE.TorusGeometry(alturaFig * 0.052, 0.018, 8, 40), metal, { y: yCab, rx: Math.PI / 2 + 0.12 });
  }

  // ── mallas ───────────────────────────────────────────────────────────────
  const matPiedra = materialPiedra(nombrePiedra);
  const geomPiedra = fusionar([cuerpo, ...piedraExtra]);
  vetear(geomPiedra, rng, PIEDRAS[nombrePiedra].veta);
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
    ropaje, atributo, dano, pedestal, ladoFirme,
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
