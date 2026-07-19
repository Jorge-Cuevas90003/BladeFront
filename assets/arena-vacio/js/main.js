// Arena del Vacío — escena "environment concept art".
// Wide shot: arena circular de piedra flotando en un abismo negro, runas
// doradas, mar de niebla y monolitos góticos/brutalistas con rim cian.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createArena, ARENA_RADIUS } from './arena.js';

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.getElementById('app').appendChild(renderer.domElement);

// ---------- Escena ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030405);
scene.fog = new THREE.FogExp2(0x030405, 0.0058);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.2;

// ---------- Cámara ----------
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 11, 33);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 14;
controls.maxDistance = 60;
controls.maxPolarAngle = Math.PI * 0.485; // nunca por debajo del mar de niebla
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;

// ---------- Arena ----------
const arena = createArena();
scene.add(arena);
const runeMat = arena.userData.runeMaterial;
const emblemMat = arena.userData.emblemMaterial;

// ---------- Fondo: cilindro con leve resplandor de horizonte ----------
function makeHorizonTexture() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, '#020304');
  g.addColorStop(0.5, '#040506');
  g.addColorStop(0.56, '#060a0d');
  g.addColorStop(0.62, '#0a1218');
  g.addColorStop(0.72, '#04070a');
  g.addColorStop(1.0, '#010203');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const backdrop = new THREE.Mesh(
  new THREE.CylinderGeometry(150, 150, 170, 64, 1, true),
  new THREE.MeshBasicMaterial({ map: makeHorizonTexture(), side: THREE.BackSide, fog: false })
);
backdrop.position.y = 8;
scene.add(backdrop);

// ---------- Monolitos lejanos: catedrales góticas y losas brutalistas ----------
function lancetHole(cx, y0, wd, ht) {
  const p = new THREE.Path();
  p.moveTo(cx - wd / 2, y0);
  p.lineTo(cx - wd / 2, y0 + ht * 0.7);
  p.lineTo(cx, y0 + ht);
  p.lineTo(cx + wd / 2, y0 + ht * 0.7);
  p.lineTo(cx + wd / 2, y0);
  p.closePath();
  return p;
}

function cathedralGeometry(rng) {
  const s = new THREE.Shape();
  const tw = 0.22 + rng() * 0.06;      // ancho de torre
  const hL = 0.55 + rng() * 0.18;      // cuerpo torre izquierda
  const spL = hL + 0.3 + rng() * 0.25; // punta de aguja izquierda
  const hN = 0.38 + rng() * 0.1;       // muro de la nave
  const gN = hN + 0.22 + rng() * 0.14; // hastial apuntado
  const hR = 0.5 + rng() * 0.18;       // cuerpo torre derecha
  const broken = rng() < 0.55;         // torre derecha rota

  s.moveTo(-0.5, 0);
  s.lineTo(-0.5, hL);
  s.lineTo(-0.5 + tw * 0.5, spL);
  s.lineTo(-0.5 + tw, hL * 0.96);
  s.lineTo(-0.5 + tw, hN);
  s.lineTo(0, gN);
  s.lineTo(0.5 - tw, hN);
  s.lineTo(0.5 - tw, hR);
  if (broken) {
    s.lineTo(0.5 - tw * 0.68, hR + 0.06 + rng() * 0.05);
    s.lineTo(0.5 - tw * 0.33, hR - 0.06);
    s.lineTo(0.5, hR + 0.02);
  } else {
    s.lineTo(0.5 - tw * 0.5, hR + 0.3 + rng() * 0.2);
    s.lineTo(0.5, hR * 0.96);
  }
  s.lineTo(0.5, 0);
  s.closePath();

  // ventanales: el rim cian se cuela por los huecos
  s.holes.push(lancetHole(-0.14, 0.06, 0.055, 0.2));
  s.holes.push(lancetHole(0, 0.06, 0.055, 0.24));
  s.holes.push(lancetHole(0.14, 0.06, 0.055, 0.2));
  const rose = new THREE.Path();
  rose.absarc(0, gN * 0.62, 0.05, 0, Math.PI * 2, true);
  s.holes.push(rose);
  s.holes.push(lancetHole(-0.5 + tw / 2, hL * 0.35, tw * 0.28, 0.18));
  s.holes.push(lancetHole(0.5 - tw / 2, hR * 0.35, tw * 0.28, 0.16));

  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: false });
  geo.translate(0, 0, -0.07);
  return geo;
}

