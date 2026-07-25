// ============================================================================
//  Visor 3D del PRFC v3 — el juego oficial renderizado en el mundo de
//  BladeFront, reutilizando los assets que ya existen: arena, cosmos, titanes,
//  caballeros, estandarte, luces y bloom.
//
//  El protocolo trabaja en un plano continuo de 2000×2000 con y creciendo hacia
//  abajo (§5). Aquí eso se mapea al plano XZ de three.js con una escala fija,
//  así que dos clientes distintos dibujan exactamente la misma partida aunque
//  uno renderice en 2D y el otro en 3D.
//
//  La mecánica es la oficial: la bandera nace en el centro (§7) y se gana
//  sacándola del círculo central (§16). Nada de la lógica vive aquí — el visor
//  solo escucha eventos del cliente y dibuja.
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

import { ClienteV3 } from './cliente-v3.js';
import { TIPOS, DIRECCIONES, ESTADO_BANDERA, PARAMS_DEFECTO } from '../../../red/v3/protocolo-v3.js';

// ---------------------------------------------------------------------------
//  Render, escena y cámara
// ---------------------------------------------------------------------------
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
controls.minDistance = 8;
controls.maxDistance = 90;
controls.maxPolarAngle = Math.PI * 0.49;

// ---------------------------------------------------------------------------
//  Arena y ambiente (los mismos assets del resto del proyecto)
// ---------------------------------------------------------------------------
const arena = createArena();
const ARENA_SCALE = 1.85;
arena.scale.set(ARENA_SCALE, 1, ARENA_SCALE);
const R = ARENA_RADIUS * ARENA_SCALE; // ~20.7 unidades de mundo
scene.add(arena);
const runeMat = arena.userData.runeMaterial;
const emblemMat = arena.userData.emblemMaterial;

const cosmos = createCosmos();
scene.add(cosmos.group);
const titans = createTitans();
scene.add(titans.group);

const key = new THREE.SpotLight(0xe6f0ff, 7000, 170, 0.46, 0.55, 1.8);
key.position.set(0, 48, 6); key.target.position.set(0, 0, 0);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
scene.add(key, key.target);
const rimCyan = new THREE.DirectionalLight(0x49e6ff, 10);
rimCyan.position.set(-45, 32, -75); scene.add(rimCyan);
const goldGlow = new THREE.PointLight(0xffb638, 110, 42, 1.8);
goldGlow.position.set(0, 2.2, 0); scene.add(goldGlow);
scene.add(new THREE.HemisphereLight(0x22303c, 0x04050a, 0.26));

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.62, 0.72, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------------------
//  Mapeo mundo-de-juego → mundo-3D
//
//  El mapa del protocolo es un cuadrado de mapSize de lado; la arena es un
//  disco. Se escala para que el BORDE del mapa quede dentro del disco: solo
//  las cuatro esquinas sobresalen, y son puntos a los que no se llega en juego
//  normal porque la partida acaba al salir del círculo central.
// ---------------------------------------------------------------------------
const SUELO_Y = 0.42;             // altura del piso de la arena
let cfg = { ...PARAMS_DEFECTO };
let ESCALA = 0.017;               // unidades de mundo por unidad de juego
let ESCALA_KNIGHT = 0.55;

function recalcularEscala() {
  ESCALA = (R * 0.85) / (cfg.mapSize / 2);
  // El caballero se dimensiona contra el círculo central, que es la referencia
  // visual del juego: ni un muñeco perdido ni uno que lo tape entero.
  ESCALA_KNIGHT = Math.max(0.28, Math.min(0.95, cfg.circleRadius * ESCALA * 0.075));
}
recalcularEscala();

const _v = new THREE.Vector3();
// (x, y) del juego → posición de mundo. y del juego (que crece hacia abajo)
// se convierte en z, que en la vista cenital crece hacia el observador.
function aMundo(x, y, out = new THREE.Vector3()) {
  return out.set(x * ESCALA, SUELO_Y, y * ESCALA);
}

// ---------------------------------------------------------------------------
//  Círculo central y borde del mapa
// ---------------------------------------------------------------------------
const anilloCirculo = new THREE.Mesh(
  new THREE.RingGeometry(1, 1.02, 128),
  new THREE.MeshBasicMaterial({ color: 0xffb638, transparent: true, opacity: 0.5, side: THREE.DoubleSide, fog: false })
);
anilloCirculo.rotation.x = -Math.PI / 2;
anilloCirculo.position.y = SUELO_Y + 0.02;
scene.add(anilloCirculo);

