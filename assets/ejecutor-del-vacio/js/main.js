// Demo jugable del Ejecutor del Vacío sobre la Arena real:
// 3 templarios simulados deambulan y huyen; el Ejecutor persigue al más
// cercano, embiste, y el knockback amenaza con un ring-out hacia el abismo.
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
import { createKnight } from '../../caballero-templario/js/knight.js';
import { KnightAnimator } from '../../caballero-templario/js/knight-anim.js';
import { createExecutor, animateExecutorWalk } from './executor.js';
import { EnemySystem, PlayerSim } from './enemy-system.js';

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
camera.position.set(0, 16, 36);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 9;
controls.maxDistance = 75;
controls.maxPolarAngle = Math.PI * 0.48;

// ---------- Arena real (reutilizada del asset hermano) ----------
const arena = createArena();
// Arena ampliada en planta: la original queda pequeña junto a los personajes
const ARENA_SCALE = 1.85;
arena.scale.set(ARENA_SCALE, 1, ARENA_SCALE);
const R = ARENA_RADIUS * ARENA_SCALE;
scene.add(arena);
const runeMat = arena.userData.runeMaterial;
const emblemMat = arena.userData.emblemMaterial;

// ---------- Mar de niebla (versión ligera) ----------
// Cosmos del Vacío: monolitos colosales, Eclipse Anomalía, ceniza cósmica
// y océano de niebla procedural
const cosmos = createCosmos();
scene.add(cosmos.group);

// ---------- Iluminación ----------
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

// Rim carmesí dedicado tras la zona de spawn del enemigo: recorta los bordes
// dentados de la obsidiana y los cuernos, sacándolos de la niebla baja.
const rimCrimson = new THREE.SpotLight(0xff1a0d, 850, 34, 0.38, 0.5, 1.7);
rimCrimson.position.set(0, 9, -R - 10);
rimCrimson.target.position.set(0, 1.8, 0);
scene.add(rimCrimson, rimCrimson.target);

const goldGlow = new THREE.PointLight(0xffb638, 110, 42, 1.8);
goldGlow.position.set(0, 2.2, 0);
scene.add(goldGlow);

scene.add(new THREE.HemisphereLight(0x22303c, 0x04050a, 0.26));

// ---------- Actores ----------
const executor = createExecutor();
executor.position.set(0, 0, -R + 3); // spawn frente al rim carmesí
scene.add(executor);

const players = [];
for (let i = 0; i < 3; i++) {
  const knight = createKnight();
  knight.scale.setScalar(0.92); // los templarios son mortales; el Ejecutor, enorme
  const a = (i / 3) * Math.PI * 2 + 0.8;
  knight.position.set(Math.cos(a) * R * 0.3, 0, Math.sin(a) * R * 0.3);
  scene.add(knight);
  players.push(new PlayerSim(`J-${i + 1}`, knight, R));
}
const playerAnims = players.map((p) => new KnightAnimator(p.group));

const ai = new EnemySystem(executor, {
  speed: 2.7,
  arenaRadius: R,
  collisionRadius: 0.8,
  knockbackForce: 13,
});

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

// ---------- Interacción ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// Modo foto: P congela la simulación para encuadrar capturas
let paused = false;
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'p') {
    paused = !paused;
    // En modo foto la cámara encuadra al Ejecutor; al reanudar, vuelve al centro
    if (paused) {
      controls.target.set(executor.position.x, 1.6, executor.position.z);
    } else {
      controls.target.set(0, 1.2, 0);
    }
  }
});

document.getElementById('shot').addEventListener('click', () => {
  controls.update();
  composer.render();
  const a = document.createElement('a');
  a.href = renderer.domElement.toDataURL('image/png');
  a.download = 'ejecutor-del-vacio-concept.png';
  a.click();
});

// ---------- Bucle ----------
const clock = new THREE.Clock();
const targetLabel = document.getElementById('target');
let labelT = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (!paused) {
    ai.update(dt, t, players);
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      p.update(dt, executor.position);
      if (p.falling) playerAnims[i].fall(dt, t);
      else playerAnims[i].locomotion(dt, t, Math.hypot(p.velocity.x, p.velocity.z));
    }
    animateExecutorWalk(executor, t, 1);
  }

  // HUD: objetivo actual de la IA
  labelT += dt;
  if (labelT > 0.25) {
    labelT = 0;
    targetLabel.textContent = ai.targetPlayerId || '—';
  }

  runeMat.emissiveIntensity = 3.3 + Math.sin(t * 1.25) * 0.5;
  emblemMat.emissiveIntensity = 1.1 + Math.sin(t * 1.25 + 0.9) * 0.25;
  cosmos.update(dt, t);

  grainPass.uniforms.time.value = t;
  controls.update();
  composer.render();
});
