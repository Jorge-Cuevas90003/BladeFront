// Caballero Templario Estelar — modelo procedural en three.js
// createKnight() devuelve un THREE.Group con el caballero completo (pies en y=0).
// Pensado para reutilizarse tal cual dentro del juego.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ---------- Materiales ----------
export const MAT = {
  steel:     new THREE.MeshPhysicalMaterial({ color: 0x262a30, metalness: 0.90, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.25 }),
  steelDark: new THREE.MeshPhysicalMaterial({ color: 0x17191d, metalness: 0.88, roughness: 0.46, clearcoat: 0.35, clearcoatRoughness: 0.30 }),
  brass:     new THREE.MeshStandardMaterial({ color: 0x96742f, metalness: 1.00, roughness: 0.38 }),
  brassDark: new THREE.MeshStandardMaterial({ color: 0x6e5322, metalness: 1.00, roughness: 0.55 }),
  cloth:     new THREE.MeshStandardMaterial({ color: 0x131118, metalness: 0.00, roughness: 0.95 }),
  leather:   new THREE.MeshStandardMaterial({ color: 0x221a12, metalness: 0.10, roughness: 0.90 }),
  blade:     new THREE.MeshStandardMaterial({ color: 0x454c55, metalness: 1.00, roughness: 0.28 }),
  black:     new THREE.MeshStandardMaterial({ color: 0x050608, metalness: 0.20, roughness: 0.80 }),
  visor:     new THREE.MeshStandardMaterial({ color: 0x05070a, emissive: 0x49e6ff, emissiveIntensity: 3.5 }),
};
// Variantes de doble cara para casquetes y faldones abiertos
const steelShell     = MAT.steel.clone();     steelShell.side     = THREE.DoubleSide;
steelShell.roughness = 0.55; steelShell.clearcoat = 0.2;
const steelDarkShell = MAT.steelDark.clone(); steelDarkShell.side = THREE.DoubleSide;
steelDarkShell.roughness = 0.6; steelDarkShell.clearcoat = 0.15;
const clothShell     = MAT.cloth.clone();     clothShell.side     = THREE.DoubleSide;

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