// Muro de luz sobre el borde del círculo: es la línea que hay que cruzar para
// ganar, así que conviene que se vea desde cualquier ángulo de cámara.
const muroCirculo = new THREE.Mesh(
  new THREE.CylinderGeometry(1, 1, 1, 128, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0xffb638, transparent: true, opacity: 0.07, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  })
);
scene.add(muroCirculo);

const bordeMapa = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)),
  new THREE.LineBasicMaterial({ color: 0x49e6ff, transparent: true, opacity: 0.22, fog: false })
);
bordeMapa.rotation.x = -Math.PI / 2;
bordeMapa.position.y = SUELO_Y + 0.01;
scene.add(bordeMapa);

function colocarGeometriaDelMapa() {
  const rc = cfg.circleRadius * ESCALA;
  anilloCirculo.scale.setScalar(rc);
  muroCirculo.scale.set(rc, 1, rc);
  muroCirculo.position.y = SUELO_Y + 0.5;
  muroCirculo.geometry.dispose();
  muroCirculo.geometry = new THREE.CylinderGeometry(1, 1, 1, 128, 1, true);
  const lado = cfg.mapSize * ESCALA;
  bordeMapa.scale.set(lado, lado, 1);
}
colocarGeometriaDelMapa();

// ---------------------------------------------------------------------------
//  Bandera y caballeros
// ---------------------------------------------------------------------------
let banner = createCyberBanner();
banner.scale.setScalar(0.75);
scene.add(banner);

const haz = new THREE.Mesh(
  new THREE.CylinderGeometry(0.35, 0.6, 11, 24, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0xffb638, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  })
);
haz.position.y = SUELO_Y + 5.5;
scene.add(haz);

const knights = new Map(); // playerId -> { group, anim, target, yaw, ... }

function asegurarKnight(id) {
  let k = knights.get(id);
  if (!k) {
    const group = createKnight();
    group.scale.setScalar(ESCALA_KNIGHT);
    group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(group);

    // Anillo bajo los pies: con 12 caballeros iguales hace falta algo que
    // distinga el propio de un vistazo.
    const marca = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.68, 32),
      new THREE.MeshBasicMaterial({ color: 0x49e6ff, transparent: true, opacity: 0, side: THREE.DoubleSide, fog: false })
    );
    marca.rotation.x = -Math.PI / 2;
    marca.position.y = SUELO_Y + 0.03;
    scene.add(marca);

    k = {
      group, marca, anim: new KnightAnimator(group),
      target: new THREE.Vector3(), yaw: 0,
      colocado: false, accion: 0,
    };
    knights.set(id, k);
  }
  return k;
}

function quitarKnight(id) {
  const k = knights.get(id);
  if (!k) return;
  scene.remove(k.group, k.marca);
  knights.delete(id);
}

function limpiarKnights() {
  for (const id of [...knights.keys()]) quitarKnight(id);
}

// ---------------------------------------------------------------------------
//  HUD
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const NOMBRE_ESTADO_BANDERA = {
  [ESTADO_BANDERA.AVAILABLE]: 'LIBRE',
  [ESTADO_BANDERA.CARRIED]: 'EN JUEGO',
  [ESTADO_BANDERA.DROPPED]: 'CAÍDA',
  [ESTADO_BANDERA.OUTSIDE]: 'EXTRAÍDA',
};

function aviso(txt) {
  const ul = $('feed');
  if (!ul) return;
  const li = document.createElement('li');
  li.textContent = txt;
  ul.prepend(li);
  while (ul.children.length > 8) ul.lastChild.remove();
}

function bandera(txt) {
  const el = $('banda');
  if (!el) return;
  el.textContent = txt;
  el.classList.remove('oculto');
  clearTimeout(bandera._t);
  bandera._t = setTimeout(() => el.classList.add('oculto'), 2200);
}

// ---------------------------------------------------------------------------
//  Cliente y suscripciones
// ---------------------------------------------------------------------------
const cliente = new ClienteV3();
let miId = 0;
let terminada = false;

const on = (tipo, fn) => cliente.addEventListener(String(tipo), (e) => fn(e.detail));

on(TIPOS.JOIN_ACCEPTED, (m) => {
  miId = m.playerId;
  $('iYo').textContent = `#${m.playerId}`;
  $('iConn').textContent = cliente.modo === 'local' ? 'Local' : 'Conectado';
});

