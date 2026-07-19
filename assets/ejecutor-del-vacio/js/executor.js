// Ejecutor del Vacío — enemigo procedural (verdugo corrupto masivo).
// createExecutor() devuelve un THREE.Group (pies en y=0, ~2.9 m + cuernos).
// Motor-agnóstico: se usa igual en three.js vanilla o dentro de R3F vía <primitive>.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ---------- Materiales ----------
export const EMAT = {
  // Obsidiana quemada: negro mate forjado que absorbe la luz (spec exacta)
  obsidian:     new THREE.MeshStandardMaterial({ color: 0x111214, metalness: 0.85, roughness: 0.7 }),
  obsidianDark: new THREE.MeshStandardMaterial({ color: 0x0a0b0d, metalness: 0.8,  roughness: 0.8 }),
  iron:         new THREE.MeshStandardMaterial({ color: 0x1b1d20, metalness: 0.9,  roughness: 0.55 }),
  // Visor volcánico: láser rojo de alta intensidad (la IA lo sube a 50 al impactar)
  visor: new THREE.MeshStandardMaterial({ color: 0x050203, emissive: 0xff1100, emissiveIntensity: 22 }),
  // Canal de calor del hacha (pulsa en el bucle)
  heat:  new THREE.MeshStandardMaterial({ color: 0x0a0303, emissive: 0xff2200, emissiveIntensity: 2.5 }),
  // Grietas de magma tenues entre placas
  crack: new THREE.MeshStandardMaterial({ color: 0x080304, emissive: 0xff3300, emissiveIntensity: 1.1 }),
};

// ---------- Helpers ----------
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

function mesh(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function box(w, h, d, mat, r = 0.02) {
  return mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), mat);
}

function limb(from, to, rFrom, rTo, mat, radial = 16) {
  const a = V3(...from), b = V3(...to);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const m = mesh(new THREE.CylinderGeometry(rTo, rFrom, len, radial), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(V3(0, 1, 0), dir.normalize());
  return m;
}

function spike(r, h, mat = EMAT.obsidian) {
  return mesh(new THREE.ConeGeometry(r, h, 8), mat);
}

// Placa dentada extruida desde un polígono 2D (nada de primitivas simples)
function jaggedPlate(pts, depth, mat) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 1,
  });
  g.translate(0, 0, -depth / 2);
  return mesh(g, mat);
}

