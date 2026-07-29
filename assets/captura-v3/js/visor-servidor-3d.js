// Vista 3D administrativa de solo lectura. Consume únicamente /estado por
// loopback: no crea ClienteV3, no abre TCP y no envía JOIN, INPUT ni INTERACT.
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
import { crearMonumentos } from '../../arena-vacio/js/monumentos.js';
import { createKnight } from '../../caballero-templario/js/knight.js';
import { KnightAnimator } from '../../caballero-templario/js/knight-anim.js';
import { createCyberBanner } from '../../modo-juggernaut/js/flag.js';
import { ESTADO_BANDERA, PARAMS_DEFECTO } from '../../../red/v3/protocolo-v3.js';

const host = document.getElementById('app3d');
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030405);
scene.fog = new THREE.FogExp2(0x030405, 0.0062);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.2;

const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 500);
camera.position.set(0, 35, 45);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.enableDamping = true;
controls.minDistance = 12;
controls.maxDistance = 90;
controls.maxPolarAngle = Math.PI * 0.49;

const arena = createArena();
const ARENA_SCALE = 1.85;
arena.scale.set(ARENA_SCALE, 1, ARENA_SCALE);
scene.add(arena);
const R = ARENA_RADIUS * ARENA_SCALE;
const cosmos = createCosmos(); scene.add(cosmos.group);
const titans = createTitans(); scene.add(titans.group);

const key = new THREE.SpotLight(0xe6f0ff, 7000, 170, 0.46, 0.55, 1.8);
key.position.set(0, 48, 6); key.target.position.set(0, 0, 0); key.castShadow = true;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0x49e6ff, 10);
rim.position.set(-45, 32, -75); scene.add(rim);
const gold = new THREE.PointLight(0xffb638, 110, 42, 1.8);
gold.position.set(0, 2.2, 0); scene.add(gold);
scene.add(new THREE.HemisphereLight(0x22303c, 0x04050a, 0.26));

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.35, 0.8));
composer.addPass(new OutputPass());

const SUELO_Y = 0.42;
let cfg = { ...PARAMS_DEFECTO };
let escala = 0.017;
let escalaKnight = 0.55;
const aMundo = (x, y, out = new THREE.Vector3()) => out.set(x * escala, SUELO_Y, y * escala);

const anillo = new THREE.Mesh(
  new THREE.RingGeometry(1, 1.02, 128),
  new THREE.MeshBasicMaterial({
    color:0xffb638, transparent:true, opacity:.5, side:THREE.DoubleSide, fog:false,
  }),
);
anillo.rotation.x = -Math.PI / 2;
anillo.position.y = SUELO_Y + .02;
scene.add(anillo);

const muro = new THREE.Mesh(
  new THREE.CylinderGeometry(1, 1, 1, 128, 1, true),
  new THREE.MeshBasicMaterial({
    color:0xffb638, transparent:true, opacity:.07, side:THREE.DoubleSide, depthWrite:false,
  }),
);
muro.position.y = SUELO_Y + .5;
scene.add(muro);

const banner = createCyberBanner();
banner.scale.setScalar(.75);
scene.add(banner);
const haz = new THREE.Mesh(
  new THREE.CylinderGeometry(.35, .6, 11, 24, 1, true),
  new THREE.MeshBasicMaterial({
    color:0xffb638, transparent:true, opacity:.07, side:THREE.DoubleSide, depthWrite:false,
  }),
);
scene.add(haz);

let monumentos = null;
function configurar(nueva) {
  cfg = { ...cfg, ...nueva };
  escala = (R * .85) / (cfg.mapSize / 2);
  escalaKnight = Math.max(.28, Math.min(.95, cfg.circleRadius * escala * .075));
  const radio = cfg.circleRadius * escala;
  anillo.scale.setScalar(radio);
  muro.scale.set(radio, 1, radio);
  if (!monumentos) {
    monumentos = crearMonumentos({
      cantidad:12,
      radio:Math.min(R * .88, radio + (R - radio) * .6),
      escala:Math.max(.5, Math.min(1.15, (R - radio) * .16)),
    });
    monumentos.group.position.y = SUELO_Y;
    scene.add(monumentos.group);
  }
}
configurar(cfg);