// Cilindro colocado entre dos puntos (rFrom = radio en `from`, rTo = radio en `to`)
function limb(from, to, rFrom, rTo, mat, radial = 18) {
  const a = V3(...from), b = V3(...to);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const m = mesh(new THREE.CylinderGeometry(rTo, rFrom, len, radial), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(V3(0, 1, 0), dir.normalize());
  return m;
}

// Aro de latón (trim) horizontal
function ring(r, tube, mat = MAT.brass) {
  const m = mesh(new THREE.TorusGeometry(r, tube, 10, 40), mat);
  m.rotation.x = Math.PI / 2;
  return m;
}

function sphere(r, mat, wSeg = 24, hSeg = 16) {
  return mesh(new THREE.SphereGeometry(r, wSeg, hSeg), mat);
}

// Casquete (media esfera abierta) para hombreras
function shell(r, mat) {
  return mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
}

// Aro de armadura abierto (faldones), con ligera forma ovalada
function hoop(rTop, rBot, h, y, mat) {
  const m = mesh(new THREE.CylinderGeometry(rTop, rBot, h, 28, 1, true), mat);
  m.position.y = y;
  m.scale.z = 0.8;
  return m;
}

// ---------- Piezas ----------
function buildLeg(s) {
  const g = new THREE.Group();
  const x = s * 0.17;

  // Sabatón (bota) + puntera de latón
  const sab = box(0.15, 0.09, 0.32, MAT.steelDark, 0.03);
  sab.position.set(x, 0.055, 0.05);
  g.add(sab);
  const toe = box(0.13, 0.075, 0.10, MAT.brassDark, 0.03);
  toe.position.set(x, 0.05, 0.17);
  g.add(toe);

  // Greba (espinilla)
  g.add(limb([x, 0.09, 0], [x + s * 0.005, 0.52, -0.005], 0.06, 0.09, MAT.steel));
  const shin = box(0.09, 0.32, 0.05, MAT.steelDark, 0.02);
  shin.position.set(x, 0.32, 0.08);
  shin.rotation.x = 0.06;
  g.add(shin);
  const gTrim = ring(0.095, 0.009);
  gTrim.position.set(x + s * 0.005, 0.53, -0.005);
  g.add(gTrim);

  // Rodillera
  const knee = sphere(0.08, MAT.steel);
  knee.scale.y = 0.9;
  knee.position.set(x + s * 0.005, 0.575, 0.015);
  g.add(knee);

  // Quijote (muslo) + placa frontal
  g.add(limb([x + s * 0.005, 0.60, 0.01], [x - s * 0.015, 0.97, 0], 0.095, 0.115, MAT.steelDark));
  const thigh = box(0.13, 0.28, 0.06, MAT.steel, 0.025);
  thigh.position.set(x - s * 0.005, 0.80, 0.095);
  thigh.rotation.x = -0.06;
  g.add(thigh);

  return g;
}

function buildTorso() {
  const g = new THREE.Group();

  // Núcleo del torso
  const core = limb([0, 1.16, 0], [0, 1.64, 0], 0.21, 0.265, MAT.steelDark);
  core.scale.z = 0.78;
  g.add(core);

  // Peto (pecho) y placas abdominales
  const chest = box(0.44, 0.34, 0.12, MAT.steel, 0.04);
  chest.position.set(0, 1.47, 0.17);
  chest.rotation.x = -0.10;
  g.add(chest);
  const ab1 = box(0.36, 0.14, 0.10, MAT.steelDark, 0.03);
  ab1.position.set(0, 1.24, 0.17);
  g.add(ab1);
  const ab2 = box(0.32, 0.12, 0.09, MAT.steel, 0.03);
  ab2.position.set(0, 1.13, 0.16);
  g.add(ab2);

  // Espaldar
  const back = box(0.42, 0.40, 0.10, MAT.steelDark, 0.04);
  back.position.set(0, 1.44, -0.15);
  g.add(back);

  // Franja central de latón (heráldica templaria)
  const strip = box(0.03, 0.30, 0.015, MAT.brass, 0.006);
  strip.position.set(0, 1.46, 0.236);
  strip.rotation.x = -0.10;
  g.add(strip);

  // Trim de latón bajo el peto
  const trim = ring(0.24, 0.012);
  trim.position.y = 1.19;
  trim.scale.set(1, 0.8, 1); // tras rotar, el eje Z local del toro es Y del mundo
  g.add(trim);

  // Gorjal (cuello)
  const gorget = limb([0, 1.62, 0], [0, 1.75, 0], 0.155, 0.125, MAT.steel);
  gorget.scale.z = 0.85;
  g.add(gorget);
  const collar = ring(0.128, 0.010);
  collar.position.y = 1.745;
  collar.scale.set(1, 0.85, 1);
  g.add(collar);

  // Faldones (3 aros escalonados) + falda de tela interior
  g.add(hoop(0.24, 0.30, 0.12, 1.10, steelShell));
  g.add(hoop(0.28, 0.34, 0.12, 1.01, steelDarkShell));
  g.add(hoop(0.32, 0.385, 0.12, 0.92, steelShell));
  g.add(hoop(0.20, 0.26, 0.38, 0.93, clothShell));
  const skirtTrim = ring(0.385, 0.010);
  skirtTrim.position.y = 0.865;
  skirtTrim.scale.set(1, 0.8, 1);
  g.add(skirtTrim);

  return g;
}

function buildPauldron(s) {
  const g = new THREE.Group();
  const layers = [
    { r: 0.170, x: 0.34, y: 1.60, tilt: 0.40 },
    { r: 0.140, x: 0.40, y: 1.52, tilt: 0.70 },
    { r: 0.115, x: 0.44, y: 1.44, tilt: 0.90 },
  ];
  layers.forEach((L, i) => {
    const p = shell(L.r, i % 2 ? steelDarkShell : steelShell);
    p.position.set(s * L.x, L.y, 0);
    p.rotation.z = -s * L.tilt;
    g.add(p);
  });
  const trim = ring(0.165, 0.009);
  trim.position.set(s * 0.34, 1.585, 0);
  trim.rotation.x = Math.PI / 2;
  trim.rotation.y = -s * 0.40;
  g.add(trim);
  return g;
}

function buildArm(s, hand) {
  const g = new THREE.Group();
  const shoulder = [s * 0.34, 1.56, 0.02];
  const elbow = [s * 0.37, 1.31, 0.20];

  // Brazo superior
  g.add(limb(shoulder, elbow, 0.075, 0.060, MAT.steel));

  // Codal
  const couter = sphere(0.07, MAT.steelDark);
  couter.position.set(...elbow);
  g.add(couter);

  // Antebrazo + brazal (capa exterior)
  g.add(limb(elbow, hand, 0.055, 0.047, MAT.steelDark));
  const eV = V3(...elbow), hV = V3(...hand);
  const vFrom = eV.clone().lerp(hV, 0.15), vTo = eV.clone().lerp(hV, 0.78);
  g.add(limb(vFrom.toArray(), vTo.toArray(), 0.066, 0.056, MAT.steel));
  const cuff = mesh(new THREE.TorusGeometry(0.058, 0.008, 10, 30), MAT.brass);
  cuff.position.copy(vTo);
  cuff.quaternion.setFromUnitVectors(V3(0, 0, 1), hV.clone().sub(eV).normalize());
  g.add(cuff);

  // Guantelete + nudillos de latón
  const gaunt = box(0.10, 0.13, 0.12, MAT.steel, 0.025);
  gaunt.position.set(...hand);
  g.add(gaunt);
  const knuckles = box(0.10, 0.03, 0.02, MAT.brassDark, 0.008);
  knuckles.position.set(hand[0], hand[1] + 0.03, hand[2] + 0.06);
  g.add(knuckles);

  return g;
}

function buildHelm() {
  const g = new THREE.Group();

  // Cuerpo del yelmo (Great Helm moderno)
  const body = limb([0, 1.76, 0], [0, 2.06, 0], 0.145, 0.138, MAT.steel, 28);
  body.scale.z = 0.93;
  g.add(body);

  // Aros de latón: base y corona
  const base = ring(0.149, 0.010);
  base.position.y = 1.78;
  base.scale.set(1, 0.93, 1);
  g.add(base);
  const crown = ring(0.140, 0.008, MAT.brassDark);
  crown.position.y = 2.045;
  crown.scale.set(1, 0.93, 1);
  g.add(crown);

  // Placa facial elevada
  const face = box(0.16, 0.30, 0.05, MAT.steelDark, 0.02);
  face.position.set(0, 1.905, 0.125);
  g.add(face);

  // Ranura oscura + visor láser vertical (cian)
  const slot = box(0.045, 0.235, 0.02, MAT.black, 0.008);
  slot.position.set(0, 1.905, 0.142);
  g.add(slot);
  const visor = box(0.012, 0.215, 0.012, MAT.visor, 0.004);
  visor.position.set(0, 1.905, 0.152);
  g.add(visor);

  // Remaches de latón
  for (const [rx, ry] of [[-0.06, 1.80], [0.06, 1.80], [-0.06, 2.00], [0.06, 2.00]]) {
    const rivet = sphere(0.008, MAT.brass, 10, 8);
    rivet.position.set(rx, ry, 0.148);
    g.add(rivet);
  }

  // Luz puntual del visor: baña la armadura con un resplandor cian sutil
  const glow = new THREE.PointLight(0x49e6ff, 0.6, 1.6, 2);
  glow.position.set(0, 1.9, 0.45);
  g.add(glow);

  return g;
}

function buildSword() {
  const g = new THREE.Group();

  // Hoja: sección de diamante que se afila hacia la punta (apoyada en el suelo)
  const blade = mesh(new THREE.CylinderGeometry(0.055, 0.004, 1.10, 4, 1), MAT.blade);
  blade.position.y = 0.59;
  blade.scale.z = 0.30;
  g.add(blade);
  const rib = box(0.012, 0.90, 0.026, MAT.steelDark, 0.005);
  rib.position.y = 0.66;
  g.add(rib);

  // Ricasso + guarda pesada de latón con aletas
  const ricasso = box(0.05, 0.09, 0.03, MAT.steel, 0.01);
  ricasso.position.y = 1.10;
  g.add(ricasso);
  const guard = box(0.44, 0.045, 0.06, MAT.brass, 0.015);
  guard.position.y = 1.16;
  g.add(guard);
  for (const s of [-1, 1]) {
    const fin = box(0.09, 0.03, 0.05, MAT.steelDark, 0.01);
    fin.position.set(s * 0.225, 1.135, 0);
    fin.rotation.z = -s * 0.55;
    g.add(fin);
  }

  // Empuñadura + pomo con núcleo de energía
  g.add(limb([0, 1.18, 0], [0, 1.44, 0], 0.021, 0.021, MAT.leather, 12));
  const pommel = sphere(0.042, MAT.brass);
  pommel.position.y = 1.47;
  g.add(pommel);
  const core = sphere(0.015, MAT.visor, 12, 8);
  core.position.y = 1.505;
  g.add(core);

  g.position.z = 0.42;
  return g;
}

function buildCape() {
  const g = new THREE.Group();
  const cape = mesh(new THREE.CylinderGeometry(0.26, 0.60, 1.55, 24, 1, true, Math.PI / 2, Math.PI), clothShell);
  cape.name = 'capa';
  cape.position.set(0, 0.93, -0.02);
  cape.scale.z = 0.85;
  g.add(cape);
  return g;
}

function buildTabard() {
  const g = new THREE.Group();
  const panel = box(0.26, 0.62, 0.02, MAT.cloth, 0.008);
  panel.position.set(0, 0.86, 0.325);
  g.add(panel);
  // Cruz templaria en latón envejecido
  const crossV = box(0.05, 0.30, 0.01, MAT.brassDark, 0.004);
  crossV.position.set(0, 0.97, 0.338);
  g.add(crossV);
  const crossH = box(0.18, 0.05, 0.01, MAT.brassDark, 0.004);
  crossH.position.set(0, 1.04, 0.338);
  g.add(crossH);
  return g;
}

// ---------- Ensamblaje ----------
export function createKnight() {
  const knight = new THREE.Group();
  knight.name = 'CaballeroTemplarioEstelar';

  knight.add(buildCape());

  // Piernas con pivote en la cadera → ciclos de caminado procedurales
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.name = `pierna_${s}`;
    pivot.position.set(s * 0.16, 0.97, 0);
    const inner = buildLeg(s);
    inner.position.set(-s * 0.16, -0.97, 0);
    pivot.add(inner);
    knight.add(pivot);
  }

  // Tronco superior con pivote en la cintura: torso, hombreras, yelmo,
  // brazos Y espada se inclinan juntos (las manos nunca sueltan el pomo)
  const torsoPivot = new THREE.Group();
  torsoPivot.name = 'torsoSup';
  torsoPivot.position.set(0, 1.08, 0);
  const upper = new THREE.Group();
  upper.position.set(0, -1.08, 0);
  upper.add(buildTorso());
  upper.add(buildTabard());
  upper.add(buildPauldron(1), buildPauldron(-1));

  // Cabeza con pivote propio (mirar alrededor, estabilizar al correr)
  const headPivot = new THREE.Group();
  headPivot.name = 'cabeza';
  headPivot.position.set(0, 1.74, 0);
  const helm = buildHelm();
  helm.position.set(0, -1.74, 0);
  headPivot.add(helm);
  upper.add(headPivot);

  // Manos apiladas sobre la empuñadura (pose clásica de concept art)
  upper.add(buildArm(1, [0.05, 1.36, 0.40]));
  upper.add(buildArm(-1, [-0.05, 1.25, 0.40]));

  // Espada con pivote en la empuñadura (al correr, la punta va atrás)
  const swordPivot = new THREE.Group();
  swordPivot.name = 'espada';
  swordPivot.position.set(0, 1.30, 0.42);
  const sword = buildSword();
  sword.position.set(0, -1.30, 0); // su offset z interno pasa al pivote
  swordPivot.add(sword);
  upper.add(swordPivot);

  torsoPivot.add(upper);
  knight.add(torsoPivot);

  return knight;
}
