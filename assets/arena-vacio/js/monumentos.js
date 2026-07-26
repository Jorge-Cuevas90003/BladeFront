// ============================================================================
//  LOS DOCE TESTIGOS — monumentos de mármol procedurales.
//
//  Efigies colosales de campeones caídos de la arena, talladas en un idioma
//  helenístico y erosionadas por el vacío. Cada una es única y determinista:
//  la misma semilla da siempre la misma estatua.
//
//  Lo que las hace leer como escultura griega y no como un muñeco genérico:
//
//   · CONTRAPPOSTO. El peso descansa sobre una pierna; la cadera de ese lado
//     sube, los hombros contragiran, la columna traza una S y la cabeza mira
//     hacia el lado relajado. Es LA convención del canon clásico y sin ella
//     cualquier figura parece un maniquí en posición de firmes.
//
//   · PAÑOS CON PLIEGUES VERTICALES. El chitón se genera como una superficie
//     de revolución cuyo radio se modula con el ángulo, no como un cono liso.
//     Los pliegues se retuercen con la altura para que caigan, no para que
//     bajen rectos.
//
//   · RUINA. Varias están decapitadas o mancas, con la fractura tallada. Un
//     conjunto de doce estatuas intactas parece de catálogo; uno con mármoles
//     rotos parece que lleva siglos ahí.
//
//  Rendimiento: cada estatua se compone de decenas de piezas que se FUSIONAN
//  en tres mallas (mármol, bronce, luz). Doce monumentos cuestan 36 llamadas
//  de dibujo en vez de varios cientos.
// ============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
//  Fusión robusta.
//
//  mergeGeometries() exige que TODAS las geometrías compartan exactamente los
//  mismos atributos y que estén todas indexadas o ninguna. Las primitivas de
//  three.js y las superficies propias de este módulo no siempre coinciden en
//  eso, así que se aplana todo a una forma común antes de fusionar: sin índice
//  y con position, normal y uv. Cuesta algo de memoria y elimina de raíz una
//  familia entera de fallos difíciles de diagnosticar.
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
// Semilla explícita: dos ejecuciones deben dar exactamente las mismas doce
// estatuas, o el escenario cambiaría en cada recarga.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
//  Superficie de revolución con pliegues.
//
//  Un cilindro cuyo radio depende de la ALTURA (el perfil: hombros anchos,
//  cintura estrecha) y del ÁNGULO (los pliegues del paño). La torsión hace que
//  los pliegues describan una hélice suave al caer, que es como se comporta la
//  tela real colgando de una cadera desnivelada.
// ---------------------------------------------------------------------------
function revolucion({
  perfil,                 // [{ y, r }] de abajo hacia arriba
  radial = 48,
  pliegues = 0,           // número de pliegues verticales
  amplitud = 0,           // profundidad de cada pliegue (fracción del radio)
  torsion = 0,            // giro de los pliegues por unidad de altura
  escalaZ = 1,            // aplasta la sección: los torsos son elípticos
  cerrarAbajo = false,
  cerrarArriba = false,
}) {
  const filas = perfil.length;
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];

  for (let i = 0; i < filas; i++) {
    const { y, r } = perfil[i];
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      const mod = pliegues > 0 ? 1 + amplitud * Math.cos(pliegues * th + torsion * y) : 1;
      const rr = r * mod;
      pos.push(Math.cos(th) * rr, y, Math.sin(th) * rr * escalaZ);
      nor.push(Math.cos(th), 0, Math.sin(th) * escalaZ);
      // Las primitivas de three.js traen uv; para poder fusionar con ellas,
      // estas superficies tienen que traerlo también aunque no se texturicen.
      uv.push(j / radial, i / (filas - 1));
    }
  }
  for (let i = 0; i < filas - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
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
    t.rotateX(Math.PI / 2); t.translate(0, perfil[0].y, 0);
    tapas.push(t);
  }
  if (cerrarArriba) {
    const u = perfil[filas - 1];
    const t = new THREE.CircleGeometry(u.r, radial);
    t.rotateX(-Math.PI / 2); t.translate(0, u.y, 0);
    tapas.push(t);
  }
  const salida = tapas.length ? fusionar([g, ...tapas]) : g;
  salida.computeVertexNormals();
  return salida;
}

