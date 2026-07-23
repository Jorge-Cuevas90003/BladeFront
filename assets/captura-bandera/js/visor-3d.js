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
let INTERVALO_S = 0.2;          // seg por ciclo del servidor (movementIntervalMs/1000)
let ESCALA_KNIGHT = 0.7;        // escala de cada caballero, derivada de CELL
const ARENA_FLOOR_Y = 0.42; // Altura del suelo de la arena para que las botas y piernas reposen sobre las losas
const boardGroup = new THREE.Group();
scene.add(boardGroup);

const knights = new Map();      // playerId -> { group, anim, target:Vector3, yaw }
const _v = new THREE.Vector3();

// [row, column] -> posición de mundo. Escala FIJA: la coordenada compartida
// es la celda; el mundo la refleja con la misma distancia siempre.
function celdaAMundo(row, column, out = new THREE.Vector3()) {
  const x = (column - (cfg.columns - 1) / 2) * CELL;
  const z = (row - (cfg.rows - 1) / 2) * CELL;
  return out.set(x, ARENA_FLOOR_Y, z);
}

// Construye la rejilla visual, la bandera y los obstáculos sobre la arena.
let banner = null;
const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(0.4, 0.7, 12, 24, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffb638, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
);
beacon.position.y = ARENA_FLOOR_Y + 6;
scene.add(beacon);

  // ---------- Monolito del Vacío (Obstáculo Rúnico Procedimental) ----------
  const MONOLITH_MAT_DARK = new THREE.MeshPhysicalMaterial({
    color: 0x141820, metalness: 0.88, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.25,
  });
  const MONOLITH_MAT_BRASS = new THREE.MeshStandardMaterial({
    color: 0x96742f, metalness: 1.0, roughness: 0.38,
  });

  function createVoidMonolith(cellWidth, index = 0) {
    const g = new THREE.Group();
    g.name = 'void_monolith';

    const isGold = index % 2 === 0;
    const glowColor = isGold ? 0xffb638 : 0x49e6ff;

    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x05080d, emissive: glowColor, emissiveIntensity: 3.2, roughness: 0.2, metalness: 0.9,
    });

    // 1. Zócalo / Base octogonal de basalto estelar
    const baseR = cellWidth * 0.38;
    const baseH = 0.22;
    const baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(baseR, baseR * 1.08, baseH, 8), MONOLITH_MAT_DARK);
    baseMesh.position.y = baseH / 2;
    baseMesh.castShadow = baseMesh.receiveShadow = true;
    g.add(baseMesh);

    // 2. Columna Monolítica (basalto tallado con bisel)
    const pillarRTop = cellWidth * 0.28;
    const pillarRBot = cellWidth * 0.34;
    const pillarH = 1.15;
    const pillarMesh = new THREE.Mesh(new THREE.CylinderGeometry(pillarRTop, pillarRBot, pillarH, 8), MONOLITH_MAT_DARK);
    pillarMesh.position.y = baseH + pillarH / 2;
    pillarMesh.rotation.y = Math.PI / 8; // bisel cruzado
    pillarMesh.castShadow = pillarMesh.receiveShadow = true;
    g.add(pillarMesh);

    // 3. Anillo de latón rúnico (trim central)
    const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(cellWidth * 0.32, 0.022, 8, 24), MONOLITH_MAT_BRASS);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = baseH + pillarH * 0.55;
    g.add(ringMesh);

    // 4. Franjas verticales de energía rúnica (canales luminosos)
    const stripeGeo = new THREE.BoxGeometry(0.025, pillarH * 0.85, 0.025);
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 8;
      const stripe = new THREE.Mesh(stripeGeo, glowMat);
      const sr = (pillarRTop + pillarRBot) / 2 + 0.005;
      stripe.position.set(Math.cos(angle) * sr, baseH + pillarH / 2, Math.sin(angle) * sr);
      g.add(stripe);
    }

    // 5. Cristal Flotante del Vacío (Octaedro levitante)
    const crystalGeo = new THREE.OctahedronGeometry(cellWidth * 0.18);
    const crystalMesh = new THREE.Mesh(crystalGeo, glowMat);
    const crystalY = baseH + pillarH + 0.25;
    crystalMesh.position.y = crystalY;
    crystalMesh.castShadow = true;
    g.add(crystalMesh);

    // Guardar referencias para animación en el frame loop
    g.userData = {
      crystal: crystalMesh,
      baseY: crystalY,
      seed: index * 1.37 + Math.random() * 2.0,
      update: (dt, t) => {
        crystalMesh.rotation.y += dt * 1.4;
        crystalMesh.rotation.x += dt * 0.4;
        crystalMesh.position.y = crystalY + Math.sin(t * 2.2 + g.userData.seed) * 0.06;
      },
    };

    return g;
  }

  let activeMonoliths = [];

  function construirTablero(inicio) {
    cfg = { rows: inicio.rows, columns: inicio.columns };
    INTERVALO_S = Math.max(0.05, (inicio.movementIntervalMs || 200) / 1000);

    const lado = Math.max(cfg.rows, cfg.columns);
    CELL = (2 * R * 0.98) / (lado * Math.SQRT2);
    ESCALA_KNIGHT = Math.min(1, CELL * 0.42);

    // limpiar tablero anterior
    boardGroup.clear();
    activeMonoliths = [];

    // rejilla en el suelo
    const w = CELL * cfg.columns, h = CELL * cfg.rows;
    const grid = new THREE.GridHelper(Math.max(w, h), Math.max(cfg.rows, cfg.columns), 0x2a3446, 0x1a2130);
    grid.position.y = ARENA_FLOOR_Y + 0.03;
    grid.material.transparent = true; grid.material.opacity = 0.5;
    boardGroup.add(grid);

    // obstáculos como Monolitos del Vacío Rúnicos
    for (let i = 0; i < inicio.obstacles.length; i++) {
      const o = inicio.obstacles[i];
      const m = createVoidMonolith(CELL, i);
      celdaAMundo(o.row, o.column, _v);
      m.position.set(_v.x, ARENA_FLOOR_Y, _v.z);
      boardGroup.add(m);
      activeMonoliths.push(m);
    }

    if (!banner) { banner = createCyberBanner(); scene.add(banner); }
    banner.scale.setScalar(Math.min(1.3, ESCALA_KNIGHT * 1.4));
    colocarBandera(inicio.flag);
  }

