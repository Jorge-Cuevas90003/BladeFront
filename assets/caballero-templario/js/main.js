// Escena "concept art" — iluminación cinematográfica, bloom, grano de película,
// dolly de cámara inicial y captura PNG.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createKnight, MAT } from './knight.js';

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.getElementById('app').appendChild(renderer.domElement);

// ---------- Escena ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050607);
scene.fog = new THREE.FogExp2(0x050607, 0.055);

// Entorno para reflejos metálicos realistas
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

// ---------- Cámara ----------
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
const CAM_HOME = new THREE.Vector3(2.2, 1.35, 4.4);
const CAM_INTRO = new THREE.Vector3(4.6, 2.6, 8.4);
camera.position.copy(CAM_INTRO);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.05, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 1.5;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI * 0.55;
controls.autoRotateSpeed = -0.6;
controls.enabled = false; // se habilita al terminar el dolly de entrada

// ---------- Suelo y pedestal brutalista ----------
const concrete = new THREE.MeshStandardMaterial({ color: 0x17181a, metalness: 0.05, roughness: 0.9 });

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(26, 48),
  new THREE.MeshStandardMaterial({ color: 0x08090b, metalness: 0.1, roughness: 0.95 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.22;
ground.receiveShadow = true;
scene.add(ground);

const ped1 = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.14, 8), concrete);
ped1.position.y = -0.07;
ped1.castShadow = ped1.receiveShadow = true;
scene.add(ped1);

const ped2 = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.1, 8), concrete);
ped2.position.y = -0.17;
ped2.castShadow = ped2.receiveShadow = true;
scene.add(ped2);

// ---------- Iluminación cinematográfica ----------
// Clave: cálida, dura, desde arriba-derecha (sombras dramáticas)
const key = new THREE.SpotLight(0xffe9d0, 68, 30, 0.5, 0.6, 1.6);
key.position.set(3.2, 4.6, 2.6);
key.target.position.set(0, 1.2, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0003;
key.shadow.normalBias = 0.02;
scene.add(key, key.target);

// Contraluz: fría (eco del visor), recorta la silueta contra la niebla
const rim = new THREE.SpotLight(0x7fd6ff, 50, 30, 0.7, 0.5, 1.6);
rim.position.set(-3.0, 3.2, -3.4);
rim.target.position.set(0, 1.4, 0);
scene.add(rim, rim.target);

// Relleno tenue
scene.add(new THREE.HemisphereLight(0x2a3440, 0x0b0c0e, 0.32));

// Haz volumétrico fake bajo la luz clave (god ray)
const beamDir = new THREE.Vector3(0, 0, 0).sub(key.position).normalize();
const beam = new THREE.Mesh(
  new THREE.ConeGeometry(2.2, 6.2, 32, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0x9fc9e8, transparent: true, opacity: 0.02,
    blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, fog: false,
  })
);
beam.position.copy(key.position).addScaledVector(beamDir, 3.1);
beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), beamDir.clone().negate());
scene.add(beam);

// ---------- Caballero ----------
const knight = createKnight();
scene.add(knight);
const cape = knight.getObjectByName('capa');

// ---------- Polvo en suspensión ----------
const DUST = 250;
const dustPos = new Float32Array(DUST * 3);
for (let i = 0; i < DUST; i++) {
  dustPos[i * 3 + 0] = (Math.random() - 0.5) * 6;
  dustPos[i * 3 + 1] = Math.random() * 3.4;
  dustPos[i * 3 + 2] = (Math.random() - 0.5) * 6;
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  color: 0x9fd8e8, size: 0.01, transparent: true, opacity: 0.28,
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
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.4, 0.3, 0.85
);
composer.addPass(bloom);

// Grano de película + viñeta (look de render cinematográfico)
const GrainVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grain: { value: 0.025 },
    vignette: { value: 0.45 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float grain;
    uniform float vignette;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb += (rand(vUv + fract(time)) - 0.5) * grain;
      float d = distance(vUv, vec2(0.5));
      float vig = smoothstep(0.88, 0.32, d);
      c.rgb *= mix(1.0, vig, vignette);
      gl_FragColor = c;
    }`,
};
// El grano va DESPUÉS del tone mapping (OutputPass) para que sea uniforme y sutil
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

window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r') controls.autoRotate = !controls.autoRotate;
});

// Captura PNG: renderiza un frame y lo descarga en el mismo tick
document.getElementById('shot').addEventListener('click', () => {
  controls.update();
  composer.render();
  const a = document.createElement('a');
  a.href = renderer.domElement.toDataURL('image/png');
  a.download = 'caballero-templario-concept.png';
  a.click();
});

// ---------- Bucle ----------
const clock = new THREE.Clock();
const INTRO_DUR = 2.6;
let introDone = false;
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

// Arranca el fundido desde negro
requestAnimationFrame(() => document.getElementById('fade').classList.add('out'));

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  const t = clock.elapsedTime;

  // Dolly de entrada: la cámara se acerca con suavidad
  if (!introDone) {
    const k = Math.min(t / INTRO_DUR, 1);
    camera.position.lerpVectors(CAM_INTRO, CAM_HOME, easeOutCubic(k));
    if (k >= 1) {
      introDone = true;
      controls.enabled = true;
      controls.autoRotate = true;
    }
  }

  // Vida sutil: respiración, vaivén de capa y pulso del visor
  knight.position.y = Math.sin(t * 1.1) * 0.004;
  if (cape) cape.rotation.x = Math.sin(t * 0.5) * 0.015;
  MAT.visor.emissiveIntensity = 3.4 + Math.sin(t * 2.0) * 0.2;

  // Deriva lenta del polvo hacia arriba, con reciclado
  const p = dustGeo.attributes.position;
  for (let i = 0; i < DUST; i++) {
    let y = p.getY(i) + dt * 0.05;
    if (y > 3.4) y = 0;
    p.setY(i, y);
  }
  p.needsUpdate = true;

  grainPass.uniforms.time.value = t;
  controls.update();
  composer.render();
});