// Perfil interpolado entre puntos de control, para que los cuerpos tengan
// transiciones suaves en vez de escalones.
function perfilSuave(control, pasos = 14) {
  const out = [];
  for (let i = 0; i < pasos; i++) {
    const t = i / (pasos - 1);
    const p = t * (control.length - 1);
    const i0 = Math.floor(p), i1 = Math.min(control.length - 1, i0 + 1);
    const f = p - i0;
    const s = f * f * (3 - 2 * f); // suavizado de Hermite
    out.push({
      y: control[i0].y + (control[i1].y - control[i0].y) * s,
      r: control[i0].r + (control[i1].r - control[i0].r) * s,
    });
  }
  return out;
}

// --- materiales -------------------------------------------------------------
// El mármol usa colores por vértice para el veteado, así que una sola
// instancia sirve para las doce estatuas aunque cada una tenga su veta.
const MAT_MARMOL = new THREE.MeshPhysicalMaterial({
  vertexColors: true,
  roughness: 0.78,          // piedra mate: el brillo alto la volvía plástico
  metalness: 0.0,
  clearcoat: 0.14,          // el pulido de la talla, muy tenue
  clearcoatRoughness: 0.7,
  sheen: 0.18,
  sheenColor: new THREE.Color(0xffeed6),
  sheenRoughness: 0.85,
});
const MAT_BRONCE = new THREE.MeshStandardMaterial({
  color: 0x9a7b3f, metalness: 1.0, roughness: 0.34,
});

