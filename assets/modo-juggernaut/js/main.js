// Demo del Modo Juggernaut sobre la Arena del Vacío real:
// 11 templarios corren al estandarte; quien lo toca se corrompe en el
// Ejecutor; los demás lo cazan a placajes hasta que lo suelte.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createArena, ARENA_RADIUS } from '../../arena-vacio/js/arena.js';
import { createCosmos } from '../../arena-vacio/js/cosmos.js';
import { createTitans } from '../../arena-vacio/js/titans.js';
import { createKnight } from '../../caballero-templario/js/knight.js';
import { createExecutor } from '../../ejecutor-del-vacio/js/executor.js';
import { createCyberBanner } from './flag.js';
import { JuggernautMode, NetworkBus } from './juggernaut-mode.js';
import { VoidScore } from './audio.js';

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
scene.fog = new THREE.FogExp2(0x030405, 0.0062);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.2;

// ---------- Cámara ----------
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 18, 40);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 9;
controls.maxDistance = 75;
controls.maxPolarAngle = Math.PI * 0.48;

// ---------- Arena + ambiente ----------
const arena = createArena();
// La arena original (r = 11.2) queda pequeña junto a personajes de ~2 m:
// se amplía en planta (X/Z) conservando alturas de losas y borde.
const ARENA_SCALE = 1.85;
arena.scale.set(ARENA_SCALE, 1, ARENA_SCALE);
const R = ARENA_RADIUS * ARENA_SCALE; // radio jugable efectivo (~20.7)
scene.add(arena);
const runeMat = arena.userData.runeMaterial;
const emblemMat = arena.userData.emblemMaterial;

// Cosmos del Vacío: monolitos colosales, Eclipse Anomalía, ceniza cósmica
// y océano de niebla procedural (sustituye la niebla plana y losas antiguas)
const cosmos = createCosmos();
scene.add(cosmos.group);

// Guerra de titanes al fondo: dos colosos luchando en la niebla profunda
const titans = createTitans();
scene.add(titans.group);

// ---------- Luces ----------
const key = new THREE.SpotLight(0xe6f0ff, 7000, 170, 0.46, 0.55, 1.8);
key.position.set(0, 48, 6);
key.target.position.set(0, 0, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.03;
scene.add(key, key.target);

const rimCyan = new THREE.DirectionalLight(0x49e6ff, 10);
rimCyan.position.set(-45, 32, -75);
scene.add(rimCyan);

const rimCrimson = new THREE.SpotLight(0xff1a0d, 850, 34, 0.38, 0.5, 1.7);
rimCrimson.position.set(0, 9, -R - 10);
rimCrimson.target.position.set(0, 1.8, 0);
scene.add(rimCrimson, rimCrimson.target);

const goldGlow = new THREE.PointLight(0xffb638, 110, 42, 1.8);
goldGlow.position.set(0, 2.2, 0);
scene.add(goldGlow);

scene.add(new THREE.HemisphereLight(0x22303c, 0x04050a, 0.26));

// ---------- Estandarte + modo de juego ----------
const flag = createCyberBanner();
flag.position.set(0, 0, 0); // el Ciber-Estandarte nace en el origen
scene.add(flag);

const mode = new JuggernautMode(scene, {
  arenaRadius: R,
  hunterCount: 11,
  knightFactory: createKnight,
  executorFactory: createExecutor,
  flag,
});

// ---------- Ambiente vivo ----------
// Motas doradas ascendiendo desde el anillo de runas (escalado ×1.85)
const MOTES = 260;
const motePos = new Float32Array(MOTES * 3);
const moteSpeed = new Float32Array(MOTES);
for (let i = 0; i < MOTES; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = 17.2 + Math.random() * 3.6;
  motePos[i * 3 + 0] = Math.cos(a) * r;
  motePos[i * 3 + 1] = Math.random() * 6;
  motePos[i * 3 + 2] = Math.sin(a) * r;
  moteSpeed[i] = 0.25 + Math.random() * 0.5;
}
const moteGeo = new THREE.BufferGeometry();
moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
  color: 0xffc25e, size: 0.18, transparent: true, opacity: 0.7,
  depthWrite: false, blending: THREE.AdditiveBlending,
}));
scene.add(motes);

