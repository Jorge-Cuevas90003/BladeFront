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
import { crearMonumentos } from '../../arena-vacio/js/monumentos.js';

import { ClienteV3 } from './cliente-v3.js';
import { crearVisor2D } from './visor-2d.js';
import { TIPOS, DIRECCIONES, ESTADO_BANDERA, ESTADO_PARTIDA, ERRORES, PARAMS_DEFECTO } from '../../../red/v3/protocolo-v3.js';

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
// Mismos valores que el visor de rejilla. Un radio alto (0.72) desparrama el
// brillo y lava el detalle de la armadura: 0.35 mantiene el halo pegado a la
// fuente y la imagen nítida.
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.35, 0.8);
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

// ---------------------------------------------------------------------------
//  Los Doce Testigos
//
//  Efigies de mármol de campeones caídos. El PRFC v3 no tiene obstáculos, así
//  que NO son parte del juego: van en un anillo fuera del círculo de victoria,
//  donde no estorban la vista de la zona donde ocurre todo, pero dan escala y
//  referencia de profundidad justo al cruzar el borde.
//
//  Se generan con semilla fija: las mismas doce estatuas en cada recarga.
// ---------------------------------------------------------------------------
let testigos = null;
function colocarMonumentos() {
  const rc = cfg.circleRadius * ESCALA;
  const radio = Math.min(R * 0.88, rc + (R - rc) * 0.6);
  const escala = Math.max(0.5, Math.min(1.15, (R - rc) * 0.16));
  if (testigos) {
    testigos.group.scale.setScalar(escala);
    return;
  }
  testigos = crearMonumentos({ cantidad: 12, radio, escala });
  testigos.group.position.y = SUELO_Y;
  scene.add(testigos.group);
}
colocarMonumentos();

const knights = new Map(); // playerId -> { group, anim, target, yaw, etiqueta, ... }

function crearEtiquetaNombre(texto, esPropio = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = esPropio ? 'rgba(12, 40, 55, 0.85)' : 'rgba(12, 16, 26, 0.8)';
  ctx.strokeStyle = esPropio ? '#49e6ff' : '#ffb638';
  ctx.lineWidth = 4;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(8, 8, 240, 48, 12);
  else ctx.rect(8, 8, 240, 48);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 24px "Outfit", sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = esPropio ? '#49e6ff' : '#ffffff';
  ctx.fillText(texto, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(3.6, 0.9, 1);
  sprite.position.set(0, 4.2, 0);
  return sprite;
}

function asegurarKnight(id, nombreManual = null) {
  let k = knights.get(id);
  const nombre = nombreManual || cliente.nombreDe(id) || `Jugador #${id}`;
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

    const etiqueta = crearEtiquetaNombre(nombre, id === miId);
    group.add(etiqueta);

    k = {
      group, marca, etiqueta, anim: new KnightAnimator(group),
      target: new THREE.Vector3(), yaw: 0,
      serverPosition: new THREE.Vector3(),
      serverDirection: DIRECCIONES.NONE,
      serverStateAt: 0,
      colocado: false, accion: 0, nombre,
    };
    knights.set(id, k);
  } else if (nombre && k.nombre !== nombre) {
    k.group.remove(k.etiqueta);
    try { k.etiqueta.material.map.dispose(); k.etiqueta.material.dispose(); } catch {}
    k.etiqueta = crearEtiquetaNombre(nombre, id === miId);
    k.group.add(k.etiqueta);
    k.nombre = nombre;
  }
  return k;
}