on(TIPOS.JOIN_REJECTED, (m) => {
  const razones = {
    1: 'la partida ya empezó', 2: 'la partida está llena',
    3: 'nombre inválido', 4: 'versión de protocolo incompatible',
  };
  bandera('Rechazado: ' + (razones[m.reason] ?? m.reason));
  $('iConn').textContent = 'Rechazado';
});

on(TIPOS.LOBBY_STATE, (m) => {
  $('iJugadores').textContent = m.players.length;
  aviso(`Lobby: ${m.players.length} jugador(es)`);
});

on(TIPOS.GAME_COUNTDOWN, (m) => bandera(`Comienza en ${m.secondsRemaining}…`));

on(TIPOS.GAME_STARTED, (m) => {
  terminada = false;
  cfg = { ...cfg, ...m };
  recalcularEscala();
  colocarGeometriaDelMapa();
  limpiarKnights();
  $('modalFin')?.classList.add('oculto');
  banner.scale.setScalar(Math.max(0.4, ESCALA_KNIGHT * 1.3));

  for (const p of m.players) {
    const k = asegurarKnight(p.playerId);
    k.group.scale.setScalar(ESCALA_KNIGHT);
    aMundo(p.x, p.y, k.target);
    k.group.position.copy(k.target); // aparecer YA en su sitio, sin deslizarse
    k.colocado = true;
    if (p.playerId === miId) k.marca.material.opacity = 0.55;
  }
  bandera('¡A la arena!');
  aviso(`Partida iniciada · ${m.players.length} caballeros`);
});

on(TIPOS.GAME_STATE, (m) => {
  $('iTick').textContent = m.tick;
  $('iBandera').textContent = NOMBRE_ESTADO_BANDERA[m.flagStatus] ?? '—';
  $('iPortador').textContent = m.flagCarrierId ? cliente.nombreDe(m.flagCarrierId) : '—';
  $('iJugadores').textContent = m.players.length;

  const vistos = new Set();
  for (const p of m.players) {
    vistos.add(p.playerId);
    const k = asegurarKnight(p.playerId);
    aMundo(p.x, p.y, k.target);
    if (!k.colocado) { k.group.position.copy(k.target); k.colocado = true; }
    // Un salto enorme solo puede venir de un reinicio o de un estado perdido:
    // interpolar eso haría cruzar la arena flotando.
    else if (k.group.position.distanceTo(k.target) > cfg.circleRadius * ESCALA) {
      k.group.position.copy(k.target);
    }
    k.llevaBandera = p.hasFlag;
    if (p.playerId === miId) k.marca.material.opacity = 0.55;
  }
  // Quien ya no aparece en el estado se fue (§17).
  for (const id of [...knights.keys()]) if (!vistos.has(id)) quitarKnight(id);

  // La bandera: sobre su portador, o en el suelo donde esté.
  const visible = m.flagStatus !== ESTADO_BANDERA.OUTSIDE;
  banner.visible = visible;
  haz.visible = visible && m.flagStatus !== ESTADO_BANDERA.CARRIED;
  if (visible) {
    aMundo(m.flagX, m.flagY, _v);
    banner.position.set(_v.x, SUELO_Y, _v.z);
    haz.position.set(_v.x, SUELO_Y + 5.5, _v.z);
  }
});

on(TIPOS.FLAG_PICKED_UP, (m) => {
  const k = knights.get(m.playerId);
  if (k) k.accion = 0.55;
  aviso(`${cliente.nombreDe(m.playerId)} toma la bandera`);
  if (m.playerId === miId) bandera('¡Tienes la bandera! Sal del círculo');
});

on(TIPOS.FLAG_STOLEN, (m) => {
  const k = knights.get(m.previousCarrierId);
  if (k) k.accion = 0.45;
  aviso(`${cliente.nombreDe(m.newCarrierId)} se la roba a ${cliente.nombreDe(m.previousCarrierId)}`);
  if (m.newCarrierId === miId) bandera('¡Se la robaste!');
  else if (m.previousCarrierId === miId) bandera('¡Te robaron la bandera!');
});

on(TIPOS.PLAYER_DISCONNECTED, (m) => {
  aviso(`${cliente.nombreDe(m.playerId)} abandona`);
  quitarKnight(m.playerId);
});

