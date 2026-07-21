// ============================================================================
//  Visor 3D — el juego "Captura la Bandera" (reglas del docx + protocolo
//  oficial) renderizado en el MUNDO 3D de BladeFront, reutilizando los assets
//  existentes (arena, cosmos, titanes, caballeros, estandarte, luces, bloom).
//
//  Idea clave: la LÓGICA y el PROTOCOLO son los oficiales (rejilla [row,col]),
//  pero cada celda se dibuja como una posición 3D. Así sincronizamos con otros
//  grupos (aunque ellos rendericen en 2D) y nosotros conservamos nuestro 3D.
//
//  La coordenada compartida es [row, column]; aquí la convertimos a coordenadas
//  de mundo con una escala fija (CELL) → misma distancia siempre, todos
//  sincronizados. No usa la mecánica Juggernaut: solo los assets visuales.
// ============================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { createArena, ARENA_RADIUS } from '../../arena-vacio/js/arena.js';
import { createCosmos } from '../../arena-vacio/js/cosmos.js';
import { createTitans } from '../../arena-vacio/js/titans.js';
import { createKnight } from '../../caballero-templario/js/knight.js';
import { KnightAnimator } from '../../caballero-templario/js/knight-anim.js';
import { createCyberBanner } from '../../modo-juggernaut/js/flag.js';

import { ClienteCaptura } from 'red/cliente-red.js';
import { TIPOS } from 'red/protocolo.js';

// ---------- Renderer / escena / cámara (patrón del modo-juggernaut) ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030405);
scene.fog = new THREE.FogExp2(0x030405, 0.0062);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.2;

const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 26, 46);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 10;
controls.maxDistance = 90;
controls.maxPolarAngle = Math.PI * 0.49;

// ---------- Arena + ambiente (mismos assets) ----------
const arena = createArena();
const ARENA_SCALE = 1.85;
arena.scale.set(ARENA_SCALE, 1, ARENA_SCALE);
const R = ARENA_RADIUS * ARENA_SCALE; // ~20.7
scene.add(arena);
const runeMat = arena.userData.runeMaterial;
const emblemMat = arena.userData.emblemMaterial;

const cosmos = createCosmos();
scene.add(cosmos.group);
const titans = createTitans();
scene.add(titans.group);

// ---------- Luces (mismas del modo-juggernaut) ----------
const key = new THREE.SpotLight(0xe6f0ff, 7000, 170, 0.46, 0.55, 1.8);
key.position.set(0, 48, 6); key.target.position.set(0, 0, 0);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
scene.add(key, key.target);
const rimCyan = new THREE.DirectionalLight(0x49e6ff, 10);
rimCyan.position.set(-45, 32, -75); scene.add(rimCyan);
const goldGlow = new THREE.PointLight(0xffb638, 110, 42, 1.8);
goldGlow.position.set(0, 2.2, 0); scene.add(goldGlow);
scene.add(new THREE.HemisphereLight(0x22303c, 0x04050a, 0.26));

// ---------- Estado del tablero (se llena en GAME_STARTED) ----------
let cfg = { rows: 20, columns: 20 };
let CELL = 1.8;                 // tamaño de celda en unidades de mundo (fijo → sync)
const boardGroup = new THREE.Group();
scene.add(boardGroup);

const knights = new Map();      // playerId -> { group, anim, target:Vector3, yaw }
const _v = new THREE.Vector3();

// [row, column] -> posición de mundo. Escala FIJA: la coordenada compartida
// es la celda; el mundo la refleja con la misma distancia siempre.
function celdaAMundo(row, column, out = new THREE.Vector3()) {
  const x = (column - (cfg.columns - 1) / 2) * CELL;
  const z = (row - (cfg.rows - 1) / 2) * CELL;
  return out.set(x, 0, z);
}

// Construye la rejilla visual, la bandera y los obstáculos sobre la arena.
let banner = null;
const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(0.4, 0.7, 12, 24, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffb638, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
);
beacon.position.y = 6;
scene.add(beacon);

