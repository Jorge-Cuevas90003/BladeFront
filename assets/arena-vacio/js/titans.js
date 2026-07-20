// Guerra de Titanes — dos entidades colosales luchando en cámara lenta en la
// niebla profunda del fondo. Siluetas flat-shaded low-poly con canales
// emisivos; optimizado para GPU (pocas mallas, sin sombras a 120u).
//
//   Arconte de Luz   — humanoide-mecha esbelto, negro cósmico, núcleo cian
//   Behemoth del Vacío — monstruo caótico asimétrico, hierro oscuro, grietas carmesí
//
// createTitans() → { group, update(dt, t), shake }.  El anfitrión añade group
// a la escena, llama update cada frame y lee `.shake` (0..1) para propagar la
// sacudida sísmica de cámara en el momento del choque.

import * as THREE from 'three';

// Emisión: la spec pedía 30 base / 120 en flash, pero con ACES + bloom eso
// funde el cuadro; calibrado a estos valores para que el destello siga
// "cegando" la niebla sin lavar los negros del resto de la escena.
const BASE_ARCHON = 11;
const BASE_BEHEMOTH = 9;
const FLASH = 55;

function makeRng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

// Cuerpo dentado: icosaedro con vértices desplazados hacia fuera (picos)
function jaggedBlob(radius, detail, spikeAmt, rng) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const d = radius * (1 + rng() * rng() * spikeAmt); // picos ocasionales largos
    pos.setXYZ(i, v.x * d, v.y * d, v.z * d);
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------- 1. Arconte de Luz (mecha-dios esbelto) ----------
function buildArchon() {
  const g = new THREE.Group();
  // negro cósmico, pero un pelo por encima del 0x020203 de la spec para que
  // las aristas del mecha atrapen algo de luz y la silueta LEA (si no, contra
  // el vacío negro solo se verían los canales cian flotando)
  const black = new THREE.MeshStandardMaterial({
    color: 0x0b0c11, roughness: 0.85, metalness: 0.25, flatShading: true,
  });
  const core = new THREE.MeshStandardMaterial({
    color: 0x001318, emissive: 0x2ce6ff, emissiveIntensity: BASE_ARCHON, flatShading: true,
  });

  // piernas largas y angulares
  for (const s of [-1, 1]) {
    const thigh = box(2.8, 15, 2.8, black);
    thigh.position.set(s * 2.8, 6, 0); thigh.rotation.z = -s * 0.06; g.add(thigh);
    const shin = box(2.3, 15, 2.3, black);
    shin.position.set(s * 3.4, -7.5, 0.6); g.add(shin);
    const foot = box(3, 1.8, 6, black);
    foot.position.set(s * 3.4, -14.5, 1.6); g.add(foot);
  }

  // pelvis + torso hexagonal alargado
  const pelvis = box(8, 4, 4.5, black); pelvis.position.y = 14; g.add(pelvis);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 5.2, 18, 6), black);
  torso.position.y = 25; torso.rotation.y = Math.PI / 6; g.add(torso);
  const collar = box(9, 2.4, 5, black); collar.position.y = 34; g.add(collar);

  // hombreras angulares + brazos largos
  for (const s of [-1, 1]) {
    const pauld = box(4.5, 4.5, 5.5, black);
    pauld.position.set(s * 6.4, 33.5, 0); pauld.rotation.z = s * 0.5; g.add(pauld);
    const arm = box(2.4, 17, 2.6, black);
    arm.position.set(s * 8.3, 24, 0.2); arm.rotation.z = s * 0.08; g.add(arm);
    const fore = box(2.1, 9, 2.2, black);
    fore.position.set(s * 8.9, 13, 1.2); g.add(fore);
    // canal de energía a lo largo del brazo
    const armCore = box(0.5, 15, 0.5, core);
    armCore.position.set(s * 9.5, 21, 1.4); g.add(armCore);
  }

  // cabeza: cresta angular (octaedro alargado)
  const head = new THREE.Mesh(new THREE.OctahedronGeometry(2.6, 0), black);
  head.scale.set(1, 2.1, 1); head.position.y = 39; g.add(head);

  // núcleo del pecho: rombo + canal vertical emisivo
  const chestCore = new THREE.Mesh(new THREE.OctahedronGeometry(1.8, 0), core);
  chestCore.scale.set(1, 1.7, 0.5); chestCore.position.set(0, 27, 2.6); g.add(chestCore);
  const spine = box(0.7, 16, 0.5, core);
  spine.position.set(0, 25, 2.4); g.add(spine);

  // halo emisivo tras la cabeza (dios-mecha)
  const halo = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.28, 8, 40), core);
  halo.position.set(0, 40, -1.5); g.add(halo);

  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  g.userData.core = core;
  return g;
}