function quitarKnight(id) {
  const k = knights.get(id);
  if (!k) return;
  if (k.etiqueta) {
    try { k.etiqueta.material.map.dispose(); k.etiqueta.material.dispose(); } catch {}
  }
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

// Vista 2D cruda sobre el mismo cliente: dibuja el GAME_STATE sin interpolar,
// así que sirve para ver qué está mandando de verdad el servidor cuando el 3D
// y el servidor de otro equipo no coinciden.
const visor2D = crearVisor2D(document.getElementById('mapa2d'), cliente);
let miId = 0;
let terminada = false;

const on = (tipo, fn) => cliente.addEventListener(String(tipo), (e) => fn(e.detail));

on(TIPOS.JOIN_ACCEPTED, (m) => {
  miId = m.playerId;
  const s = $('salaServidor');
  if (s) s.textContent = cliente.modo === 'red'
    ? `${$('host').value || 'servidor'}:${$('puerto').value || ''} · eres #${m.playerId}`
    : 'partida local';
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
  aviso(`Sala: ${m.players.length} jugador(es)`);
  pintarSala(m.players);
});

// ---------------------------------------------------------------------------
//  Sala de espera
//
//  Existe porque el servidor rechaza a todo el mundo en cuanto la partida pasa
//  a STARTING (§20 + GAME_ALREADY_STARTED). Si arrancara con el primer jugador,
//  el anfitrión se quedaría jugando solo y nadie podría unirse. Aquí se espera
//  a que estén todos y es él quien decide.
// ---------------------------------------------------------------------------
function pintarSala(jugadores) {
  if (cliente.modo !== 'red' || terminada) return;
  const ul = $('salaJugadores');
  // Quién manda lo dice el SERVIDOR (cliente.hostId), no el id más bajo: el
  // anfitrión es quien aloja la partida en su máquina, y puede haber entrado
  // después que un compañero.
  const anfitrion = cliente.hostId;
  ul.innerHTML = jugadores.map((p) => {
    const etiquetas = [];
    if (p.playerId === anfitrion) etiquetas.push('<span class="tag anfitrion">ANFITRIÓN</span>');
    if (p.playerId === miId) etiquetas.push('<span class="tag tu">TÚ</span>');
    return `<li><span>${p.name}</span><span>${etiquetas.join(' ')}</span></li>`;
  }).join('') || '<li><span>nadie todavía…</span><span></span></li>';

  const soyYo = cliente.soyAnfitrion;
  $('salaEmpezar').style.display = soyYo ? '' : 'none';
  const nombreAnfitrion = anfitrion
    ? (jugadores.find((p) => p.playerId === anfitrion)?.name ?? `#${anfitrion}`)
    : null;
  $('salaAviso').textContent = soyYo
    ? `Cuando estén todos, empieza tú. Ahora mismo sois ${jugadores.length}.`
    : nombreAnfitrion
      ? `Esperando a que ${nombreAnfitrion} empiece la partida…`
      // Sin anfitrión conectado nadie puede dar la salida: el dueño de la
      // partida tiene que entrar desde su propia máquina.
      : 'El anfitrión no está conectado. La partida no puede empezar hasta que entre.';
  // Precargar modelos 3D y compilar WebGL shaders durante la espera
  for (const p of jugadores) {
    const k = asegurarKnight(p.playerId);
    if (!k.colocado) k.group.position.set(0, -999, 0);
  }
  try { renderer.compile(scene, camera); } catch {}

  $('sala').classList.remove('oculto');
}

function cerrarSala() { $('sala').classList.add('oculto'); }

$('salaEmpezar')?.addEventListener('click', () => {
  $('salaEmpezar').disabled = true;
  $('salaAviso').textContent = 'Empezando…';
  cliente.pedirInicio();
  // Si el servidor no acepta la petición hay que poder reintentar, no dejar el
  // botón muerto para siempre.
  setTimeout(() => { $('salaEmpezar').disabled = false; }, 2500);
});
$('salaSalir')?.addEventListener('click', volverAlMenu);

on(0x7d, () => {   // HOST_INFO: el servidor dice quién manda
  if (cliente._lobby?.players) pintarSala(cliente._lobby.players);
});

on(TIPOS.GAME_COUNTDOWN, (m) => {
  console.log('%c[JUEGO]%c ⏳ Conteo regresivo: ' + m.secondsRemaining + 's...', 'background: #ec4899; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;', 'color: inherit');
  bandera(`Comienza en ${m.secondsRemaining}…`);
  $('salaAviso').textContent = `Comienza en ${m.secondsRemaining}…`;
  try { renderer.compile(scene, camera); } catch {}
});

on(TIPOS.GAME_STARTED, (m) => {
  console.log('%c[JUEGO]%c 🚀 ¡Partida iniciada! Configuración y jugadores:', 'background: #22c55e; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;', 'color: inherit', m);
  terminada = false;
  cerrarSala();
  cfg = { ...cfg, ...m };
  recalcularEscala();
  colocarGeometriaDelMapa();
  colocarMonumentos(); // el anillo depende de circleRadius, que llega en §29.5
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
  // Una tecla puede quedar presionada durante la cuenta regresiva. En ese
  // caso el servidor descarta el INPUT previo porque la partida aún no había
  // empezado; reenviarlo aquí evita que solo se mueva la predicción local.
  recalcularDireccion(true);
  bandera('¡A la arena!');
  aviso(`Partida iniciada · ${m.players.length} caballeros`);
});

on(TIPOS.GAME_STATE, (m) => {
  $('iTick').textContent = m.tick;
  $('iBandera').textContent = NOMBRE_ESTADO_BANDERA[m.flagStatus] ?? '—';
  $('iPortador').textContent = m.flagCarrierId ? cliente.nombreDe(m.flagCarrierId) : '—';
  $('iJugadores').textContent = m.players.length;

  const vistos = new Set();
  const _vTarget = new THREE.Vector3();
  for (const p of m.players) {
    vistos.add(p.playerId);
    const k = asegurarKnight(p.playerId);
    aMundo(p.x, p.y, _vTarget);
    k.serverPosition.copy(_vTarget);
    k.serverDirection = p.direction;
    k.serverStateAt = performance.now();
    if (!k.colocado) {
      k.group.position.copy(_vTarget);
      k.target.copy(_vTarget);
      k.colocado = true;
    } else {
      // Un salto enorme es una reaparición o corrección excepcional. El
      // movimiento normal se interpola en frame() desde serverPosition.
      if (k.group.position.distanceTo(_vTarget) > cfg.circleRadius * ESCALA) {
        k.group.position.copy(_vTarget);
      }
      k.target.copy(_vTarget);
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
  console.log('%c[BANDERA]%c 🚩 Bandera tomada por: ' + cliente.nombreDe(m.playerId) + ' (#' + m.playerId + ')', 'background: #ef4444; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;', 'color: inherit');
  const k = knights.get(m.playerId);
  if (k) k.accion = 0.55;
  aviso(`${cliente.nombreDe(m.playerId)} toma la bandera`);
  if (m.playerId === miId) bandera('¡Tienes la bandera! Sal del círculo');
});

on(TIPOS.FLAG_STOLEN, (m) => {
  console.log('%c[BANDERA]%c ⚔️ Bandera ROBADA por ' + cliente.nombreDe(m.newCarrierId) + ' a ' + cliente.nombreDe(m.previousCarrierId), 'background: #dc2626; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;', 'color: inherit');
  const k = knights.get(m.previousCarrierId);
  if (k) k.accion = 0.45;
  aviso(`${cliente.nombreDe(m.newCarrierId)} se la roba a ${cliente.nombreDe(m.previousCarrierId)}`);
  if (m.newCarrierId === miId) bandera('¡Se la robaste!');
  else if (m.previousCarrierId === miId) bandera('¡Te robaron la bandera!');
});

on(TIPOS.PLAYER_DISCONNECTED, (m) => {
  console.log('%c[RED]%c 🚪 Jugador desconectado: #' + m.playerId, 'background: #64748b; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;', 'color: inherit');
  aviso(`${cliente.nombreDe(m.playerId)} abandona`);
  quitarKnight(m.playerId);
});

on(TIPOS.GAME_OVER, (m) => {
  console.log('%c[JUEGO]%c 🏆 ¡PARTIDA FINALIZADA! Ganador: ' + m.winnerName + ' (ID #' + m.winnerId + ')', 'background: #eab308; color: black; padding: 2px 6px; border-radius: 4px; font-weight: bold;', 'color: inherit', m);
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
  console.warn('%c[ERROR]%c 🚨 Error reportado por el servidor:', 'background: #dc2626; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;', 'color: inherit', m);
});

on(TIPOS.ERROR, (m) => {
  // Al acabar la partida el servidor avisa con GAME_FINISHED y cierra la
  // conexión: eso NO es un fallo, es el final previsto. Si se pinta como error
  // el jugador ve "Error: se perdió la conexión" justo encima del cartel de
  // victoria y parece que se ha roto algo.
  if (terminada || m.code === ERRORES.GAME_FINISHED) {
    $('iConn').textContent = 'Partida cerrada';
    aviso('La partida ha terminado');
    // Si el modal de resultado no llegó a salir (por ejemplo, porque el
    // anfitrión canceló), al menos que quede claro por qué se cortó.
    if (!terminada) bandera(m.description || 'La partida ha terminado');
    return;
  }
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

// Intención en el marco de la CÁMARA, no del mundo: [lateral, frontal].
// W siempre es "hacia donde miro", pase lo que pase con la órbita.
const INTENCION = {
  KeyW: [0, 1],  ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0],  ArrowRight: [1, 0],
};
let ultimaDireccion = DIRECCIONES.NONE;
let ultimoInputEnviadoEn = 0;
const INTERVALO_HEARTBEAT_INPUT = 100;
let interactuando = false;
let ultimoInteractEnviadoEn = 0;

const _adelante = new THREE.Vector3();

// Convierte la intención relativa a la cámara en una de las cuatro direcciones
// cardinales del protocolo (§10, sin diagonales).
//
// Antes WASD apuntaba directamente a ejes del MUNDO, y como la cámara orbita
// libremente bastaba girarla media vuelta para que W moviera al caballero
// hacia el jugador. Los controles parecían rotos sin estarlo. Ahora se
// proyecta la intención sobre el suelo usando hacia dónde mira la cámara y se
// ajusta al eje dominante, que es lo máximo que permite el protocolo.
function direccionDesdeCamara(lateral, frontal) {
  camera.getWorldDirection(_adelante);
  _adelante.y = 0;
  if (_adelante.lengthSq() < 1e-6) _adelante.set(0, 0, -1); // cámara cenital pura
  _adelante.normalize();

  // "Derecha" es "adelante" girado un cuarto de vuelta sobre el plano del suelo.
  const dx = _adelante.x * frontal + (-_adelante.z) * lateral;
  const dz = _adelante.z * frontal + (_adelante.x) * lateral;

  if (Math.abs(dx) >= Math.abs(dz)) return dx >= 0 ? DIRECCIONES.RIGHT : DIRECCIONES.LEFT;
  // La z del mundo es la y del juego, que crece hacia abajo (§5).
  return dz >= 0 ? DIRECCIONES.DOWN : DIRECCIONES.UP;
}

function recalcularDireccion(forzar = false) {
  // Gana la última tecla pulsada que siga presionada: si se mantiene W y luego
  // se pulsa D, va a la derecha, y al soltar D vuelve a subir.
  let intencion = null;
  for (const code of teclas) if (INTENCION[code]) intencion = INTENCION[code];

  const dir = intencion
    ? direccionDesdeCamara(intencion[0], intencion[1])
    : DIRECCIONES.NONE;

  const ahora = performance.now();
  const cambio = dir !== ultimaDireccion;
  if (cambio) {
    ultimaDireccion = dir;
  }
  const heartbeat = dir !== DIRECCIONES.NONE
    && ahora - ultimoInputEnviadoEn >= INTERVALO_HEARTBEAT_INPUT;
  if (cambio || forzar || heartbeat) {
    cliente.mandarDireccion(dir);
    ultimoInputEnviadoEn = ahora;
  }
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    if (e.repeat) return;
    const p = document.getElementById('panel2d');
    p.classList.toggle('oculto');
    if (!p.classList.contains('oculto')) visor2D.ajustar();
    return;
  }
  if (e.code === 'KeyE' || e.code === 'Space') {
    e.preventDefault();
    // Mantener pulsado sigue interactuando. El servidor descarta las repetidas
    // dentro del mismo ciclo (§30.2), así que no cuesta nada y evita el juego
    // de precisión de acertar el instante exacto en que entras en rango.
    interactuando = true;
    if (!e.repeat) {
      cliente.interactuar();
      ultimoInteractEnviadoEn = performance.now();
      const k = knights.get(miId);
      if (k) k.accion = 0.4;
    }
    return;
  }
  if (!INTENCION[e.code]) return;
  e.preventDefault();
  if (e.repeat) return;
  teclas.add(e.code);
  recalcularDireccion();
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyE' || e.code === 'Space') { interactuando = false; return; }
  if (!INTENCION[e.code]) return;
  teclas.delete(e.code);
  recalcularDireccion();
});

// Al perder el foco se sueltan todas: si no, el caballero seguiría caminando
// solo mientras el jugador está en otra ventana.
window.addEventListener('blur', () => {
  teclas.clear();
  interactuando = false;
  recalcularDireccion();
});

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

  const yoLocal = knights.get(miId);

  for (const k of knights.values()) {
    const p = k.group.position;
    // Posición y dirección proceden del MISMO GAME_STATE. Proyectarlas juntas
    // mantiene movimiento continuo entre ticks sin mezclar la tecla actual con
    // una posición anterior (la causa del antiguo "cuadrado invisible").
    if (k.serverStateAt) {
      k.target.copy(k.serverPosition);
      const edadMs = Math.min(
        cfg.tickIntervalMs * 3,
        performance.now() - k.serverStateAt + cfg.tickIntervalMs,
      );
      const adelanto = velocidadMaxima() * edadMs / 1000;
      const dir = k.serverDirection;
      if (dir === DIRECCIONES.UP) k.target.z -= adelanto;
      else if (dir === DIRECCIONES.DOWN) k.target.z += adelanto;
      else if (dir === DIRECCIONES.LEFT) k.target.x -= adelanto;
      else if (dir === DIRECCIONES.RIGHT) k.target.x += adelanto;
    }
    _v.subVectors(k.target, p); _v.y = 0;
    const d = _v.length();

    if (d > 0.0005) {
      const paso = Math.min(d, velocidadMaxima() * dt * 3.0);
      p.addScaledVector(_v.normalize(), paso);
      k.yaw = Math.atan2(_v.x, _v.z);
    }
    k.group.rotation.y += (k.yaw - k.group.rotation.y) * Math.min(1, dt * 16);
    k.marca.position.set(p.x, SUELO_Y + 0.03, p.z);

    if (k.accion > 0) {
      k.accion -= dt;
      k.anim.grab(dt, 1 - Math.max(0, k.accion / 0.55));
    } else {
      const moviendose = (k === yoLocal && ultimaDireccion !== DIRECCIONES.NONE) || d > 0.02;
      k.anim.locomotion(dt, t, moviendose ? 2.4 : 0);
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

  // La cámara puede girar con una tecla de movimiento pulsada; hay que
  // reevaluar para que "adelante" siga siendo adelante mientras se orbita.
  if (teclas.size) recalcularDireccion();
  if (interactuando
      && performance.now() - ultimoInteractEnviadoEn >= cfg.tickIntervalMs) {
    cliente.interactuar();
    ultimoInteractEnviadoEn = performance.now();
  }

  // En estado CARRIED la bandera sigue al modelo renderizado del portador,
  // no a una coordenada de red anterior que pueda llegar con jitter.
  if (cliente.estado?.flagStatus === ESTADO_BANDERA.CARRIED) {
    const portador = knights.get(cliente.estado.flagCarrierId);
    if (portador) {
      banner.position.set(
        portador.group.position.x,
        SUELO_Y,
        portador.group.position.z,
      );
    }
  }

  cosmos.update(dt, t);
  titans.update(dt, t);
  testigos.update(dt, t);
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
  $('sala')?.classList.add('oculto');
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

// Un ÚNICO camino de vuelta al menú, y deja el cliente en el mismo estado en
// que arrancó la página.
//
// Antes había dos funciones registradas a la vez sobre los mismos botones.
// "Otra partida" llamaba a entrar() y acto seguido la otra volvía a sacar el
// menú: reconectaba y se quedaba en el menú al mismo tiempo. Y esa segunda
// llamaba a cliente.desconectar(), que no existe — el método se llama
// detener(). Solo no reventaba de milagro, porque para cuando le tocaba el
// turno `conectado` ya era false y la línea se saltaba.
function volverAlMenu() {
  cerrarSala();
  cliente.detener();
  limpiarKnights();
  miId = 0;
  terminada = false;
  $('menu').classList.remove('oculto');
  $('modalFin')?.classList.add('oculto');
  $('modalEspera')?.classList.add('oculto');
  $('iConn').textContent = '—';
  // Al terminar una partida el servidor echa a todo el mundo y su sala queda
  // libre; volver a sondear enseguida hace que aparezca ya vacía en la lista.
  setTimeout(sondearServidores, 50);
}

$('jugar').addEventListener('click', entrar);
$('reset').addEventListener('click', volverAlMenu);
$('finMenu')?.addEventListener('click', volverAlMenu);
// "Otra partida" es volver al menú y entrar de nuevo: el servidor cerró la
// conexión al acabar, así que hay que rehacerla entera, no solo tapar el modal.
$('finOtra')?.addEventListener('click', () => { volverAlMenu(); entrar(); });

// ---------------------------------------------------------------------------
//  Descubrimiento automático de partidas
//
//  Mientras el menú está abierto en modo red, se pregunta al bridge cada pocos
//  segundos y la lista se actualiza sola: quien levante un servidor en la red
//  aparece sin que nadie pulse nada, y quien lo apague desaparece.
//
//  La lista se reconcilia en vez de reconstruirse. Si se borrara y volviera a
//  pintar en cada sondeo, la selección del usuario se perdería cada dos
//  segundos y la animación de entrada parpadearía sin parar.
// ---------------------------------------------------------------------------
// Sondea cada segundo mientras el menú de red está abierto. Durante una
// partida se pausa para que el broadcast no compita con el tráfico del juego.
const INTERVALO_BUSQUEDA = 1000;
let servidoresVistos = new Map();   // "host:puerto" -> datos
let seleccionado = null;
let buscando = false;

const menuAbiertoEnRed = () =>
  !$('menu').classList.contains('oculto') && $('modo').value === 'red';

function pintarServidores() {
  const lista = $('listaServidores');
  const estado = $('estadoBusqueda');

  const claveLocal = '127.0.0.1:5000';
  lista.querySelector(`[data-clave="${claveLocal}"]`)?.remove();

  lista.querySelector('.vacio')?.remove();

  const claves = new Set();
  for (const [clave, s] of servidoresVistos) {
    if (clave === claveLocal || s.host === '127.0.0.1' || s.host === 'localhost') continue;
    claves.add(clave);
    let li = lista.querySelector(`[data-clave="${CSS.escape(clave)}"]`);
    const nuevo = !li;
    if (nuevo) {
      li = document.createElement('li');
      li.dataset.clave = clave;
      li.className = 'nuevo';
      li.addEventListener('click', () => {
        seleccionado = clave;
        $('host').value = s.host;
        $('puerto').value = s.tcpPort;
        try { $('puerto').focus(); $('puerto').select(); } catch {}
        for (const otro of lista.children) otro.classList.toggle('on', otro === li);
      });
      lista.appendChild(li);
    }

    const esSinServicio = s.sinServicio || s.state === 'SIN_SERVICIO';
    const lleno = s.playerCount >= s.maximumPlayers;
    const cls = esSinServicio ? 'sin-servicio' : (lleno ? 'llena' : (s.state === ESTADO_PARTIDA.WAITING ? 'abierta' : 'jugando'));
    const txt = esSinServicio ? 'SIN SERVICIO EN 5000' : (lleno ? 'LLENA' : (s.state === ESTADO_PARTIDA.WAITING ? 'ABIERTA' : 'EN JUEGO'));
    const via = s.via === 'sin-servicio'
      ? '<span class="via" title="Compañero activo en Radmin VPN (sin servicio en puerto 5000)">◌</span>'
      : (s.via === 'directo'
        ? '<span class="via" title="respondió a un sondeo dirigido">⇢</span>'
        : '<span class="via" title="respondió al broadcast">◎</span>');
    li.innerHTML = `<b>${s.serverName}</b>` + via +
      `<span>${s.host}:${s.tcpPort}${esSinServicio ? '' : ` · ${s.playerCount}/${s.maximumPlayers}`}</span>` +
      `<span class="estado ${cls}">${txt}</span>`;
    li.classList.toggle('on', clave === seleccionado);
  }

  // Fuera los que dejaron de responder
  for (const li of [...lista.children]) {
    if (li.dataset.clave && !claves.has(li.dataset.clave)) {
      if (li.dataset.clave === seleccionado) seleccionado = null;
      li.remove();
    }
  }
}

// IPs que el usuario añadió a mano. Se preguntan en cada sondeo junto con el
// escaneo automático, así que un compañero al que el broadcast no alcanza se
// escribe una vez y ya aparece siempre en la lista como los demás.
const ipsManuales = new Set();

async function sondearServidores() {
  if (buscando || !menuAbiertoEnRed()) return;
  buscando = true;
  const estado = $('estadoBusqueda');
  const base = ($('url').value || 'ws://localhost:8146').replace(/^ws/, 'http').split('?')[0];
  try {
    // El bridge difunde por cada interfaz a su difusión dirigida; para Radmin
    // eso es 26.255.255.255, que alcanza toda la red virtual de una vez.
    const { servidores, avisos, exploracion } = await ClienteV3.buscarServidores(base, {
      ips: [...ipsManuales],
      esperaMs: 800,
    });
    servidoresVistos = new Map(servidores.map((s) => [`${s.host}:${s.tcpPort}`, s]));
    estado.className = 'buscando';
    estado.textContent = servidores.length
      ? `${servidores.length} encontrada${servidores.length > 1 ? 's' : ''}`
      : 'buscando…';
    pintarServidores();
    pintarExploracion(exploracion, avisos);
  } catch {
    servidoresVistos.clear();
    estado.className = 'sinbridge';
    estado.textContent = 'bridge no responde';
    $('listaServidores').innerHTML =
      '<li class="vacio">Arranca el bridge: node red/v3/bridge-v3.js</li>';
    $('avisoBusqueda').style.display = 'none';
    $('exploracion').style.display = 'none';
  } finally {
    buscando = false;
  }
}

// Enseña POR DÓNDE se buscó. Sin esto, una lista vacía es ambigua: puede que
// no haya nadie jugando o puede que la difusión no esté saliendo por la
// interfaz de la VPN, y son problemas muy distintos.
function pintarExploracion(exploracion, avisos) {
  const caja = $('exploracion');
  const nota = $('avisoBusqueda');

  const difusiones = exploracion?.difusiones ?? [];
  const trozos = [];

  // Vecinos que el sistema ya vio vivos en la VPN. Es la vía que mejor funciona
  // sobre Radmin, así que se enseña primero y con su cuenta.
  if (typeof exploracion?.vecinos === 'number') {
    const n = exploracion.vecinos;
    trozos.push(`<span class="${n ? 'via-radmin' : ''}" title="equipos que el sistema ya vio responder en la red virtual; se les preguntó uno a uno">`
      + `${n ? '✓' : '·'} ${n} vecino${n === 1 ? '' : 's'} en la VPN</span>`);
  }

  if (!difusiones.length && !trozos.length) { caja.style.display = 'none'; }
  else {
    // La de Radmin primero: es la que importa para jugar contra los compañeros.
    const orden = [...difusiones].sort((a, b) => (b.radmin ? 1 : 0) - (a.radmin ? 1 : 0));
    trozos.push(...orden.map((d) => {
      const marca = d.ok ? '✓' : '✕';
      const clase = d.ok ? (d.radmin ? 'via-radmin' : 'via-ok') : 'via-mal';
      const etiqueta = d.radmin ? 'Radmin VPN' : d.nombre;
      return `<span class="${clase}" title="${d.local} → ${d.difusion}${d.error ? ' · ' + d.error : ''}">${marca} ${etiqueta}</span>`;
    }));
    caja.innerHTML = trozos.join('');
    caja.style.display = '';
  }

  const relevantes = (avisos ?? []).filter((a) => !/barrido del \/24/.test(a));
  if (relevantes.length) { nota.textContent = relevantes[0]; nota.style.display = ''; }
  else nota.style.display = 'none';
}

// Una IP completa y bien formada, anclada por los dos extremos.
const IP_EXACTA = /^\d{1,3}(?:\.\d{1,3}){3}$/;

// Añadir compañeros a mano, pegando la columna entera de Radmin VPN.
//
// Se PARTE por separadores y se valida cada trozo completo, en vez de buscar
// patrones de IP dentro del texto. La diferencia importa: si dos direcciones
// llegan pegadas ("26.230.5.1526.169.238.102", que es lo que pasa al pegar en
// un campo que borra los saltos de línea), una búsqueda por patrón saca de ahí
// "26.230.5.152" y "6.169.238.102" — dos direcciones que nadie escribió y que
// además pasan cualquier validación por rango. Partiendo y anclando, ese caso
// se rechaza en vez de inventar destinos.
$('btnCopiarRadmin')?.addEventListener('click', () => {
  const ipInfo = '26.11.206.94:5000';
  navigator.clipboard.writeText(ipInfo).then(() => {
    aviso('📋 IP copiada al portapapeles: ' + ipInfo);
    $('btnCopiarRadmin').textContent = '✅ ¡Copiado! (26.11.206.94:5000)';
    setTimeout(() => {
      $('btnCopiarRadmin').textContent = '📋 Copiar datos de conexión para mis compañeros (26.11.206.94:5000)';
    }, 2500);
  }).catch(() => {
    aviso('IP de Radmin: ' + ipInfo);
  });
});

function anadirIpManual() {
  const campo = $('ipManual');
  const trozos = campo.value.split(/[\s,;]+/).filter(Boolean);
  const validas = [], rechazadas = [];
  for (const t of trozos) {
    if (IP_EXACTA.test(t) && t.split('.').every((o) => Number(o) <= 255)) validas.push(t);
    else rechazadas.push(t);
  }

  if (!validas.length) {
    campo.classList.add('malo');
    setTimeout(() => campo.classList.remove('malo'), 900);
    return;
  }
  for (const ip of validas) ipsManuales.add(ip);
  campo.value = '';

  // Se dice cuántas se descartaron: si alguien pega mal la lista tiene que
  // enterarse, no quedarse esperando a compañeros que nunca se preguntaron.
  const sufijo = rechazadas.length ? ` (${rechazadas.length} descartada${rechazadas.length > 1 ? 's' : ''})` : '';
  $('estadoBusqueda').textContent = validas.length === 1
    ? `preguntando a ${validas[0]}…${sufijo}`
    : `preguntando a ${validas.length} direcciones…${sufijo}`;
  sondearServidores();
}
$('anadirIp')?.addEventListener('click', anadirIpManual);
$('ipManual')?.addEventListener('keydown', (e) => {
  // En un textarea Enter sirve para pegar varias líneas, así que se envía con
  // Ctrl+Enter y se deja Enter para lo que se espera que haga.
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); anadirIpManual(); }
  e.stopPropagation(); // que WASD no mueva al caballero mientras se escribe
});

// (Aquí vivía una segunda salida al menú, registrada además de la de arriba
//  sobre los mismos dos botones. Está en volverAlMenu(), que es la única.)

setInterval(sondearServidores, INTERVALO_BUSQUEDA);
// Al cambiar a modo red se sondea ya, sin esperar al siguiente ciclo.
$('modo').addEventListener('change', () => { if (menuAbiertoEnRed()) sondearServidores(); });
for (const card of document.querySelectorAll('.modo-card')) {
  card.addEventListener('click', () => setTimeout(sondearServidores, 0));
}
$('url').addEventListener('change', sondearServidores);
sondearServidores();

// Gancho de depuración: permite inspeccionar y avanzar cuadros a mano desde la
// consola sin depender del bucle de animación del navegador.
window.__v3 = { cliente, knights, scene, camera, frame, get cfg() { return cfg; }, aMundo, renderer };
