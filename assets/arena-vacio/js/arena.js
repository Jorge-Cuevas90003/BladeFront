// Arena del Vacío — geometría de la arena, reutilizable en el juego.
// createArena() devuelve un THREE.Group autocontenido con:
//   anillo de losas de piedra, disco central con surcos, banda de runas
//   doradas (emissive), borde perimetral en ruinas, obeliscos rotos y el
//   pedestal de roca invertido que se pierde en la niebla.
// group.userData.runeMaterial queda expuesto para pulsar el brillo en el bucle.
import * as THREE from 'three';

export const ARENA_RADIUS = 11.2;

// ---------- RNG determinista (misma arena en cada carga) ----------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Textura de runas: glifos angulares dorados sobre negro ----------
function makeRuneTexture() {
  const w = 2048, h = 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  const rng = mulberry32(1337);
  const gold = '#ffb638';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // líneas-guía superior e inferior (canal grabado)
  ctx.strokeStyle = gold;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 24); ctx.lineTo(w, 24); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, h - 24); ctx.lineTo(w, h - 24); ctx.stroke();
  ctx.globalAlpha = 1;

  const glyphs = 26;
  const cell = w / glyphs;
  ctx.shadowColor = gold;
  ctx.shadowBlur = 14;
  for (let g = 0; g < glyphs; g++) {
    const cx = g * cell + cell / 2;
    const gw = cell * 0.3, gh = h * 0.3;
    const cy = h / 2;

    // trazo vertical de anclaje (estructura de alfabeto)
    ctx.strokeStyle = gold;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx + (rng() - 0.5) * 8, cy - gh);
    ctx.lineTo(cx + (rng() - 0.5) * 8, cy + gh);
    ctx.stroke();

    // polilínea angular pseudo-rúnica
    const pts = 4 + Math.floor(rng() * 3);
    ctx.lineWidth = 7;
    ctx.beginPath();
    for (let i = 0; i < pts; i++) {
      const px = cx + (rng() - 0.5) * gw * 2;
      const py = cy + (rng() - 0.5) * gh * 2;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // separador entre glifos: rombo pequeño
    const dx = g * cell;
    ctx.beginPath();
    ctx.moveTo(dx, cy - 8); ctx.lineTo(dx + 8, cy);
    ctx.lineTo(dx, cy + 8); ctx.lineTo(dx - 8, cy);
    ctx.closePath();
    ctx.fillStyle = gold;
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ---------- Textura del disco central: surcos concéntricos en piedra ----------
function makeGrooveTexture() {
  const s = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#17191d';
  ctx.fillRect(0, 0, s, s);

  const rng = mulberry32(4242);

  // moteado de piedra
  for (let i = 0; i < 3200; i++) {
    const v = rng();
    ctx.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.035)';
    ctx.fillRect(rng() * s, rng() * s, 1 + rng() * 2, 1 + rng() * 2);
  }

  // surcos concéntricos
  const cx = s / 2;
  for (const f of [0.18, 0.32, 0.46, 0.6, 0.74, 0.88]) {
    const r = (s / 2) * f;
    ctx.strokeStyle = 'rgba(4,5,7,0.85)';
    ctx.lineWidth = 11;
    ctx.beginPath(); ctx.arc(cx, cx, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cx, r + 8, 0, Math.PI * 2); ctx.stroke();
  }

  // oscurecer el borde
  const grad = ctx.createRadialGradient(cx, cx, s * 0.3, cx, cx, s * 0.5);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// UV polar continuo para un RingGeometry (u avanza con el segmento, sin costura)
function polarizeRingUVs(geo, thetaSegments, repeats) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const col = i % (thetaSegments + 1);
    const row = Math.floor(i / (thetaSegments + 1));
    uv.setXY(i, (col / thetaSegments) * repeats, row);
  }
  uv.needsUpdate = true;
}