function colocarBandera(flag) {
  if (!banner || !flag) return;
  const visible = flag.status === 'AVAILABLE' || flag.status === 'DROPPED';
  banner.visible = visible;
  beacon.visible = visible;
  if (flag.row >= 0) {
    celdaAMundo(flag.row, flag.column, _v);
    banner.position.set(_v.x, ARENA_FLOOR_Y, _v.z);
    beacon.position.set(_v.x, ARENA_FLOOR_Y + 6, _v.z);
  }
}

// Crea/actualiza un caballero por jugador.
function asegurarKnight(id) {
  let k = knights.get(id);
  if (!k) {
    const group = createKnight();
    group.scale.setScalar(ESCALA_KNIGHT); // encaja en la celda a cualquier tamaño de arena
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

// Cache de elementos del DOM para evitar reflows y bloqueos en el hilo principal
const domCache = new Map();
function getEl(id) {
  let el = domCache.get(id);
  if (!el) {
    el = document.getElementById(id);
    if (el) domCache.set(id, el);
  }
  return el;
}
const $ = (id) => getEl(id);

function feed(txt) {
  requestAnimationFrame(() => {
    const ul = getEl('feed');
    if (!ul) return;
    const li = document.createElement('li');
    li.textContent = txt;
    ul.prepend(li);
    while (ul.children.length > 8) ul.lastChild.remove();
  });
}

// Indicador de conexión: LOCAL / CONECTANDO / CONECTADO / DESCONECTADO / ERROR.
function estadoConexion(txt, color) {
  const el = getEl('iConn');
  if (!el) return;
  el.textContent = txt;
  el.style.color = color;
}

$('modo').addEventListener('change', () => {
  const red = $('modo').value === 'red';
  $('wrapUrl').style.display = red ? '' : 'none';
  $('wrapBots').style.display = red ? 'none' : '';
});
$('reset').addEventListener('click', () => location.reload());
$('jugar').addEventListener('click', jugar);

// Menú de entrada: se oculta al entrar a la arena, reaparece si algo falla.
const mostrarMenu = (v) => getEl('menu')?.classList.toggle('oculto', !v);
const ocultarGameOverModal = () => getEl('modalGameOver')?.classList.add('oculto');

// Modal Fin de Partida (Victoria / Derrota)
function mostrarGameOverModal(detail) {
  const yoId = cliente?.playerId;
  const esGanador = yoId && detail.winnerId === yoId;

  const modal = getEl('modalGameOver');
  const emblem = getEl('goEmblem');
  const title = getEl('goTitle');
  const subtitle = getEl('goSubtitle');
  const winnerName = getEl('goWinnerName');
  const winnerId = getEl('goWinnerId');
  const reason = getEl('goReason');
  const ticks = getEl('goTicks');

  if (winnerName) winnerName.textContent = detail.winnerName || detail.winnerId || '—';
  if (winnerId) winnerId.textContent = detail.winnerId || '—';
  if (reason) reason.textContent = detail.reason === 'EXITED_WITH_FLAG' ? 'Extracción por el Borde' : (detail.reason || 'Victoria');
  if (ticks) ticks.textContent = (ultimoEstado?.tick || '—') + ' ticks';

  if (esGanador) {
    if (emblem) emblem.textContent = '👑';
    if (title) { title.textContent = 'VICTORIA ÉPICA'; title.style.color = '#ffd27a'; title.style.textShadow = '0 0 30px rgba(255,182,56,0.8)'; }
    if (subtitle) subtitle.textContent = '¡HAS EXTRAÍDO EL ESTANDARTE DEL VACÍO!';
  } else {
    if (emblem) emblem.textContent = '⚔️';
    if (title) { title.textContent = 'MISIÓN CONCLUIDA'; title.style.color = '#ff4a3d'; title.style.textShadow = '0 0 30px rgba(255,74,61,0.8)'; }
    if (subtitle) subtitle.textContent = `EL ESTANDARTE FUE EXTRAÍDO POR ${detail.winnerName || detail.winnerId}`;
  }

  if (modal) modal.classList.remove('oculto');
}

getEl('btnRevancha')?.addEventListener('click', () => {
  ocultarGameOverModal();
  jugar();
});

getEl('btnMenuPrincipal')?.addEventListener('click', () => {
  ocultarGameOverModal();
  mostrarMenu(true);
});

function normalizarUrlWebSocket(raw) {
  let v = String(raw || '').trim();
  if (!v) v = 'localhost';

  // Quitar esquema si fue ingresado
  v = v.replace(/^wss?:\/\//i, '').replace(/\/+$/, '');

  let host = v;
  let port = 5000;

  if (v.includes(':')) {
    const parts = v.split(':');
    host = parts[0] || 'localhost';
    const p = parseInt(parts[1], 10);
    if (!isNaN(p)) {
      port = (p === 8140) ? 5000 : p;
    }
  }

  // Siempre pasa por el Bridge local (puerto 8140), el cual reenvía por TCP a la IP/puerto indicados.
  return `ws://localhost:8140?targetHost=${encodeURIComponent(host)}&targetPort=${port}`;
}

async function jugar() {
  ocultarGameOverModal();
  if (cliente) cliente.detener();
  for (const k of knights.values()) scene.remove(k.group);
  knights.clear();
  $('feed').innerHTML = '';
  const nombre = $('nombre').value || 'Templario';
  cliente = new ClienteCaptura();

  cliente.addEventListener(TIPOS.GAME_STARTED, (e) => { construirTablero(e.detail); feed('▶ arena lista'); });
  cliente.addEventListener(TIPOS.GAME_STATE, (e) => { ultimoEstado = e.detail; sincronizar(e.detail); });
  cliente.addEventListener(TIPOS.FLAG_PICKED_UP, (e) => {
    feed(`⚑ ${e.detail.playerId} tomó la bandera`);
    const k = knights.get(e.detail.playerId);
    if (k) k.actionTime = 0.55; // animar reacción sin tirones
  });
  cliente.addEventListener(TIPOS.FLAG_STOLEN, (e) => {
    feed(`🔁 ${e.detail.newCarrierId} robó a ${e.detail.previousCarrierId}`);
    const vic = knights.get(e.detail.previousCarrierId);
    const atk = knights.get(e.detail.newCarrierId);
    if (vic) { vic.actionTime = 0.60; vic.actionType = 'stagger'; }
    if (atk) { atk.actionTime = 0.55; atk.actionType = 'grab'; }
  });
  cliente.addEventListener(TIPOS.PLAYER_DISCONNECTED, (e) => feed(`✂ ${e.detail.playerId} salió`));
  cliente.addEventListener(TIPOS.GAME_OVER, (e) => {
    feed(`🏆 ganó ${e.detail.winnerName}`);
    const winner = knights.get(e.detail.winnerId);
    if (winner) { winner.actionTime = 1.2; winner.actionType = 'grab'; }
    mostrarGameOverModal(e.detail);
  });
  cliente.addEventListener(TIPOS.ERROR, (e) => {
    feed(`✗ ${e.detail.code}`);
    if (e.detail.code === 'CONNECTION_LOST') estadoConexion('DESCONECTADO', '#ff4a3d');
  });

  try {
    if ($('modo').value === 'local') {
      estadoConexion('LOCAL (motor + bots)', '#46d38a');
      cliente.iniciarLocal({ nombre, bots: Number($('bots').value) || 0 });
      mostrarMenu(false); // a la arena
    } else {
      estadoConexion('CONECTANDO…', '#ffb638');
      feed('⏳ conectando…');
      const targetUrl = normalizarUrlWebSocket($('url').value);
      $('url').value = targetUrl;
      await cliente.conectar(targetUrl, nombre);
      estadoConexion('CONECTADO · ' + cliente.playerId, '#46d38a');
      feed('▶ conectado como ' + cliente.playerId);
      mostrarMenu(false); // conexión OK → entrar
    }
  } catch (err) {
    // Falló la conexión: se mantiene el menú visible para reintentar.
    estadoConexion('ERROR de conexión', '#ff4a3d');
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
    } else if (k.group.position.distanceTo(k.target) > CELL * 2.5) {
      // Salto grande (reingreso/reubicación del servidor): teletransporte
      // instantáneo en vez de "caminar" media arena. Un paso normal es 1 celda,
      // así que 2.5 celdas no puede confundirse con un movimiento legítimo.
      k.group.position.copy(k.target);
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
  const elYo = getEl('iYo'); if (elYo) elYo.textContent = yo ? `${cliente.playerId} [${yo.row},${yo.column}]${yo.hasFlag ? ' ⚑' : ''}` : (cliente?.playerId || '—');
  const elB = getEl('iBandera'); if (elB) elB.textContent = estado.flag.status;
  const elP = getEl('iPortador'); if (elP) elP.textContent = estado.flag.carrierId || 'LIBRE';
  const elT = getEl('iTick'); if (elT) elT.textContent = estado.tick;
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
    const speed = Math.min(dist / Math.max(dt, 0.001), CELL / INTERVALO_S); // limitar a 1 celda/ciclo real
    if (dist > 0.001) {
      const step = Math.min(dist, speed * dt);
      p.addScaledVector(_v.normalize(), step);
      k.yaw = Math.atan2(_v.x, _v.z); // mirar hacia donde camina
    }
    k.group.rotation.y += (k.yaw - k.group.rotation.y) * Math.min(1, dt * 8);
    if (k.actionTime > 0) {
      k.actionTime -= dt;
      if (k.actionType === 'stagger') k.anim.stagger(dt, t);
      else k.anim.grab(dt, 1 - Math.max(0, k.actionTime / 0.55));
    } else {
      k.anim.locomotion(dt, t, dist > 0.05 ? 2.4 : 0);
    }
  }

  // cámara sigue a mi caballero
  const yo = cliente ? knights.get(cliente.playerId) : null;
  if (yo) {
    _follow.lerp(_camT.set(yo.group.position.x, yo.group.position.y + 1.2, yo.group.position.z), Math.min(1, dt * 5));
    _tmp.subVectors(_follow, controls.target);
    controls.target.add(_tmp);
    camera.position.add(_tmp);
  }

  // ambiente vivo & monolitos
  cosmos.update(dt, t);
  titans.update(dt, t);
  for (const m of activeMonoliths) {
    if (m.userData?.update) m.userData.update(dt, t);
  }
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

// ---------- Precarga de Shaders & Materiales (Optimizador) ----------
function precargarShaders() {
  const dummyKnight = createKnight();
  dummyKnight.position.set(0, ARENA_FLOOR_Y, 0);
  scene.add(dummyKnight);

  const dummyBanner = createCyberBanner();
  dummyBanner.position.set(0, ARENA_FLOOR_Y, 0);
  scene.add(dummyBanner);

  const dummyMonolith = createVoidMonolith(1.8, 0);
  dummyMonolith.position.set(0, ARENA_FLOOR_Y, 0);
  scene.add(dummyMonolith);

  // Compilar la escena y programas de shaders en WebGL de antemano
  renderer.compile(scene, camera);

  scene.remove(dummyKnight);
  scene.remove(dummyBanner);
  scene.remove(dummyMonolith);
}
precargarShaders();

// exponer para depurar / verificación sin rAF
window.__captura = {
  get cliente() { return cliente; },
  knights, scene, camera,
  frame,                                   // paso manual de un frame
  canvas: renderer.domElement,
};