const monoMat = new THREE.MeshStandardMaterial({
  color: 0x0a0c10, roughness: 0.8, metalness: 0.3,
  emissive: 0x0c222c, emissiveIntensity: 0.09, // solo un susurro frío: la silueta la dibuja el rim
});
const monoRng = (() => {
  let seed = 777;
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();

const monoliths = new THREE.Group();
const MONO = 30;
const cathedralGeos = [cathedralGeometry(monoRng), cathedralGeometry(monoRng), cathedralGeometry(monoRng)];
const brutalGeo = new THREE.BoxGeometry(1, 1, 1);

for (let i = 0; i < MONO; i++) {
  const a = (i / MONO) * Math.PI * 2 + (monoRng() - 0.5) * 0.22;
  const d = 38 + monoRng() * 44;
  let mesh;
  if (monoRng() < 0.55) {
    // catedral en ruinas
    const H = 13 + monoRng() * 18;
    mesh = new THREE.Mesh(cathedralGeos[Math.floor(monoRng() * cathedralGeos.length)], monoMat);
    mesh.scale.set(H * 0.72, H, H * 0.72);
  } else {
    // megalito brutalista (2 volúmenes + aleta)
    mesh = new THREE.Group();
    const H = 13 + monoRng() * 18;
    const main = new THREE.Mesh(brutalGeo, monoMat);
    main.scale.set(H * 0.22, H, H * 0.14);
    main.position.y = H / 2;
    const side = new THREE.Mesh(brutalGeo, monoMat);
    side.scale.set(H * 0.13, H * 0.55, H * 0.2);
    side.position.set(H * 0.14, H * 0.32, 0);
    const fin = new THREE.Mesh(brutalGeo, monoMat);
    fin.scale.set(H * 0.02, H * 0.35, H * 0.05);
    fin.position.set(-H * 0.06, H * 1.12, 0);
    mesh.add(main, side, fin);
  }
  mesh.position.set(Math.cos(a) * d, -6 + monoRng() * 8, Math.sin(a) * d);
  mesh.rotation.y = -a - Math.PI / 2 + (monoRng() - 0.5) * 0.5;
  mesh.rotation.z = (monoRng() - 0.5) * 0.07;
  mesh.rotation.x = (monoRng() - 0.5) * 0.05;
  mesh.userData.float = {
    y0: mesh.position.y,
    amp: 0.35 + monoRng() * 0.55,
    ph: monoRng() * Math.PI * 2,
    sp: 0.05 + monoRng() * 0.07,
  };
  monoliths.add(mesh);
}
scene.add(monoliths);

// ---------- Mar de niebla bajo la arena ----------
function makeFogTexture() {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const main = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  main.addColorStop(0, 'rgba(200,212,222,0.55)');
  main.addColorStop(0.55, 'rgba(200,212,222,0.28)');
  main.addColorStop(1, 'rgba(200,212,222,0)');
  ctx.fillStyle = main;
  ctx.fillRect(0, 0, s, s);
  // vetas suaves
  for (let i = 0; i < 6; i++) {
    const x = s * (0.25 + Math.random() * 0.5);
    const y = s * (0.25 + Math.random() * 0.5);
    const r = s * (0.12 + Math.random() * 0.18);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(215,225,232,0.22)');
    g.addColorStop(1, 'rgba(215,225,232,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const fogSea = new THREE.Group();
const fogTex = makeFogTexture();
const fogPlanes = [];
for (let i = 0; i < 9; i++) {
  const size = 70 + i * 9;
  const mat = new THREE.MeshBasicMaterial({
    map: fogTex,
    color: 0x3d4a56,
    transparent: true,
    opacity: 0.34 - i * 0.026,
    depthWrite: false,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  plane.rotation.x = -Math.PI / 2;
  plane.rotation.z = Math.random() * Math.PI * 2;
  plane.position.y = -1.6 - i * 0.75;
  plane.userData.spin = (Math.random() - 0.5) * 0.02;
  plane.userData.drift = 0.15 + Math.random() * 0.3;
  plane.userData.ph = Math.random() * Math.PI * 2;
  fogPlanes.push(plane);
  fogSea.add(plane);
}
scene.add(fogSea);

// ---------- Iluminación ----------
// Cenital blanca-fría, dura, muy alta (el "foco de la arena")
const key = new THREE.SpotLight(0xe6f0ff, 7800, 170, 0.34, 0.55, 1.8);
key.position.set(0, 48, 6);
key.target.position.set(0, 0, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.03;
scene.add(key, key.target);

// Rim cian frío para las siluetas del fondo (eco del visor del caballero)
const rimA = new THREE.DirectionalLight(0x49e6ff, 14.0);
rimA.position.set(-45, 32, -75);
scene.add(rimA);
const rimB = new THREE.DirectionalLight(0x2f9dc0, 5.2);
rimB.position.set(65, 20, -50);
scene.add(rimB);

// Rebote dorado de las runas sobre la piedra
const goldGlow = new THREE.PointLight(0xffb638, 95, 28, 1.8);
goldGlow.position.set(0, 2.2, 0);
scene.add(goldGlow);

// Relleno ambiental mínimo
scene.add(new THREE.HemisphereLight(0x22303c, 0x04050a, 0.28));

// ---------- God-rays fake (conos aditivos bajo la cenital) ----------
const rayMat = new THREE.MeshBasicMaterial({
  color: 0xdfeaff, transparent: true, opacity: 0.013,
  blending: THREE.AdditiveBlending, depthWrite: false,
  side: THREE.DoubleSide, fog: false,
});
const ray1 = new THREE.Mesh(new THREE.ConeGeometry(10, 40, 48, 1, true), rayMat);
ray1.position.y = 18;
const ray2 = new THREE.Mesh(new THREE.ConeGeometry(6, 40, 48, 1, true), rayMat.clone());
ray2.material.opacity = 0.008;
ray2.position.y = 18;
scene.add(ray1, ray2);

// ---------- Partículas ----------
// Motas doradas ascendiendo desde las runas
const MOTES = 240;
const motePos = new Float32Array(MOTES * 3);
const moteSpeed = new Float32Array(MOTES);
for (let i = 0; i < MOTES; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = 9.3 + Math.random() * 2.0;
  motePos[i * 3 + 0] = Math.cos(a) * r;
  motePos[i * 3 + 1] = Math.random() * 5.5;
  motePos[i * 3 + 2] = Math.sin(a) * r;
  moteSpeed[i] = 0.25 + Math.random() * 0.5;
}
const moteGeo = new THREE.BufferGeometry();
moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
  color: 0xffc25e, size: 0.16, transparent: true, opacity: 0.7,
  depthWrite: false, blending: THREE.AdditiveBlending,
}));
scene.add(motes);

// Polvo cian tenue general
const DUST = 320;
const dustPos = new Float32Array(DUST * 3);
for (let i = 0; i < DUST; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = 14 + Math.random() * 42;
  dustPos[i * 3 + 0] = Math.cos(a) * r;
  dustPos[i * 3 + 1] = -4 + Math.random() * 30;
  dustPos[i * 3 + 2] = Math.sin(a) * r;
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  color: 0x76c8dd, size: 0.22, transparent: true, opacity: 0.12,
  depthWrite: false, blending: THREE.AdditiveBlending,
}));
scene.add(dust);

// ---------- Postprocesado ----------
const target = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
  samples: 4, type: THREE.HalfFloatType,
});
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.4, 0.75
);
composer.addPass(bloom);