on(TIPOS.GAME_OVER, (m) => {
  terminada = true;
  const gane = m.winnerId === miId;
  bandera(gane ? '¡VICTORIA!' : `Gana ${m.winnerName}`);
  aviso(`Fin · gana ${m.winnerName}`);
  $('finTitulo').textContent = gane ? 'VICTORIA' : 'DERROTA';
  $('finEmblema').textContent = gane ? '👑' : '⚔️';
  $('finGanador').textContent = m.winnerName || `#${m.winnerId}`;
  $('finId').textContent = `#${m.winnerId}`;
  $('finTick').textContent = cliente.estado?.tick ?? '—';
  $('modalFin')?.classList.remove('oculto');
});

on(TIPOS.ERROR, (m) => {
  aviso('Error: ' + (m.description || m.code));
  $('iConn').textContent = 'Error';
  bandera(m.description || 'Error de red');
});

// ---------------------------------------------------------------------------
//  Entrada del jugador
//
//  Solo se manda una dirección cuando CAMBIA: el protocolo es de intención
//  persistente (§10, el jugador sigue avanzando hasta que diga otra cosa),
//  así que repetirla cada frame solo sería ruido en la red.
// ---------------------------------------------------------------------------
const teclas = new Set();
const MAPA_TECLAS = {
  KeyW: DIRECCIONES.UP, ArrowUp: DIRECCIONES.UP,
  KeyS: DIRECCIONES.DOWN, ArrowDown: DIRECCIONES.DOWN,
  KeyA: DIRECCIONES.LEFT, ArrowLeft: DIRECCIONES.LEFT,
  KeyD: DIRECCIONES.RIGHT, ArrowRight: DIRECCIONES.RIGHT,
};
let ultimaDireccion = DIRECCIONES.NONE;

function recalcularDireccion() {
  // Gana la última tecla pulsada que siga presionada: si el jugador mantiene W
  // y luego pulsa D, va a la derecha, y al soltar D vuelve a subir.
  let dir = DIRECCIONES.NONE;
  for (const code of teclas) if (MAPA_TECLAS[code]) dir = MAPA_TECLAS[code];
  if (dir !== ultimaDireccion) {
    ultimaDireccion = dir;
    cliente.mandarDireccion(dir);
  }
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyE' || e.code === 'Space') {
    e.preventDefault();
    cliente.interactuar();
    const k = knights.get(miId);
    if (k) k.accion = 0.4;
    return;
  }
  if (!MAPA_TECLAS[e.code]) return;
  e.preventDefault();
  teclas.add(e.code);
  recalcularDireccion();
});

window.addEventListener('keyup', (e) => {
  if (!MAPA_TECLAS[e.code]) return;
  teclas.delete(e.code);
  recalcularDireccion();
});

window.addEventListener('blur', () => { teclas.clear(); recalcularDireccion(); });

// ---------------------------------------------------------------------------
//  Bucle de render
// ---------------------------------------------------------------------------
const reloj = new THREE.Clock();
const _seguir = new THREE.Vector3(0, 1, 0);
const _camT = new THREE.Vector3();
const _tmp = new THREE.Vector3();
let fpsN = 0, fpsT = 0;

// Velocidad máxima de interpolación: exactamente la del juego. Así el caballero
// llega a su destino justo cuando llega el siguiente estado, sin adelantarse
// (que provocaría tirones al corregir) ni quedarse corto (que sería ir a
// remolque de forma permanente).
function velocidadMaxima() {
  return cfg.playerSpeed * ESCALA;
}