function construirTablero(inicio) {
  cfg = { rows: inicio.rows, columns: inicio.columns };
  // Escala para que el tablero llene ~el 92% del diámetro jugable de la arena.
  CELL = (2 * R * 0.92) / Math.max(cfg.rows, cfg.columns);

  // limpiar tablero anterior
  boardGroup.clear();

  // rejilla en el suelo
  const w = CELL * cfg.columns, h = CELL * cfg.rows;
  const grid = new THREE.GridHelper(Math.max(w, h), Math.max(cfg.rows, cfg.columns), 0x2a3446, 0x1a2130);
  grid.position.y = 0.03;
  grid.material.transparent = true; grid.material.opacity = 0.5;
  boardGroup.add(grid);

  // obstáculos como bloques oscuros
  const obstMat = new THREE.MeshStandardMaterial({ color: 0x2b3547, metalness: 0.7, roughness: 0.4, emissive: 0x0a1018, emissiveIntensity: 0.5 });
  const obstGeo = new THREE.BoxGeometry(CELL * 0.86, 1.4, CELL * 0.86);
  for (const o of inicio.obstacles) {
    const b = new THREE.Mesh(obstGeo, obstMat);
    celdaAMundo(o.row, o.column, _v);
    b.position.set(_v.x, 0.7, _v.z);
    b.castShadow = true; b.receiveShadow = true;
    boardGroup.add(b);
  }

  // bandera (estandarte real del juego)
  if (!banner) { banner = createCyberBanner(); scene.add(banner); }
  colocarBandera(inicio.flag);
}

function colocarBandera(flag) {
  if (!banner || !flag) return;
  const visible = flag.status === 'AVAILABLE' || flag.status === 'DROPPED';
  banner.visible = visible;
  beacon.visible = visible;
  if (flag.row >= 0) {
    celdaAMundo(flag.row, flag.column, _v);
    banner.position.set(_v.x, 0, _v.z);
    beacon.position.set(_v.x, 6, _v.z);
  }
}

// Crea/actualiza un caballero por jugador.
function asegurarKnight(id) {
  let k = knights.get(id);
  if (!k) {
    const group = createKnight();
    group.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    scene.add(group);
    k = { group, anim: new KnightAnimator(group), target: new THREE.Vector3(), yaw: 0, esYo: id === cliente?.playerId, initialized: false };
    knights.set(id, k);
  }
  return k;
}

// ---------- Cliente (local o red) ----------
let cliente = null;
let ultimoEstado = null;

function feed(txt) {
  const ul = document.getElementById('feed');
  const li = document.createElement('li');
  li.textContent = txt;
  ul.prepend(li);
  while (ul.children.length > 8) ul.lastChild.remove();
}

const $ = (id) => document.getElementById(id);
$('modo').addEventListener('change', () => {
  const red = $('modo').value === 'red';
  $('wrapUrl').style.display = red ? '' : 'none';
  $('wrapBots').style.display = red ? 'none' : '';
});
$('reset').addEventListener('click', () => location.reload());
$('jugar').addEventListener('click', jugar);

async function jugar() {
  if (cliente) cliente.detener();
  for (const k of knights.values()) scene.remove(k.group);
  knights.clear();
  $('feed').innerHTML = '';
  const nombre = $('nombre').value || 'Templario';
  cliente = new ClienteCaptura();

  cliente.addEventListener(TIPOS.GAME_STARTED, (e) => { construirTablero(e.detail); feed('▶ arena lista'); });
  cliente.addEventListener(TIPOS.GAME_STATE, (e) => { ultimoEstado = e.detail; sincronizar(e.detail); });
  cliente.addEventListener(TIPOS.FLAG_PICKED_UP, (e) => feed(`⚑ ${e.detail.playerId} tomó la bandera`));
  cliente.addEventListener(TIPOS.FLAG_STOLEN, (e) => feed(`🔁 ${e.detail.newCarrierId} robó a ${e.detail.previousCarrierId}`));
  cliente.addEventListener(TIPOS.PLAYER_DISCONNECTED, (e) => feed(`✂ ${e.detail.playerId} salió`));
  cliente.addEventListener(TIPOS.GAME_OVER, (e) => feed(`🏆 ganó ${e.detail.winnerName}`));
  cliente.addEventListener(TIPOS.ERROR, (e) => feed(`✗ ${e.detail.code}`));

  try {
    if ($('modo').value === 'local') {
      cliente.iniciarLocal({ nombre, bots: Number($('bots').value) || 0 });
    } else {
      feed('⏳ conectando…');
      await cliente.conectar($('url').value, nombre);
      feed('▶ conectado como ' + cliente.playerId);
    }
  } catch (err) {
    feed('✗ ' + (err.message || err));
  }
}