// Grano de película + viñeta
const GrainVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grain: { value: 0.03 },
    vig: { value: 0.38 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float grain;
    uniform float vig;
    varying vec2 vUv;
    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float g = (rand(vUv * (1.7 + fract(time))) - 0.5) * grain;
      color.rgb += g;
      vec2 d = vUv - 0.5;
      float fall = smoothstep(0.85, 0.28, length(d));
      color.rgb *= mix(1.0 - vig, 1.0, fall);
      gl_FragColor = color;
    }`,
};
const grainPass = new ShaderPass(GrainVignetteShader);
composer.addPass(grainPass);
composer.addPass(new OutputPass());

// ---------- Interacción ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r') controls.autoRotate = !controls.autoRotate;
});

// Captura PNG: renderiza un frame y lo descarga en el mismo tick
document.getElementById('shot').addEventListener('click', () => {
  controls.update();
  composer.render();
  const a = document.createElement('a');
  a.href = renderer.domElement.toDataURL('image/png');
  a.download = 'arena-del-vacio-concept.png';
  a.click();
});

// ---------- Bucle ----------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // pulso lento de las runas
  runeMat.emissiveIntensity = 3.3 + Math.sin(t * 1.25) * 0.5;
  emblemMat.emissiveIntensity = 1.1 + Math.sin(t * 1.25 + 0.9) * 0.25;

  // motas doradas ascendiendo
  const mp = moteGeo.attributes.position;
  for (let i = 0; i < MOTES; i++) {
    let y = mp.getY(i) + dt * moteSpeed[i];
    if (y > 5.8) y = 0.05;
    mp.setY(i, y);
  }
  mp.needsUpdate = true;

  // deriva del polvo cian y del mar de niebla
  dust.rotation.y += dt * 0.01;
  for (const p of fogPlanes) {
    p.rotation.z += dt * p.userData.spin;
    p.position.x = Math.sin(t * 0.05 + p.userData.ph) * p.userData.drift * 4;
  }

  // flotación muy lenta de los monolitos
  for (const m of monoliths.children) {
    const f = m.userData.float;
    m.position.y = f.y0 + Math.sin(t * f.sp * Math.PI * 2 + f.ph) * f.amp;
  }

  grainPass.uniforms.time.value = t;
  controls.update();
  composer.render();
});