const knights = new Map();
function crearEtiqueta(texto) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(12,16,26,.84)';
  x.strokeStyle = '#ffb638';
  x.lineWidth = 4;
  x.beginPath();
  if (x.roundRect) x.roundRect(8, 8, 240, 48, 12);
  else x.rect(8, 8, 240, 48);
  x.fill(); x.stroke();
  x.font = 'bold 24px system-ui';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = '#fff';
  x.fillText(texto, 128, 32);
  const textura = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map:textura, transparent:true, depthTest:false,
  }));
  sprite.scale.set(3.6, .9, 1);
  sprite.position.set(0, 4.2, 0);
  return sprite;
}

function asegurar(p) {
  let k = knights.get(p.playerId);
  if (!k) {
    const group = createKnight();
    group.scale.setScalar(escalaKnight);
    group.add(crearEtiqueta(`${p.name} #${p.playerId}`));
    group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(group);
    k = {
      group,
      anim:new KnightAnimator(group),
      target:new THREE.Vector3(),
    };
    knights.set(p.playerId, k);
    aMundo(p.x, p.y, k.target);
    group.position.copy(k.target);
  }
  return k;
}

function quitar(id) {
  const k = knights.get(id);
  if (!k) return;
  scene.remove(k.group);
  knights.delete(id);
}

let estado = null;
const tmp = new THREE.Vector3();
window.__presentarServidor3D = (s) => {
  if (!estado
      || estado.params.mapSize !== s.params.mapSize
      || estado.params.circleRadius !== s.params.circleRadius) {
    configurar(s.params);
  }
  estado = s;
  const vistos = new Set();
  for (const p of s.players) {
    vistos.add(p.playerId);
    const k = asegurar(p);
    aMundo(p.x, p.y, k.target);
    k.direction = p.direction;
  }
  for (const id of [...knights.keys()]) if (!vistos.has(id)) quitar(id);

  const visible = s.flag.status !== ESTADO_BANDERA.OUTSIDE;
  banner.visible = visible;
  haz.visible = visible && s.flag.status !== ESTADO_BANDERA.CARRIED;
  if (visible) {
    aMundo(s.flag.x, s.flag.y, tmp);
    banner.position.set(tmp.x, SUELO_Y, tmp.z);
    haz.position.set(tmp.x, SUELO_Y + 5.5, tmp.z);
  }
};

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), .05);
  const t = clock.elapsedTime;
  for (const k of knights.values()) {
    tmp.subVectors(k.target, k.group.position);
    tmp.y = 0;
    const largo = tmp.length();
    if (largo > .0005) {
      const paso = Math.min(largo, (cfg.playerSpeed || 220) * escala * dt * 3);
      k.group.position.addScaledVector(tmp.normalize(), paso);
      const yaw = Math.atan2(tmp.x, tmp.z);
      k.group.rotation.y += (yaw - k.group.rotation.y) * Math.min(1, dt * 16);
    }
    k.anim.locomotion(dt, t, largo > .02 ? 2.4 : 0);
  }

  if (estado?.flag.status === ESTADO_BANDERA.CARRIED) {
    const portador = knights.get(estado.flag.carrierId);
    if (portador) {
      banner.position.set(portador.group.position.x, SUELO_Y, portador.group.position.z);
    }
  }

  cosmos.update(dt, t);
  titans.update(dt, t);
  monumentos?.update(dt, t);
  arena.userData.update?.(dt, t);
  banner.userData.update?.(dt, t);
  anillo.material.opacity = .42 + Math.sin(t * 2) * .12;
  muro.material.opacity = .055 + Math.sin(t * 2) * .02;
  controls.update();
  composer.render();
}
renderer.setAnimationLoop(frame);

function ajustar() {
  const w = Math.max(1, host.clientWidth);
  const h = Math.max(1, host.clientHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
}
new ResizeObserver(ajustar).observe(host);
ajustar();