// Reconcilia el estado de red con los caballeros de la escena.
function sincronizar(estado) {
  const vistos = new Set();
  for (const p of estado.players) {
    // El protocolo mantiene a los jugadores fuera de la rejilla hasta que
    // ingresan. Igual que el visor 2D, no deben existir visualmente aún:
    // de otro modo nacen en (0,0,0) y parecen cruzar la arena desde el centro.
    if (!p.insideBoard) continue;
    vistos.add(p.playerId);
    const k = asegurarKnight(p.playerId);
    k.esYo = p.playerId === cliente?.playerId;
    celdaAMundo(p.row, p.column, k.target);
    // La primera instantánea solo establece el punto de partida. A partir de
    // ella, los GAME_STATE posteriores sí se interpolan para mostrar movimiento.
    if (!k.initialized) {
      k.group.position.copy(k.target);
      k.initialized = true;
    }
    k.hasFlag = p.hasFlag;
  }
  // quitar caballeros de jugadores que ya no están
  for (const [id, k] of knights) {
    if (!vistos.has(id)) { scene.remove(k.group); knights.delete(id); }
  }
  colocarBandera(estado.flag);

  // HUD
  const yo = estado.players.find((p) => p.playerId === cliente?.playerId);
  $('iYo').textContent = yo ? `${cliente.playerId} [${yo.row},${yo.column}]${yo.hasFlag ? ' ⚑' : ''}` : (cliente?.playerId || '—');
  $('iBandera').textContent = estado.flag.status;
  $('iPortador').textContent = estado.flag.carrierId || 'LIBRE';
  $('iTick').textContent = estado.tick;
}

// ---------- Input: teclas → CHANGE_DIRECTION (rejilla) ----------
const TECLAS = {
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  w: 'UP', s: 'DOWN', a: 'LEFT', d: 'RIGHT',
};
window.addEventListener('keydown', (e) => {
  const dir = TECLAS[e.key] || TECLAS[e.key.toLowerCase()];
  if (dir && cliente) { cliente.cambiarDireccion(dir); e.preventDefault(); }
});

// ---------- Postprocesado (bloom) ----------
const target = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { samples: 4, type: THREE.HalfFloatType });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.35, 0.8));
composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Bucle de render ----------
const clock = new THREE.Clock();
const _camT = new THREE.Vector3(), _follow = new THREE.Vector3(0, 1.2, 0), _tmp = new THREE.Vector3();
let fpsFrames = 0, fpsT = 0, hudT = 0;

function frame(dtOverride) {
  const dt = dtOverride != null ? dtOverride : Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // mover cada caballero hacia su celda objetivo (interpolación suave)
  for (const k of knights.values()) {
    const p = k.group.position;
    _v.subVectors(k.target, p); _v.y = 0;
    const dist = _v.length();
    const speed = Math.min(dist / Math.max(dt, 0.001), CELL / 0.2); // limitar a 1 celda/ciclo
    if (dist > 0.001) {
      const step = Math.min(dist, speed * dt);
      p.addScaledVector(_v.normalize(), step);
      k.yaw = Math.atan2(_v.x, _v.z); // mirar hacia donde camina
    }
    k.group.rotation.y += (k.yaw - k.group.rotation.y) * Math.min(1, dt * 8);
    k.anim.locomotion(dt, t, dist > 0.05 ? 2.4 : 0);
  }

  // cámara sigue a mi caballero
  const yo = cliente ? knights.get(cliente.playerId) : null;
  if (yo) {
    _follow.lerp(_camT.set(yo.group.position.x, 1.2, yo.group.position.z), Math.min(1, dt * 5));
    _tmp.subVectors(_follow, controls.target);
    controls.target.add(_tmp);
    camera.position.add(_tmp);
  }

  // ambiente vivo
  cosmos.update(dt, t);
  titans.update(dt, t);
  if (arena.userData.update) arena.userData.update(dt, t);
  if (banner?.userData?.update) banner.userData.update(dt, t);
  if (beacon.visible) beacon.material.opacity = 0.05 + Math.sin(t * 2.4) * 0.02;
  runeMat.emissiveIntensity = 3.3 + Math.sin(t * 1.25) * 0.5;
  emblemMat.emissiveIntensity = 1.1 + Math.sin(t * 1.25 + 0.9) * 0.25;

  // HUD FPS
  fpsFrames++; fpsT += dt;
  if (fpsT >= 0.5) { $('iFps').textContent = Math.round(fpsFrames / fpsT); fpsFrames = 0; fpsT = 0; }

  controls.update();
  composer.render();
}

renderer.setAnimationLoop(() => frame());

// exponer para depurar / verificación sin rAF
window.__captura = {
  get cliente() { return cliente; },
  knights, scene, camera,
  frame,                                   // paso manual de un frame
  canvas: renderer.domElement,
};