function frame(dtForzado) {
  const dt = dtForzado != null ? dtForzado : Math.min(reloj.getDelta(), 0.05);
  const t = reloj.elapsedTime;

  for (const k of knights.values()) {
    const p = k.group.position;
    _v.subVectors(k.target, p); _v.y = 0;
    const d = _v.length();
    if (d > 0.0005) {
      const paso = Math.min(d, velocidadMaxima() * dt);
      p.addScaledVector(_v.normalize(), paso);
      k.yaw = Math.atan2(_v.x, _v.z);
    }
    k.group.rotation.y += (k.yaw - k.group.rotation.y) * Math.min(1, dt * 8);
    k.marca.position.set(p.x, SUELO_Y + 0.03, p.z);

    if (k.accion > 0) {
      k.accion -= dt;
      k.anim.grab(dt, 1 - Math.max(0, k.accion / 0.55));
    } else {
      k.anim.locomotion(dt, t, d > 0.02 ? 2.4 : 0);
    }
  }

  // La cámara sigue al caballero propio.
  const yo = knights.get(miId);
  if (yo) {
    _camT.set(yo.group.position.x, yo.group.position.y + 1.2, yo.group.position.z);
    _seguir.lerp(_camT, Math.min(1, dt * 5));
    _tmp.subVectors(_seguir, controls.target);
    controls.target.add(_tmp);
    camera.position.add(_tmp);
  }

  cosmos.update(dt, t);
  titans.update(dt, t);
  if (arena.userData.update) arena.userData.update(dt, t);
  if (banner?.userData?.update) banner.userData.update(dt, t);

  // El anillo late más fuerte cuando alguien lleva la bandera: es el momento
  // en que esa línea importa.
  const enJuego = cliente.estado?.flagStatus === ESTADO_BANDERA.CARRIED;
  anilloCirculo.material.opacity = (enJuego ? 0.72 : 0.42) + Math.sin(t * (enJuego ? 5 : 2)) * 0.12;
  muroCirculo.material.opacity = (enJuego ? 0.11 : 0.055) + Math.sin(t * (enJuego ? 5 : 2)) * 0.02;
  haz.material.opacity = 0.06 + Math.sin(t * 2.4) * 0.02;
  runeMat.emissiveIntensity = 3.3 + Math.sin(t * 1.25) * 0.5;
  emblemMat.emissiveIntensity = 1.1 + Math.sin(t * 1.25 + 0.9) * 0.25;

  fpsN++; fpsT += dt;
  if (fpsT >= 0.5) { $('iFps').textContent = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }

  controls.update();
  composer.render();
}

renderer.setAnimationLoop(() => frame());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
//  Menú
// ---------------------------------------------------------------------------
function entrar() {
  const nombre = ($('nombre').value || 'Templario').trim().slice(0, 20);
  const modo = $('modo').value;
  miId = 0;
  terminada = false;
  limpiarKnights();
  $('menu').classList.add('oculto');
  $('modalFin')?.classList.add('oculto');
  $('feed').innerHTML = '';

  if (modo === 'local') {
    const bots = Math.max(0, Math.min(20, Number($('bots').value) || 0));
    const inmunidad = Number($('inmunidad').value) || 0;
    cliente.iniciarLocal({ nombre, bots, params: { protectionTimeMs: inmunidad } });
    aviso(`Modo local · ${bots} bots · inmunidad ${inmunidad} ms`);
  } else {
    const url = ($('url').value || 'ws://localhost:8146').trim();
    const host = ($('host').value || '').trim();
    const port = Number($('puerto').value) || 0;
    $('iConn').textContent = 'Conectando…';
    cliente.conectar({ url, nombre, host: host || undefined, port: port || undefined });
    aviso(`Conectando por ${url}`);
  }
}

function alMenu() {
  cliente.detener();
  limpiarKnights();
  miId = 0;
  $('menu').classList.remove('oculto');
  $('modalFin')?.classList.add('oculto');
  $('iConn').textContent = '—';
}

$('jugar').addEventListener('click', entrar);
$('reset').addEventListener('click', alMenu);
$('finMenu')?.addEventListener('click', alMenu);
$('finOtra')?.addEventListener('click', () => { $('modalFin').classList.add('oculto'); entrar(); });

// Buscar servidores en la red (el bridge hace el broadcast por nosotros).
$('buscar')?.addEventListener('click', async () => {
  const lista = $('listaServidores');
  const base = ($('url').value || 'ws://localhost:8146').replace(/^ws/, 'http').split('?')[0];
  lista.innerHTML = '<li class="vacio">Buscando…</li>';
  try {
    const servidores = await ClienteV3.buscarServidores(base);
    if (!servidores.length) {
      lista.innerHTML = '<li class="vacio">Ningún servidor respondió</li>';
      return;
    }
    lista.innerHTML = '';
    for (const s of servidores) {
      const li = document.createElement('li');
      li.innerHTML = `<b>${s.serverName}</b> <span>${s.host}:${s.tcpPort} · ${s.playerCount}/${s.maximumPlayers}</span>`;
      li.addEventListener('click', () => {
        $('host').value = s.host;
        $('puerto').value = s.tcpPort;
        for (const otro of lista.children) otro.classList.remove('on');
        li.classList.add('on');
      });
      lista.appendChild(li);
    }
  } catch (e) {
    lista.innerHTML = `<li class="vacio">No respondió el bridge (${e.message})</li>`;
  }
});

// Gancho de depuración: permite inspeccionar y avanzar cuadros a mano desde la
// consola sin depender del bucle de animación del navegador.
window.__v3 = { cliente, knights, scene, camera, frame, get cfg() { return cfg; }, aMundo, renderer };