// --- veteado ----------------------------------------------------------------
// Vetas por posición, con dos octavas de ruido barato. Determinista por
// estatua para que cada una tenga su propio patrón de mármol.
function vetear(geom, rng) {
  // Tonos claramente por debajo del blanco. Con ACES y exposición 1.1, un
  // albedo cercano a 1.0 se satura y el veteado desaparece: la estatua se ve
  // como un recorte de papel. Bajando a ~0.7 el mármol conserva su modelado.
  const tonos = [
    [0.74, 0.71, 0.65],   // crema de Paros
    [0.66, 0.68, 0.71],   // gris frío
    [0.75, 0.69, 0.65],   // rosado
    [0.70, 0.67, 0.58],   // pátina cálida
  ][Math.floor(rng() * 4)];
  const fase = rng() * 100;
  const dir = new THREE.Vector3(rng() - 0.5, rng() * 0.3, rng() - 0.5).normalize();

  const p = geom.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = x * dir.x + y * dir.y + z * dir.z;
    // Dos octavas: la primera da la veta gruesa, la segunda la rompe para que
    // no se vea como rayas periódicas.
    let v = Math.sin(d * 3.1 + fase) * 0.5 + Math.sin(d * 11.3 + fase * 1.7) * 0.28;
    v = Math.abs(v);
    const veta = Math.pow(Math.max(0, 1 - v * 1.9), 3) * 0.42;   // vetas oscuras finas
    const suciedad = Math.max(0, 0.45 - y * 0.1) * 0.3;          // pátina acumulada abajo
    const k = 1 - veta - suciedad;
    col[i * 3] = tonos[0] * k;
    col[i * 3 + 1] = tonos[1] * k;
    col[i * 3 + 2] = tonos[2] * k;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// ---------------------------------------------------------------------------
//  Una efigie.
//  `semilla` fija todo: proporciones, pose, ropaje, atributo y daño.
// ---------------------------------------------------------------------------
export function crearMonumento(semilla = 1) {
  const rng = mulberry32(semilla * 2654435761);
  const az = (a, b) => a + rng() * (b - a);
  const elegir = (arr) => arr[Math.floor(rng() * arr.length)];

  const marmol = [];   // geometrías que irán a la malla de mármol
  const bronce = [];
  const grupo = new THREE.Group();

  // Añade una pieza al lote aplicándole su transformación.
  const pieza = (geom, lote, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, sx, sy, sz } = {}) => {
    const g = geom.clone();
    g.scale(sx ?? s, sy ?? s, sz ?? s);
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    lote.push(g);
  };

  // ── carácter de la figura ────────────────────────────────────────────────
  const alturaFig = az(3.0, 3.7);
  const corpulencia = az(0.88, 1.18);
  const ladoFirme = rng() < 0.5 ? -1 : 1;      // pierna que soporta el peso
  // El desnudo heroico existe en el canon, pero es minoría: la mayoría de las
  // efigies van vestidas. Además el paño resuelve un problema de construcción,
  // porque cubre justo las uniones de cadera y muslo, que es donde una figura
  // hecha de piezas se delata como muñeco.
  const ropaje = elegir(['chiton', 'chiton', 'chiton', 'himation', 'himation', 'peplo', 'peplo', 'desnudo']);
  const atributo = elegir(['lanza', 'escudo', 'laurel', 'urna', 'rollo', 'espada', 'ninguno']);
  const dano = elegir(['intacta', 'intacta', 'sin-cabeza', 'sin-brazo', 'agrietada']);
  const pedestal = elegir(['tambor', 'gradas', 'ortostato']);

  // ── pedestal ─────────────────────────────────────────────────────────────
  // La base no es decorado: da escala a la figura y la separa del suelo, que
  // es lo que convierte una estatua en un monumento.
  let yBase = 0;
  if (pedestal === 'tambor') {
    // Tambor acanalado, como un fuste de columna reaprovechado.
    const h = az(1.0, 1.35);
    pieza(revolucion({
      perfil: [{ y: 0, r: 0.82 }, { y: h, r: 0.74 }],
      radial: 64, pliegues: 20, amplitud: 0.035, cerrarArriba: true, cerrarAbajo: true,
    }), marmol);
    pieza(new THREE.CylinderGeometry(0.9, 0.96, 0.14, 64), marmol, { y: 0.07 });
    pieza(new THREE.CylinderGeometry(0.86, 0.8, 0.1, 64), marmol, { y: h - 0.05 });
    pieza(new THREE.TorusGeometry(0.79, 0.022, 8, 64), bronce, { y: h - 0.24, rx: Math.PI / 2 });
    yBase = h + 0.02;
  } else if (pedestal === 'gradas') {
    // Plinto escalonado: tres losas decrecientes con bisel.
    const alturas = [0.24, 0.2, 0.16];
    const anchos = [1.05, 0.92, 0.8];
    let y = 0;
    for (let i = 0; i < 3; i++) {
      pieza(new THREE.BoxGeometry(anchos[i] * 2, alturas[i], anchos[i] * 2), marmol, { y: y + alturas[i] / 2 });
      y += alturas[i];
    }
    yBase = y + 0.02;
  } else {
    // Ortostato: bloque alto con una moldura y una franja de inscripción.
    const h = az(1.15, 1.45);
    pieza(new THREE.BoxGeometry(1.55, h, 1.3), marmol, { y: h / 2 });
    pieza(new THREE.BoxGeometry(1.72, 0.13, 1.46), marmol, { y: 0.065 });
    pieza(new THREE.BoxGeometry(1.68, 0.1, 1.42), marmol, { y: h - 0.05 });
    // Surco de inscripción, insinuado con dos filetes de bronce.
    for (const dz of [0.652, -0.652]) {
      pieza(new THREE.BoxGeometry(1.1, 0.012, 0.012), bronce, { y: h * 0.62, z: dz });
      pieza(new THREE.BoxGeometry(1.1, 0.012, 0.012), bronce, { y: h * 0.5, z: dz });
    }
    yBase = h + 0.02;
  }

  // ── esqueleto en contrapposto ────────────────────────────────────────────
  // Todas las medidas se derivan de la altura para que las proporciones se
  // mantengan al variar el tamaño.
  const hPierna = alturaFig * 0.47;
  const hTorso = alturaFig * 0.34;
  const rCadera = 0.2 * corpulencia;
  const yCadera = yBase + hPierna;
  const yHombro = yCadera + hTorso;

  const inclCadera = 0.075 * ladoFirme;   // la cadera del lado firme SUBE
  const inclHombro = -0.06 * ladoFirme;   // los hombros contragiran
  const giroCabeza = -0.32 * ladoFirme;   // mira hacia el lado relajado
  const desplazo = 0.055 * ladoFirme;     // el peso cae sobre la pierna firme

  // Piernas. La firme va recta bajo la cadera; la relajada se adelanta,
  // se abre y dobla la rodilla: eso es lo que crea la línea del contrapposto.
  for (const lado of [-1, 1]) {
    const firme = lado === ladoFirme;
    const xPie = lado * (0.17 + (firme ? 0 : 0.1));
    const zPie = firme ? 0 : az(0.14, 0.24);
    const xCad = lado * rCadera * 0.86 + desplazo;

    const muslo = revolucion({
      perfil: perfilSuave([{ y: 0, r: 0.115 }, { y: 0.45, r: 0.135 }, { y: 1, r: 0.105 }], 10),
      radial: 32, escalaZ: 0.88,
    });
    const hMuslo = hPierna * 0.52;
    const incl = Math.atan2(xCad - xPie, hMuslo);
    pieza(muslo, marmol, {
      x: (xCad + xPie) / 2, y: yCadera - hMuslo / 2, z: zPie * 0.35,
      sy: hMuslo, sx: corpulencia, sz: corpulencia, rz: incl,
    });

    const pantorrilla = revolucion({
      perfil: perfilSuave([{ y: 0, r: 0.07 }, { y: 0.35, r: 0.105 }, { y: 1, r: 0.075 }], 10),
      radial: 32, escalaZ: 0.9,
    });
    const hPant = hPierna * 0.48;
    pieza(pantorrilla, marmol, {
      x: xPie, y: yBase + hPant / 2, z: zPie,
      sy: hPant, sx: corpulencia, sz: corpulencia,
    });
    // Rodilla y pie, que rematan las articulaciones y evitan el corte seco.
    pieza(new THREE.SphereGeometry(0.1 * corpulencia, 20, 14), marmol, { x: xPie, y: yBase + hPant, z: zPie });
    pieza(new THREE.BoxGeometry(0.19, 0.09, 0.34), marmol, { x: xPie, y: yBase + 0.045, z: zPie + 0.07 });
  }

  // Torso: sección elíptica, pecho ancho y cintura marcada.
  const torso = revolucion({
    perfil: perfilSuave([
      { y: 0, r: 0.2 }, { y: 0.18, r: 0.185 }, { y: 0.42, r: 0.175 },
      { y: 0.72, r: 0.225 }, { y: 0.92, r: 0.235 }, { y: 1, r: 0.19 },
    ], 18),
    radial: 44, escalaZ: 0.72, cerrarArriba: true, cerrarAbajo: true,
  });
  pieza(torso, marmol, {
    x: desplazo, y: yCadera, sy: hTorso, sx: corpulencia, sz: corpulencia,
    rz: (inclCadera + inclHombro) * 0.5,
  });

  // ── ropaje ───────────────────────────────────────────────────────────────
  // El chitón cae desde la cintura; el himatión cruza el torso. Los pliegues
  // se retuercen con la altura para que caigan en vez de bajar rectos.
  if (ropaje !== 'desnudo') {
    // El peplo arranca del pecho; el chitón, de la cintura. El himatión es un
    // manto más corto sobre la túnica.
    const yAlto = ropaje === 'peplo' ? yCadera + hTorso * 0.72 : yCadera + hTorso * 0.18;
    const largo = ropaje === 'himation' ? hPierna * az(0.55, 0.72)
                : (yAlto - (yBase + az(0.06, 0.16)));

    // Perfil ancho: la tela cae SEPARADA del cuerpo, y ese hueco es lo que la
    // hace parecer tela y no pintura sobre la pierna.
    const tela = revolucion({
      perfil: perfilSuave([
        { y: 0, r: 0.40 }, { y: 0.2, r: 0.365 }, { y: 0.55, r: 0.315 },
        { y: 0.85, r: 0.28 }, { y: 1, r: 0.245 },
      ], 24),
      radial: 72,
      pliegues: Math.floor(az(10, 16)),
      amplitud: az(0.075, 0.125),   // pliegues más profundos: leen a distancia
      torsion: az(-3.0, 3.0),
      escalaZ: 0.88,
    });
    pieza(tela, marmol, {
      x: desplazo, y: yAlto - largo, z: 0,
      sy: largo, sx: corpulencia, sz: corpulencia,
      rz: inclCadera * 0.6, ry: az(0, Math.PI),
    });

    // Sobrepliegue (apoptygma): el doblez que cae sobre el pecho en el peplo.
    // Es el detalle que más identifica la prenda.
    if (ropaje === 'peplo') {
      pieza(revolucion({
        perfil: perfilSuave([{ y: 0, r: 0.30 }, { y: 0.6, r: 0.335 }, { y: 1, r: 0.30 }], 10),
        radial: 64, pliegues: 12, amplitud: 0.1, torsion: 1.4, escalaZ: 0.88,
      }), marmol, {
        x: desplazo, y: yCadera + hTorso * 0.3,
        sy: hTorso * 0.42, sx: corpulencia, sz: corpulencia,
      });
    }

    // Cinturón: hace que la tela parezca sujeta y no un cono apoyado.
    pieza(new THREE.TorusGeometry(0.225 * corpulencia, 0.028, 8, 44), bronce, {
      x: desplazo, y: yAlto - largo * 0.06, rx: Math.PI / 2,
    });

    if (ropaje === 'himation') {
      // Manto cruzando el torso en diagonal, con sus propios pliegues. Rompe
      // la simetría y cubre un hombro, que es como se llevaba.
      const ladoManto = rng() < 0.5 ? -1 : 1;
      pieza(revolucion({
        perfil: perfilSuave([{ y: 0, r: 0.26 }, { y: 0.5, r: 0.235 }, { y: 1, r: 0.16 }], 12),
        radial: 56, pliegues: 9, amplitud: 0.11, torsion: 2.2, escalaZ: 0.8,
      }), marmol, {
        x: desplazo + ladoManto * 0.04, y: yCadera + hTorso * 0.24,
        sy: hTorso * 0.78, sx: corpulencia, sz: corpulencia,
        rz: ladoManto * 0.1,
      });
      // Caída sobre el hombro.
      pieza(new THREE.BoxGeometry(0.13, 0.46, 0.34), marmol, {
        x: desplazo + ladoManto * 0.19, y: yHombro - 0.24,
        rz: ladoManto * 0.24, ry: az(-0.3, 0.3),
      });
    }
  }

  // ── brazos ───────────────────────────────────────────────────────────────
  // Uno sostiene el atributo (más alto y adelantado), el otro cuelga relajado.
  const brazoPerdido = dano === 'sin-brazo' ? (rng() < 0.5 ? -1 : 1) : 0;
  const ladoAtributo = rng() < 0.5 ? -1 : 1;

  for (const lado of [-1, 1]) {
    if (lado === brazoPerdido) {
      // Fractura tallada: un muñón irregular en el hombro.
      pieza(new THREE.IcosahedronGeometry(0.11 * corpulencia, 0), marmol, {
        x: desplazo + lado * 0.24, y: yHombro - 0.06, ry: rng() * 3,
        sx: 1, sy: 0.7, sz: 1,
      });
      continue;
    }
    const sostiene = lado === ladoAtributo && atributo !== 'ninguno';
    const elevacion = sostiene ? az(0.35, 0.75) : az(-0.12, 0.1);
    const apertura = sostiene ? az(0.3, 0.55) : az(0.1, 0.22);
    const lBrazo = hTorso * 0.56, lAnte = hTorso * 0.52;

    const xH = desplazo + lado * 0.23 * corpulencia;
    const yH = yHombro - 0.08;
    const xC = xH + lado * apertura;             // codo
    const yC = yH - lBrazo * Math.cos(elevacion);
    const zC = lBrazo * Math.sin(elevacion) * 0.6;

    pieza(new THREE.SphereGeometry(0.095 * corpulencia, 20, 14), marmol, { x: xH, y: yH });

    const brazo = revolucion({
      perfil: perfilSuave([{ y: 0, r: 0.06 }, { y: 0.4, r: 0.078 }, { y: 1, r: 0.058 }], 8),
      radial: 28, escalaZ: 0.92,
    });
    pieza(brazo, marmol, {
      x: (xH + xC) / 2, y: (yH + yC) / 2, z: zC / 2,
      sy: Math.hypot(xC - xH, yC - yH), sx: corpulencia, sz: corpulencia,
      rz: Math.atan2(xC - xH, yH - yC),
    });
    pieza(new THREE.SphereGeometry(0.075 * corpulencia, 18, 12), marmol, { x: xC, y: yC, z: zC });

    const xM = xC + lado * (sostiene ? 0.05 : 0.04);
    const yM = yC - lAnte * (sostiene ? 0.55 : 0.95);
    const zM = zC + (sostiene ? lAnte * 0.6 : 0.04);
    const ante = revolucion({
      perfil: perfilSuave([{ y: 0, r: 0.05 }, { y: 0.35, r: 0.066 }, { y: 1, r: 0.045 }], 8),
      radial: 28, escalaZ: 0.92,
    });
    pieza(ante, marmol, {
      x: (xC + xM) / 2, y: (yC + yM) / 2, z: (zC + zM) / 2,
      sy: Math.hypot(xM - xC, yM - yC, zM - zC), sx: corpulencia, sz: corpulencia,
      rz: Math.atan2(xM - xC, yC - yM), rx: -Math.atan2(zM - zC, Math.abs(yC - yM)),
    });
    pieza(new THREE.SphereGeometry(0.058 * corpulencia, 16, 12), marmol, { x: xM, y: yM, z: zM });

    if (sostiene) grupo.userData.mano = { x: xM, y: yM, z: zM, lado };
  }

  // ── cabeza ───────────────────────────────────────────────────────────────
  if (dano !== 'sin-cabeza') {
    const yCuello = yHombro - 0.02;
    pieza(new THREE.CylinderGeometry(0.075, 0.088, 0.15, 24), marmol, {
      x: desplazo, y: yCuello + 0.07, rz: inclHombro,
    });
    const yCab = yCuello + 0.26;
    const xCab = desplazo + Math.sin(giroCabeza) * 0.02;

    // Óvalo idealizado: el canon clásico no retrata, idealiza.
    pieza(new THREE.SphereGeometry(0.17, 32, 24), marmol, {
      x: xCab, y: yCab, ry: giroCabeza, sx: 0.92, sy: 1.12, sz: 0.98,
    });
    // Masa de pelo: casquete con pliegues, tratado como los paños.
    pieza(revolucion({
      perfil: perfilSuave([{ y: 0, r: 0.175 }, { y: 0.55, r: 0.192 }, { y: 1, r: 0.1 }], 10),
      radial: 40, pliegues: 14, amplitud: 0.07, torsion: 1.6,
    }), marmol, { x: xCab, y: yCab - 0.02, ry: giroCabeza, sy: 0.24 });
    // Nariz recta desde la frente: el "perfil griego", el rasgo que más
    // identifica el estilo aunque la cara no tenga ningún otro detalle.
    pieza(new THREE.BoxGeometry(0.035, 0.11, 0.05), marmol, {
      x: xCab + Math.sin(giroCabeza) * 0.15, y: yCab - 0.015,
      z: Math.cos(giroCabeza) * 0.15, ry: giroCabeza, rx: 0.12,
    });

    if (atributo === 'laurel') {
      pieza(new THREE.TorusGeometry(0.166, 0.016, 8, 40), bronce, {
        x: xCab, y: yCab + 0.055, rx: Math.PI / 2 + 0.1, ry: giroCabeza,
      });
    }
  } else {
    // Cuello quebrado: superficie irregular donde estaba la cabeza.
    pieza(new THREE.IcosahedronGeometry(0.1, 0), marmol, {
      x: desplazo, y: yHombro + 0.03, ry: rng() * 3, sy: 0.55,
    });
  }

  // ── atributo ─────────────────────────────────────────────────────────────
  const mano = grupo.userData.mano;
  if (mano && atributo !== 'laurel') {
    const { x, y, z, lado } = mano;
    if (atributo === 'lanza') {
      const largo = alturaFig * az(1.02, 1.2);
      pieza(new THREE.CylinderGeometry(0.022, 0.026, largo, 16), marmol, { x, y: y + largo * 0.32, z });
      pieza(new THREE.ConeGeometry(0.05, 0.24, 16), bronce, { x, y: y + largo * 0.32 + largo / 2 + 0.1, z });
      pieza(new THREE.ConeGeometry(0.032, 0.12, 12), bronce, { x, y: y + largo * 0.32 - largo / 2 - 0.05, z, rx: Math.PI });
    } else if (atributo === 'escudo') {
      // Aspis: disco abombado con umbo y refuerzo perimetral.
      pieza(revolucion({
        perfil: perfilSuave([{ y: 0, r: 0.44 }, { y: 0.5, r: 0.4 }, { y: 1, r: 0.18 }], 10),
        radial: 48,
      }), marmol, { x: x + lado * 0.12, y: y - 0.05, z: z + 0.06, rx: Math.PI / 2, sy: 0.16, rz: az(-0.3, 0.3) });
      pieza(new THREE.TorusGeometry(0.44, 0.03, 10, 48), bronce, {
        x: x + lado * 0.12, y: y - 0.05, z: z + 0.06, ry: Math.PI / 2, rz: Math.PI / 2,
      });
      pieza(new THREE.SphereGeometry(0.075, 20, 14), bronce, { x: x + lado * 0.12, y: y - 0.05, z: z + 0.15 });
    } else if (atributo === 'urna') {
      pieza(revolucion({
        perfil: perfilSuave([
          { y: 0, r: 0.1 }, { y: 0.12, r: 0.16 }, { y: 0.5, r: 0.22 },
          { y: 0.82, r: 0.13 }, { y: 1, r: 0.17 },
        ], 16),
        radial: 40, cerrarAbajo: true,
      }), marmol, { x, y: y - 0.14, z, sy: 0.46 });
      pieza(new THREE.TorusGeometry(0.155, 0.018, 8, 32), bronce, { x, y: y + 0.19, z, rx: Math.PI / 2 });
    } else if (atributo === 'rollo') {
      pieza(new THREE.CylinderGeometry(0.045, 0.045, 0.34, 20), marmol, { x, y: y - 0.02, z, rz: Math.PI / 2 + az(-0.3, 0.3) });
      pieza(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 20), bronce, { x: x + 0.17, y: y - 0.02, z, rz: Math.PI / 2 });
      pieza(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 20), bronce, { x: x - 0.17, y: y - 0.02, z, rz: Math.PI / 2 });
    } else if (atributo === 'espada') {
      const l = alturaFig * 0.34;
      pieza(new THREE.BoxGeometry(0.075, l, 0.022), marmol, { x, y: y - l / 2 - 0.06, z });
      pieza(new THREE.BoxGeometry(0.22, 0.035, 0.05), bronce, { x, y: y - 0.05, z });
      pieza(new THREE.SphereGeometry(0.045, 16, 12), bronce, { x, y: y + 0.04, z });
    }
  }

  // ── grieta ───────────────────────────────────────────────────────────────
  // No se resta geometría: se marca la fractura con una cuña oscura hundida,
  // que a esta distancia lee igual y cuesta una fracción.
  if (dano === 'agrietada') {
    const yG = yCadera + hTorso * az(0.2, 0.7);
    pieza(new THREE.BoxGeometry(0.5, 0.03, 0.5), marmol, {
      x: desplazo, y: yG, rz: az(-0.4, 0.4), ry: az(0, 3), sy: 1.4,
    });
  }

  // ── fusión ───────────────────────────────────────────────────────────────
  const mallaMarmol = fusionar(marmol);
  vetear(mallaMarmol, rng);
  const m1 = new THREE.Mesh(mallaMarmol, MAT_MARMOL);
  m1.castShadow = m1.receiveShadow = true;
  grupo.add(m1);

  if (bronce.length) {
    const m2 = new THREE.Mesh(fusionar(bronce), MAT_BRONCE);
    m2.castShadow = true;
    grupo.add(m2);
  }

  grupo.userData.perfil = { alturaFig, ropaje, atributo, dano, pedestal, ladoFirme };
  return grupo;
}