// ---------- Casco astado: manipulación directa del array de vértices ----------
// Casco denso; la placa superior del cráneo se "rasga" en dos cuernos afilados
// que crecen hacia arriba y afuera a 30° de la vertical.
function hornedHullGeometry() {
  const geo = new THREE.CylinderGeometry(0.26, 0.31, 0.55, 30, 10);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const TOP = 0.275, BASE = 0.02;
  const SPREAD = 0.62;               // apertura angular de cada cuerno
  const SIN30 = Math.sin(Math.PI / 6), COS30 = Math.cos(Math.PI / 6);

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const band = (v.y - BASE) / (TOP - BASE);   // 0 abajo → 1 en la placa superior
    if (band <= 0) continue;
    const ang = Math.atan2(v.x, v.z);           // 0 = frente (+z)
    for (const s of [-1, 1]) {
      const axis = s * Math.PI / 2;             // ejes laterales (izq/der)
      let d = Math.abs(ang - axis);
      if (d > Math.PI) d = 2 * Math.PI - d;
      if (d < SPREAD) {
        // caída cuadrática → punta afilada, no bulto
        const k = Math.pow(1 - d / SPREAD, 2) * Math.pow(band, 2);
        const L = 0.62 * k;
        v.x += SIN30 * s * L;                   // 30° hacia fuera
        v.y += COS30 * L;                       //  y hacia arriba
      }
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildHelm() {
  const g = new THREE.Group();

  const hull = mesh(hornedHullGeometry(), EMAT.obsidian);
  hull.position.y = 2.42;
  hull.scale.z = 0.94;
  g.add(hull);

  // Gorjal grueso
  g.add(limb([0, 2.08, 0], [0, 2.22, 0], 0.20, 0.26, EMAT.obsidianDark));

  // Ranura ocular dentada: recorte oscuro + lámina emisiva volcánica
  const recess = box(0.42, 0.11, 0.03, EMAT.obsidianDark, 0.01);
  recess.position.set(0, 2.45, 0.235);
  g.add(recess);

  const zig = new THREE.Shape();
  zig.moveTo(-0.17, 0.0);
  [[-0.12, 0.028], [-0.06, 0.012], [0.0, 0.03], [0.05, 0.01], [0.11, 0.026], [0.17, 0.008]]
    .forEach((p) => zig.lineTo(p[0], p[1]));
  zig.lineTo(0.17, -0.012);
  [[0.10, -0.03], [0.04, -0.014], [-0.03, -0.032], [-0.09, -0.012], [-0.14, -0.028]]
    .forEach((p) => zig.lineTo(p[0], p[1]));
  zig.closePath();
  const visor = new THREE.Mesh(new THREE.ShapeGeometry(zig), EMAT.visor);
  visor.name = 'visorRojo';
  visor.position.set(0, 2.45, 0.253);
  g.add(visor);

  // Luz propia del visor (la IA la intensifica al impactar)
  const glow = new THREE.PointLight(0xff2211, 1.4, 3.2, 2);
  glow.name = 'brilloVisor';
  glow.position.set(0, 2.45, 0.6);
  g.add(glow);

  return g;
}

// ---------- Torso: placas dentadas asimétricas solapadas hacia abajo ----------
function buildTorso() {
  const g = new THREE.Group();

  const core = limb([0, 1.28, 0], [0, 2.12, 0], 0.27, 0.35, EMAT.obsidianDark);
  core.scale.z = 0.8;
  g.add(core);

  // Placa pectoral superior (grande, sesgada a la izquierda)
  const p1 = jaggedPlate([
    [-0.34, 0.20], [-0.38, 0.02], [-0.22, -0.08], [-0.05, -0.02],
    [0.10, -0.10], [0.30, 0.00], [0.34, 0.16], [0.15, 0.26], [-0.10, 0.24],
  ], 0.09, EMAT.obsidian);
  p1.position.set(0, 1.88, 0.20);
  p1.rotation.x = -0.12;
  g.add(p1);

  // Placa media (sesgada a la derecha, solapa bajo la primera)
  const p2 = jaggedPlate([
    [-0.28, 0.10], [-0.16, -0.10], [0.02, -0.04], [0.18, -0.14],
    [0.30, 0.02], [0.20, 0.14], [0.0, 0.08],
  ], 0.08, EMAT.obsidian);
  p2.position.set(0.02, 1.63, 0.22);
  p2.rotation.x = -0.05;
  g.add(p2);

  // Placa ventral
  const p3 = jaggedPlate([
    [-0.20, 0.08], [-0.10, -0.10], [0.06, -0.05], [0.16, -0.12], [0.22, 0.06], [0.0, 0.12],
  ], 0.07, EMAT.obsidianDark);
  p3.position.set(-0.02, 1.43, 0.20);
  g.add(p3);

  // Grieta de magma asomando entre placas
  const crack = jaggedPlate([
    [-0.05, 0.012], [0.02, 0.03], [0.09, 0.008], [0.15, 0.024],
    [0.15, -0.01], [0.07, -0.026], [-0.01, -0.008],
  ], 0.02, EMAT.crack);
  crack.position.set(0.04, 1.755, 0.245);
  g.add(crack);

  // Espaldar + púas dorsales inclinadas hacia atrás
  const back = box(0.5, 0.55, 0.14, EMAT.obsidian, 0.03);
  back.position.set(0, 1.8, -0.2);
  g.add(back);
  for (let i = 0; i < 3; i++) {
    const s = spike(0.045, 0.3 - i * 0.06, EMAT.obsidianDark);
    s.position.set(0, 2.06 - i * 0.22, -0.3);
    s.rotation.x = -0.9;
    g.add(s);
  }

  // Faldón de tasetas dentadas alrededor de la cadera
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26;
    const t = jaggedPlate([
      [-0.12, 0], [-0.08, -0.30], [0.0, -0.40], [0.08, -0.28], [0.12, 0],
    ], 0.05, i % 2 ? EMAT.obsidian : EMAT.obsidianDark);
    t.position.set(Math.sin(a) * 0.33, 1.34, Math.cos(a) * 0.27);
    t.rotation.y = a;
    t.rotation.x = 0.22;
    g.add(t);
  }

  return g;
}

// ---------- Hombreras asimétricas (la izquierda, monstruosa) ----------
function buildPauldron(s) {
  const g = new THREE.Group();
  const big = s < 0; // lado izquierdo
  const x = s * 0.48;

  const layers = big ? 3 : 2;
  for (let i = 0; i < layers; i++) {
    const p = jaggedPlate([
      [-0.20, 0.06], [-0.24, -0.08], [-0.10, -0.16], [0.06, -0.12],
      [0.20, -0.18], [0.24, -0.02], [0.12, 0.10], [-0.04, 0.08],
    ], 0.07, i % 2 ? EMAT.obsidianDark : EMAT.obsidian);
    p.scale.setScalar(big ? 1.25 - i * 0.18 : 1.0 - i * 0.2);
    p.position.set(x + s * i * 0.07, 2.06 - i * 0.11, 0);
    p.rotation.z = -s * (0.5 + i * 0.16);
    p.rotation.y = s * Math.PI / 2;
    g.add(p);
  }

  const nSpikes = big ? 2 : 1;
  for (let i = 0; i < nSpikes; i++) {
    const sp = spike(0.05, big ? 0.34 - i * 0.1 : 0.2);
    sp.position.set(x + s * (0.06 + i * 0.09), 2.16 - i * 0.05, 0);
    sp.rotation.z = -s * (0.55 + i * 0.25);
    g.add(sp);
  }
  return g;
}

// ---------- Extremidades ----------
function buildLeg(s) {
  const g = new THREE.Group();
  const x = s * 0.24;

  const boot = box(0.2, 0.14, 0.42, EMAT.obsidian, 0.03);
  boot.position.set(x, 0.08, 0.06);
  g.add(boot);
  const claw = spike(0.05, 0.16, EMAT.obsidianDark);
  claw.position.set(x, 0.07, 0.3);
  claw.rotation.x = Math.PI / 2.3;
  g.add(claw);

  g.add(limb([x, 0.14, 0], [x + s * 0.01, 0.72, -0.01], 0.09, 0.12, EMAT.obsidianDark));
  const shin = jaggedPlate([
    [-0.07, 0.24], [-0.09, -0.18], [0.0, -0.26], [0.09, -0.16], [0.07, 0.22], [0.0, 0.3],
  ], 0.05, EMAT.obsidian);
  shin.position.set(x, 0.45, 0.11);
  g.add(shin);

  const knee = mesh(new THREE.SphereGeometry(0.1, 20, 14), EMAT.obsidian);
  knee.position.set(x, 0.76, 0.02);
  g.add(knee);
  if (s < 0) { // púa de rodilla solo en la izquierda: asimetría
    const ks = spike(0.04, 0.18);
    ks.position.set(x, 0.78, 0.12);
    ks.rotation.x = Math.PI / 2.6;
    g.add(ks);
  }

  g.add(limb([x, 0.8, 0.01], [x - s * 0.03, 1.24, 0], 0.12, 0.145, EMAT.obsidianDark));
  return g;
}

function buildArm(s, hand) {
  const g = new THREE.Group();
  const shoulder = [s * 0.46, 2.0, 0.02];
  const elbow = [s * 0.58, 1.66, 0.1];

  g.add(limb(shoulder, elbow, 0.095, 0.075, EMAT.obsidianDark));
  const couter = mesh(new THREE.SphereGeometry(0.085, 20, 14), EMAT.obsidian);
  couter.position.set(...elbow);
  g.add(couter);
  g.add(limb(elbow, hand, 0.07, 0.06, EMAT.obsidian));

  const gaunt = box(0.13, 0.16, 0.15, EMAT.obsidian, 0.03);
  gaunt.position.set(...hand);
  g.add(gaunt);
  // garras
  for (let i = -1; i <= 1; i++) {
    const c = spike(0.022, 0.11, EMAT.obsidianDark);
    c.position.set(hand[0] + i * 0.04, hand[1] - 0.1, hand[2] + 0.04);
    c.rotation.x = Math.PI;
    g.add(c);
  }
  return g;
}

// ---------- Hacha de ejecución ----------
function buildAxe() {
  const g = new THREE.Group();

  // Mango largo con contrapeso de púa
  g.add(limb([0, 0.5, 0], [0.02, 2.4, -0.05], 0.035, 0.03, EMAT.iron, 10));
  const counter = spike(0.05, 0.18, EMAT.iron);
  counter.position.set(0, 0.44, 0.005);
  counter.rotation.x = Math.PI;
  g.add(counter);

  // Cabeza: media luna dentada brutalista (extrusión, cara hacia delante)
  const bladePts = [
    [0.02, 0.52], [0.30, 0.50], [0.36, 0.40], [0.48, 0.36], [0.50, 0.22],
    [0.58, 0.12], [0.52, -0.02], [0.56, -0.16], [0.40, -0.24], [0.36, -0.36],
    [0.14, -0.34], [0.06, -0.12], [0.02, 0.0],
  ];
  const head = new THREE.Group();
  const blade = jaggedPlate(bladePts, 0.05, EMAT.iron);
  head.add(blade);

  // Canal de calor: banda dentada emisiva siguiendo el filo exterior
  const outer = bladePts.slice(1, 10); // tramo del filo
  const inner = outer.map(([px, py]) => [0.06 + (px - 0.06) * 0.82, py * 0.82]).reverse();
  const channel = jaggedPlate(outer.concat(inner), 0.062, EMAT.heat);
  channel.name = 'filoCalor';
  head.add(channel);

  // Púa trasera
  const backSpike = jaggedPlate([[-0.02, 0.1], [-0.3, 0.02], [-0.02, -0.08]], 0.045, EMAT.iron);
  head.add(backSpike);

  head.position.set(0.015, 1.98, -0.04);
  head.rotation.y = -Math.PI / 2; // el filo mira hacia delante (+z)
  g.add(head);

  return g;
}

// ---------- Ensamblaje ----------
export function createExecutor() {
  const enemy = new THREE.Group();
  enemy.name = 'EjecutorDelVacio';

  // Piernas con pivote en la cadera (zancada pesada procedural)
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.name = `piernaEjec_${s}`;
    pivot.position.set(s * 0.24, 1.18, 0);
    const inner = buildLeg(s);
    inner.position.set(-s * 0.24, -1.18, 0);
    pivot.add(inner);
    enemy.add(pivot);
  }
  enemy.add(buildTorso());
  enemy.add(buildPauldron(1), buildPauldron(-1));
  enemy.add(buildHelm());
  enemy.add(buildArm(-1, [-0.5, 1.3, 0.28]));   // brazo izquierdo: garra libre
  enemy.add(buildArm(1, [0.56, 1.36, 0.28]));   // brazo derecho: empuña el hacha

  const axe = buildAxe();
  axe.position.set(0.56, 0, 0.26);
  enemy.add(axe);

  // Referencias para el sistema de IA (flash de visor, pulso del filo)
  enemy.userData.visorMat = EMAT.visor;
  enemy.userData.heatMat = EMAT.heat;
  enemy.userData.glowLight = enemy.getObjectByName('brilloVisor');

  return enemy;
}

// Zancada pesada: sincronizada con el bob de pisada del EnemySystem (t * 4.6)
export function animateExecutorWalk(executor, t, moving = 1) {
  const R = executor.getObjectByName('piernaEjec_1');
  const L = executor.getObjectByName('piernaEjec_-1');
  const swing = Math.sin(t * 4.6) * 0.5 * moving;
  if (R) R.rotation.x = swing;
  if (L) L.rotation.x = -swing;
  // balanceo de masa: el peso cae sobre cada pisada
  executor.rotation.z = Math.sin(t * 2.3) * 0.035 * moving;
}

// Pose del Ground Slam: recoge las piernas al elevarse, las clava al caer
export function animateExecutorSlam(executor, phase, k = 1) {
  const R = executor.getObjectByName('piernaEjec_1');
  const L = executor.getObjectByName('piernaEjec_-1');
  const w = Math.min(k, 1);
  if (phase === 'windup') {
    if (R) R.rotation.x += (0.55 - R.rotation.x) * w;
    if (L) L.rotation.x += (0.48 - L.rotation.x) * w;
  } else {
    if (R) R.rotation.x = -0.28;
    if (L) L.rotation.x = 0.32;
  }
  executor.rotation.z = 0;
}