// ---------- Arena completa ----------
export function createArena() {
  const group = new THREE.Group();
  group.name = 'arena';
  const rng = mulberry32(9001);

  const stoneSlab = new THREE.MeshStandardMaterial({ color: 0x1e2126, roughness: 0.93, metalness: 0.04 });
  const stoneBase = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95, metalness: 0.03 });
  const stoneWall = new THREE.MeshStandardMaterial({ color: 0x191c21, roughness: 0.9, metalness: 0.05 });
  const stoneRock = new THREE.MeshStandardMaterial({ color: 0x101215, roughness: 1.0, metalness: 0.0, flatShading: true });

  // --- plataforma base (la "isla") ---
  const base = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS * 0.97, 0.6, 96), stoneBase);
  base.position.y = -0.3; // cara superior en y = 0
  base.receiveShadow = true;
  group.add(base);

  // --- anillo de losas (3 filas concéntricas, InstancedMesh) ---
  const rows = [
    { r: 4.85, n: 26, w: 1.75 },
    { r: 6.75, n: 34, w: 1.75 },
    { r: 8.65, n: 42, w: 1.75 },
  ];
  const slabCount = rows.reduce((a, r) => a + r.n, 0);
  const slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stoneSlab, slabCount);
  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  let idx = 0;
  for (const row of rows) {
    const offset = rng() * Math.PI * 2;
    for (let i = 0; i < row.n; i++) {
      const a = (i / row.n) * Math.PI * 2 + offset;
      const tang = ((Math.PI * 2 * row.r) / row.n) * 0.94;
      pos.set(Math.cos(a) * row.r, 0.2 + (rng() - 0.5) * 0.07, Math.sin(a) * row.r);
      eul.set((rng() - 0.5) * 0.025, -a + (rng() - 0.5) * 0.03, (rng() - 0.5) * 0.025);
      scl.set(row.w, 0.4, tang);
      m4.compose(pos, quat.setFromEuler(eul), scl);
      slabs.setMatrixAt(idx, m4);
      col.set(0x1e2126).offsetHSL(0, 0, (rng() - 0.5) * 0.03);
      slabs.setColorAt(idx, col);
      idx++;
    }
  }
  slabs.castShadow = slabs.receiveShadow = true;
  group.add(slabs);

  // --- disco central con surcos concéntricos ---
  const discSide = new THREE.MeshStandardMaterial({ color: 0x191c20, roughness: 0.92, metalness: 0.04 });
  const discTop = new THREE.MeshStandardMaterial({ map: makeGrooveTexture(), roughness: 0.9, metalness: 0.05 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.18, 0.45, 64), [discSide, discTop, discSide]);
  disc.position.y = 0.225;
  disc.castShadow = disc.receiveShadow = true;
  group.add(disc);

  // --- círculos emissivos finos sobre el disco (foco ritual) ---
  const emblemMat = new THREE.MeshStandardMaterial({
    color: 0x050505, emissive: 0xffb638, emissiveIntensity: 1.5,
    roughness: 0.6, metalness: 0.2,
  });
  for (const [ri, ro] of [[1.25, 1.42], [2.55, 2.65]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(ri, ro, 96), emblemMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.465;
    group.add(ring);
  }

  // --- banda anular de runas doradas (emissiveMap + bloom) ---
  const runeTex = makeRuneTexture();
  const runeGeo = new THREE.RingGeometry(9.35, 10.75, 256, 1);
  polarizeRingUVs(runeGeo, 256, 3); // 3 vueltas de textura → 78 glifos
  const runeMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a0a,
    emissive: 0xffb638,
    emissiveMap: runeTex,
    emissiveIntensity: 3.0,
    roughness: 0.55,
    metalness: 0.25,
  });
  const runes = new THREE.Mesh(runeGeo, runeMat);
  runes.rotation.x = -Math.PI / 2;
  runes.position.y = 0.02;
  group.add(runes);

  // --- banda vertical de runas en el canto exterior de la isla ---
  const rimGeo = new THREE.CylinderGeometry(ARENA_RADIUS + 0.02, ARENA_RADIUS + 0.02, 0.42, 128, 1, true);
  const rimUV = rimGeo.attributes.uv;
  for (let i = 0; i < rimUV.count; i++) rimUV.setX(i, rimUV.getX(i) * 3);
  rimUV.needsUpdate = true;
  const rimBand = new THREE.Mesh(rimGeo, runeMat);
  rimBand.position.y = -0.21;
  group.add(rimBand);

  // --- borde perimetral elevado, parcialmente en ruinas ---
  const wallMax = 52;
  const wall = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stoneWall, wallMax);
  let widx = 0;
  for (let i = 0; i < wallMax; i++) {
    if (rng() < 0.16) continue; // hueco: almena caída
    const a = (i / wallMax) * Math.PI * 2;
    const r = ARENA_RADIUS - 0.25;
    const hgt = 0.5 + rng() * 0.55;
    const tang = ((Math.PI * 2 * r) / wallMax) * 0.9;
    pos.set(Math.cos(a) * r, hgt / 2 - 0.05, Math.sin(a) * r);
    eul.set((rng() - 0.5) * 0.05, -a + (rng() - 0.5) * 0.04, (rng() - 0.5) * 0.06);
    scl.set(0.8, hgt, tang);
    m4.compose(pos, quat.setFromEuler(eul), scl);
    wall.setMatrixAt(widx, m4);
    col.set(0x191c21).offsetHSL(0, 0, (rng() - 0.5) * 0.03);
    wall.setColorAt(widx, col);
    widx++;
  }
  wall.count = widx;
  wall.castShadow = wall.receiveShadow = true;
  group.add(wall);

  // --- obeliscos rotos sobre el borde ---
  const obeMax = 6;
  const obelisks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stoneWall, obeMax);
  for (let i = 0; i < obeMax; i++) {
    const a = (i / obeMax) * Math.PI * 2 + 0.35 + (rng() - 0.5) * 0.25;
    const r = ARENA_RADIUS - 0.85;
    const hgt = 2.6 + rng() * 2.2;
    pos.set(Math.cos(a) * r, hgt / 2 + 0.4, Math.sin(a) * r);
    eul.set((rng() - 0.5) * 0.06, -a, (rng() - 0.5) * 0.08);
    scl.set(1.0, hgt, 1.0);
    m4.compose(pos, quat.setFromEuler(eul), scl);
    obelisks.setMatrixAt(i, m4);
  }
  obelisks.castShadow = obelisks.receiveShadow = true;
  group.add(obelisks);

  // --- pedestal de roca invertido (isla flotante) ---
  const coneGeo = new THREE.CylinderGeometry(ARENA_RADIUS, 1.4, 17, 48, 6, true);
  const cp = coneGeo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < cp.count; i++) {
    v.fromBufferAttribute(cp, i);
    const r = Math.hypot(v.x, v.z);
    if (r > 0.01) {
      const a = Math.atan2(v.z, v.x);
      const noise =
        Math.sin(a * 7 + v.y * 0.8) * 0.5 +
        Math.sin(a * 13 - v.y * 1.7) * 0.3 +
        Math.sin(a * 3 + 2.1) * 0.2;
      const weight = (8.5 - v.y) / 17; // sin deformar la unión con la base
      const k = 1 + noise * 0.09 * weight;
      cp.setX(i, v.x * k);
      cp.setZ(i, v.z * k);
    }
  }
  coneGeo.computeVertexNormals();
  const cone = new THREE.Mesh(coneGeo, stoneRock);
  cone.position.y = -0.6 - 8.5;
  group.add(cone);

  group.userData.runeMaterial = runeMat;
  group.userData.emblemMaterial = emblemMat;
  return group;
}