// ---------------------------------------------------------------------------
//  El anillo completo.
//  Devuelve { group, update(dt, t) } — la actualización solo mueve el pebetero
//  de cada monumento, porque la piedra no debe animarse.
// ---------------------------------------------------------------------------
export function crearMonumentos({ cantidad = 12, radio = 16, escala = 1, conBrasero = true } = {}) {
  const group = new THREE.Group();
  const braseros = [];

  for (let i = 0; i < cantidad; i++) {
    const a = (i / cantidad) * Math.PI * 2 + Math.PI / cantidad;
    const m = crearMonumento(i + 1);
    m.scale.setScalar(escala);
    m.position.set(Math.cos(a) * radio, 0, Math.sin(a) * radio);
    m.rotation.y = -a + Math.PI / 2 + (mulberry32(i * 7919)() - 0.5) * 0.5;
    group.add(m);

    if (conBrasero) {
      // Un pebetero bajo entre monumentos: separa las siluetas y da el único
      // punto de color cálido a un anillo que si no sería todo piedra fría.
      const b = new THREE.Group();
      const ang = a + Math.PI / cantidad;
      const cuenco = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.1, 0.14, 20),
        new THREE.MeshStandardMaterial({ color: 0x2a2118, metalness: 0.9, roughness: 0.45 })
      );
      cuenco.position.y = 0.42 * escala;
      const llama = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.13, 1),
        new THREE.MeshBasicMaterial({ color: 0xffb638, transparent: true, opacity: 0.85, fog: false })
      );
      llama.position.y = 0.55 * escala;
      const pie = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.09, 0.42, 12),
        new THREE.MeshStandardMaterial({ color: 0x241c14, metalness: 0.85, roughness: 0.5 })
      );
      pie.position.y = 0.21 * escala;
      b.add(pie, cuenco, llama);
      b.scale.setScalar(escala);
      b.position.set(Math.cos(ang) * radio, 0, Math.sin(ang) * radio);
      group.add(b);
      braseros.push({ llama, semilla: i * 2.1 });
    }
  }

  return {
    group,
    update(dt, t) {
      for (const { llama, semilla } of braseros) {
        const p = 1 + Math.sin(t * 7 + semilla) * 0.14 + Math.sin(t * 13.3 + semilla) * 0.07;
        llama.scale.set(p, p * 1.25, p);
        llama.material.opacity = 0.7 + Math.sin(t * 9 + semilla) * 0.16;
      }
    },
  };
}