// ---------- 2. Behemoth del Vacío (monstruo caótico) ----------
function buildBehemoth(rng) {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({
    color: 0x050406, roughness: 0.95, metalness: 0.1, flatShading: true,
  });
  const crack = new THREE.MeshStandardMaterial({
    color: 0x1a0602, emissive: 0xff3a10, emissiveIntensity: BASE_BEHEMOTH, flatShading: true,
  });

  // patas dentadas desiguales
  const legL = new THREE.Mesh(jaggedBlob(3.2, 1, 0.5, rng), iron);
  legL.scale.set(1, 4.2, 1); legL.position.set(-4.5, -6, 0); g.add(legL);
  const legR = new THREE.Mesh(jaggedBlob(3.8, 1, 0.6, rng), iron);
  legR.scale.set(1.1, 4.8, 1); legR.position.set(4, -8, 0.5); g.add(legR);

  // torso masivo e irregular
  const torso = new THREE.Mesh(jaggedBlob(9, 1, 0.7, rng), iron);
  torso.scale.set(1, 1.6, 0.9); torso.position.y = 18; g.add(torso);

  // hombros asimétricos (masas de distinto tamaño y altura)
  const shL = new THREE.Mesh(jaggedBlob(6.5, 1, 0.9, rng), iron);
  shL.position.set(-9, 30, 0); g.add(shL);
  const shR = new THREE.Mesh(jaggedBlob(4.8, 1, 1.1, rng), iron);
  shR.position.set(8, 34, -1); g.add(shR);

  // cabeza deforme, descentrada
  const head = new THREE.Mesh(jaggedBlob(3.4, 1, 0.8, rng), iron);
  head.position.set(-1.5, 40, 1); g.add(head);

  // púas caóticas (loop con orientación aleatoria)
  for (let i = 0; i < 14; i++) {
    const len = 4 + rng() * 9;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.8 + rng() * 0.7, len, 5), iron);
    const a = rng() * Math.PI * 2, up = 8 + rng() * 30, rad = 5 + rng() * 6;
    spike.position.set(Math.cos(a) * rad, up, Math.sin(a) * rad - 1);
    spike.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    g.add(spike);
  }

  // tendones/tentáculos colgantes
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.9, 8 + rng() * 6, 5), iron);
    const s = i < 3 ? -1 : 1;
    seg.position.set(s * (7 + rng() * 4), 22 - rng() * 8, rng() * 3);
    seg.rotation.z = s * (0.3 + rng() * 0.6);
    seg.rotation.x = (rng() - 0.5) * 0.8;
    g.add(seg);
  }

  // grietas emisivas erráticas por todo el cuerpo
  for (let i = 0; i < 12; i++) {
    const shard = box(0.4 + rng() * 0.4, 2 + rng() * 5, 0.4, crack);
    const a = rng() * Math.PI * 2, up = 8 + rng() * 30, rad = 6 + rng() * 4;
    shard.position.set(Math.cos(a) * rad, up, Math.sin(a) * rad + 2);
    shard.rotation.set(rng() * 1.2, a, (rng() - 0.5) * 1.5);
    g.add(shard);
  }
  // ojo/núcleo palpitante
  const eye = new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 0), crack);
  eye.position.set(-1.5, 40, 4); g.add(eye);

  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  g.userData.core = crack;
  return g;
}

// ---------- Ensamblaje + coreografía ----------
export function createTitans() {
  const group = new THREE.Group();
  group.name = 'GuerraDeTitanes';
  const rng = makeRng(31337);

  const archon = buildArchon();
  const behemoth = buildBehemoth(rng);

  // 120u a izquierda y derecha del horizonte, enfrentados hacia el centro
  const AX = -115, BX = 115, BASE_Y = -17, Z = -28;
  archon.position.set(AX, BASE_Y, Z);
  archon.rotation.y = Math.PI / 2;   // mira hacia +X (al centro / al Behemoth)
  behemoth.position.set(BX, BASE_Y, Z);
  behemoth.rotation.y = -Math.PI / 2; // mira hacia -X (al Arconte)
  group.add(archon, behemoth);

  const archonCore = archon.userData.core;
  const behemothCore = behemoth.userData.core;

  // estado de la coreografía
  let clashCd = 5;          // primer choque pronto
  let lungeActive = false;
  let lunge = 0;
  let flashed = false;
  let flashFrames = 0;
  let shake = 0;
  const LUNGE_DUR = 0.75, LUNGE_DIST = 11;

  const api = { group, shake: 0 };

  api.update = (dt, t) => {
    // --- Forcejeo: balanceo pesado desfasado (agarre por el dominio) ---
    archon.rotation.z = Math.sin(t * 0.4) * 0.08;
    behemoth.rotation.z = -Math.cos(t * 0.4) * 0.08;
    const swayX = Math.sin(t * 0.4) * 3.0;
    const bob = Math.sin(t * 0.8) * 0.6;

    // --- Golpe colosal: temporizador de choque intermitente ---
    clashCd -= dt;
    if (!lungeActive && clashCd <= 0) {
      lungeActive = true; lunge = 0; flashed = false;
      clashCd = 8 + rng() * 3;
    }
    let push = 0;
    if (lungeActive) {
      lunge += dt / LUNGE_DUR;
      push = Math.sin(Math.min(lunge, 1) * Math.PI) * LUNGE_DIST; // 0→pico→0
      // destello de energía en el pico matemático exacto del choque
      if (lunge >= 0.5 && !flashed) {
        flashed = true; flashFrames = 8; shake = 1;
      }
      if (lunge >= 1) { lungeActive = false; push = 0; }
    }

    archon.position.x = AX + swayX + push;   // embiste hacia el centro
    behemoth.position.x = BX - swayX - push; // embiste hacia el centro
    archon.position.y = BASE_Y + bob;
    behemoth.position.y = BASE_Y - bob;

    // --- Destello: pico cegador de emisión durante 8 frames ---
    const flashing = flashFrames > 0;
    if (flashing) flashFrames--;
    archonCore.emissiveIntensity = flashing ? FLASH : BASE_ARCHON + Math.sin(t * 1.3) * 2;
    // el monstruo late inestable
    behemothCore.emissiveIntensity = flashing
      ? FLASH
      : BASE_BEHEMOTH + (Math.sin(t * 5.1) * 0.5 + 0.5) * 4 + Math.sin(t * 13) * 1.5;

    // --- Sacudida sísmica: decae en ~0.4 s, el anfitrión la lee en .shake ---
    shake = Math.max(0, shake - dt / 0.4);
    api.shake = shake;
  };

  return api;
}