// Faro de luz sobre el estandarte cuando está libre (legibilidad de juego)
const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(0.4, 0.75, 13, 24, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0xffb638, transparent: true, opacity: 0.05,
    blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, fog: false,
  })
);
beacon.position.y = 6.5;
scene.add(beacon);

// Ráfagas de chispas de impacto (pool reutilizado, cero allocs en caliente)
class SparkBurst {
  constructor(scene) {
    this.N = 70;
    this.pos = new Float32Array(this.N * 3);
    this.vel = new Float32Array(this.N * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({
      size: 0.14, transparent: true, opacity: 1,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.visible = false;
    this.points.frustumCulled = false;
    this.life = 0;
    scene.add(this.points);
  }
  fire(p, color) {
    this.mat.color.set(color);
    for (let i = 0; i < this.N; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 4.5;
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y + 1 + Math.random() * 1.2;
      this.pos[i * 3 + 2] = p.z;
      this.vel[i * 3] = Math.cos(a) * sp;
      this.vel[i * 3 + 1] = 2 + Math.random() * 4;
      this.vel[i * 3 + 2] = Math.sin(a) * sp;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.life = 0.75;
    this.points.visible = true;
  }
  update(dt) {
    if (!this.points.visible) return;
    this.life -= dt;
    if (this.life <= 0) { this.points.visible = false; return; }
    this.mat.opacity = this.life / 0.75;
    for (let i = 0; i < this.N; i++) {
      this.vel[i * 3 + 1] -= 11 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
const burstPool = [
  new SparkBurst(scene), new SparkBurst(scene),
  new SparkBurst(scene), new SparkBurst(scene),
];
let burstIdx = 0;
const fireBurst = (p, color) => burstPool[burstIdx++ % burstPool.length].fire(p, color);

// La arena reacciona a los eventos: pulso de runas + chispas
let runePulse = 0;
const flagWorld = new THREE.Vector3();
NetworkBus.addEventListener('FLAG_CAPTURED', () => {
  runePulse = 1.4;
  fireBurst(mode.flag.getWorldPosition(flagWorld), 0xffc25e);
});
NetworkBus.addEventListener('JUGGERNAUT_BORN', () => {
  runePulse = 2.2;
  fireBurst(mode.executor.position, 0xff3b1c);
});
NetworkBus.addEventListener('FLAG_DROPPED', () => {
  runePulse = 1.6;
  fireBurst(mode.executor.position, 0xff3b1c);
});
NetworkBus.addEventListener('GROUND_SLAM', (e) => {
  if (e.detail.phase === 'impact') {
    runePulse = 2.4;
    fireBurst(mode.executor.position, 0xff3b1c);
  }
});

// Consola de debug: window.__mode.hunters[0].state, .holder, etc.
window.__mode = mode;
window.__dbg = { camera, controls, titans, scene };

// ---------- La Partitura del Vacío (música + SFX procedurales) ----------
const score = new VoidScore();
window.__score = score; // debug
// los navegadores exigen un gesto del usuario para arrancar el audio
const unlockAudio = () => score.ensure();
window.addEventListener('keydown', unlockAudio);
window.addEventListener('pointerdown', unlockAudio);

NetworkBus.addEventListener('TACKLE_DASH', () => score.whoosh());
NetworkBus.addEventListener('FLAG_CAPTURED', () => score.arpUp());
NetworkBus.addEventListener('JUGGERNAUT_BORN', () => score.braam());
NetworkBus.addEventListener('FLAG_DROPPED', () => score.clang());
NetworkBus.addEventListener('RING_OUT', () => score.fallCry());
NetworkBus.addEventListener('GROUND_SLAM', (e) => {
  if (e.detail.phase === 'windup') score.riser();
  else score.slamImpact();
});

// ---------- Control humano (tecla C: jugar con J-1) ----------
const keys = { w: false, a: false, s: false, d: false };
const inputVec = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _camT = new THREE.Vector3();
const _follow = new THREE.Vector3(0, 1.4, 0), _tmp = new THREE.Vector3();

// Anillo dorado bajo el avatar controlado
const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.55, 0.72, 40),
  new THREE.MeshBasicMaterial({
    color: 0xffb638, transparent: true, opacity: 0.85,
    side: THREE.DoubleSide, depthWrite: false,
  })
);
marker.rotation.x = -Math.PI / 2;
scene.add(marker);

// Versión jugable: arrancas controlando a J-1 (C cede el control a la IA)
mode.setControlled(mode.hunters[0]);
marker.visible = true;
_follow.copy(controls.target);

// ---------- Postprocesado ----------
const target = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
  samples: 4, type: THREE.HalfFloatType,
});
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.35, 0.8
));
const GrainVignetteShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 },
    grain: { value: 0.028 }, vig: { value: 0.4 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float time; uniform float grain; uniform float vig;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb += (rand(vUv * (1.7 + fract(time))) - 0.5) * grain;
      float fall = smoothstep(0.85, 0.28, length(vUv - 0.5));
      c.rgb *= mix(1.0 - vig, 1.0, fall);
      gl_FragColor = c;
    }`,
};
const grainPass = new ShaderPass(GrainVignetteShader);
composer.addPass(new OutputPass());
composer.addPass(grainPass);

// ---------- HUD: feed de eventos "de red" + estado ----------
const feed = document.getElementById('feed');
const holderLabel = document.getElementById('holder');
const FEED_TEXT = {
  FLAG_CAPTURED: (d) => `⚑ FLAG_CAPTURED → ${d.playerId}`,
  JUGGERNAUT_BORN: (d) => `☠ ${d.playerId} es el JUGGERNAUT`,
  FLAG_DROPPED: (d) => `⚑ FLAG_DROPPED: ${d.by} placó a ${d.from}`,
  TACKLE_DASH: (d) => `→ ${d.playerId} lanza un placaje`,
  GROUND_SLAM: (d) => (d.phase === 'impact' ? `✹ GROUND_SLAM de ${d.playerId}` : null),
  RING_OUT: (d) => `↓ ${d.playerId} cayó al abismo`,
};
for (const [type, fmt] of Object.entries(FEED_TEXT)) {
  NetworkBus.addEventListener(type, (e) => {
    const text = fmt(e.detail);
    if (!text) return;
    const li = document.createElement('li');
    li.textContent = text;
    feed.prepend(li);
    while (feed.children.length > 7) feed.lastChild.remove();
  });
}

// ---------- Interacción ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

let paused = false;
let gameOver = false;
const WIN_DOMINIO = 45; // segundos acumulados como Juggernaut para ganar
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'p') paused = !paused;
  if (k === 'c') {
    mode.setControlled(mode.controlled ? null : mode.hunters[0]);
    marker.visible = !!mode.controlled;
    if (mode.controlled) _follow.copy(controls.target); // sin salto de cámara
  }
  if (k === 'r' && gameOver) location.reload();
  if (k === 'm') score.toggleMute();
  if (k === 'w' || k === 'arrowup') keys.w = true;
  if (k === 'a' || k === 'arrowleft') keys.a = true;
  if (k === 's' || k === 'arrowdown') keys.s = true;
  if (k === 'd' || k === 'arrowright') keys.d = true;
  if ((k === ' ' || k === 'space' || e.code === 'Space' || k === 'f') && mode.controlled) {
    e.preventDefault();
    if (mode.controlled === mode.holder) mode.requestSlam = true;
    else mode.controlled.wantsTackle = true;
  }
  if ((k === 'shift' || k === 'q') && mode.controlled && mode.controlled !== mode.holder) {
    mode.controlled.wantsDodge = true;
  }
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') keys.w = false;
  if (k === 'a' || k === 'arrowleft') keys.a = false;
  if (k === 's' || k === 'arrowdown') keys.s = false;
  if (k === 'd' || k === 'arrowright') keys.d = false;
});

document.getElementById('shot').addEventListener('click', () => {
  controls.update();
  composer.render();
  const a = document.createElement('a');
  a.href = renderer.domElement.toDataURL('image/png');
  a.download = 'modo-juggernaut-concept.png';
  a.click();
});

// ---------- Bucle ----------
const clock = new THREE.Clock();
const fpsLabel = document.getElementById('fps');
let fpsFrames = 0, fpsT = 0, hudT = 0;
const shake = new THREE.Vector3();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // Input humano → dirección relativa a cámara (antes de simular)
  if (mode.controlled) {
    _fwd.subVectors(controls.target, camera.position);
    _fwd.y = 0; _fwd.normalize();
    _right.crossVectors(_fwd, UP); // fwd × up = derecha de pantalla
    inputVec.set(0, 0, 0)
      .addScaledVector(_fwd, (keys.w ? 1 : 0) - (keys.s ? 1 : 0))
      .addScaledVector(_right, (keys.d ? 1 : 0) - (keys.a ? 1 : 0));
    if (inputVec.lengthSq() > 0) inputVec.normalize();
    mode.controlled.inputDir.copy(inputVec);
    mode.controlDir.copy(inputVec);
  }

  if (!paused && !gameOver) mode.update(dt, t);

  // Cámara de jugador: TODO el rig (target + cámara) se traslada con el
  // avatar — sigue de verdad, manteniendo la órbita y el zoom del ratón
  if (mode.controlled) {
    const ent = mode.controlled === mode.holder
      ? mode.executor.position : mode.controlled.position;
    _follow.lerp(_camT.set(ent.x, 1.4, ent.z), Math.min(1, dt * 6));
    _tmp.subVectors(_follow, controls.target);
    controls.target.add(_tmp);
    camera.position.add(_tmp);
    marker.position.set(ent.x, 0.08, ent.z);
  }

  // Ambiente vivo
  const mp = moteGeo.attributes.position;
  for (let i = 0; i < MOTES; i++) {
    let y = mp.getY(i) + dt * moteSpeed[i];
    if (y > 6.2) y = 0.05;
    mp.setY(i, y);
  }
  mp.needsUpdate = true;
  cosmos.update(dt, t);
  titans.update(dt, t);
  if (arena.userData.update) arena.userData.update(dt, t);
  for (const b of burstPool) b.update(dt);
  beacon.visible = mode.phase === 'FREE';
  if (beacon.visible) {
    beacon.position.set(mode.flag.position.x, 6.5, mode.flag.position.z);
    beacon.material.opacity = 0.045 + Math.sin(t * 2.4) * 0.015;
  }

  runePulse = Math.max(0, runePulse - dt * 2.2);
  runeMat.emissiveIntensity = 3.3 + Math.sin(t * 1.25) * 0.5 + runePulse;
  emblemMat.emissiveIntensity = 1.1 + Math.sin(t * 1.25 + 0.9) * 0.25 + runePulse * 0.4;

  // HUD
  fpsFrames++; fpsT += dt; hudT += dt;
  if (fpsT >= 0.5) {
    fpsLabel.textContent = Math.round(fpsFrames / fpsT);
    fpsFrames = 0; fpsT = 0;
  }
  if (hudT >= 0.25) {
    hudT = 0;
    holderLabel.textContent = mode.holder ? mode.holder.id : 'LIBRE';
    const b = mode.bestDominio();
    document.getElementById('best').textContent =
      b ? `${b[0]} · ${b[1].toFixed(0)}s / ${WIN_DOMINIO}s` : '—';

    // Victoria: el primero en acumular WIN_DOMINIO segundos de Dominio
    if (!gameOver && b && b[1] >= WIN_DOMINIO) {
      gameOver = true;
      document.getElementById('winner').textContent =
        b[0] === 'J-1' ? '¡Dominas el Vacío!' : `${b[0]} domina el Vacío`;
      document.getElementById('win').classList.add('show');
    }
  }

  // banda sonora: secuenciador + intensidad dramática según la fase
  score.update();
  score.setIntensity(mode.phase === 'ACTIVE' ? 1 : 0.2);
  if (gameOver) score.victory();

  grainPass.uniforms.time.value = t;
  controls.update();

  // Camera shake combinado: GROUND_SLAM (10 frames) + choque de titanes
  // (ruido de alta frecuencia que decae en 0.4 s). Se aplica solo al render
  // y se revierte después para no contaminar OrbitControls.
  let sx = 0, sy = 0, sz = 0;
  if (mode.shakeFrames > 0) {
    mode.shakeFrames--;
    sx += (Math.random() - 0.5) * 0.22;
    sy += (Math.random() - 0.5) * 0.16;
    sz += (Math.random() - 0.5) * 0.22;
  }
  if (titans.shake > 0) {
    const s = titans.shake; // 1 → 0 en 0.4 s: los dioses lejanos se "sienten"
    sx += Math.sin(t * 60) * 0.03 * s;
    sy += Math.cos(t * 57) * 0.022 * s;
    sz += Math.sin(t * 63) * 0.03 * s;
  }
  if (sx || sy || sz) {
    shake.set(sx, sy, sz);
    camera.position.add(shake);
    composer.render();
    camera.position.sub(shake);
  } else {
    composer.render();
  }
});
