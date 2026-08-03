import * as THREE from '../node_modules/three/build/three.module.js';
import { KnightAnimator } from '../assets/caballero-templario/js/knight-anim.js';

function makeRig() {
  const root = new THREE.Object3D();
  const names = ['pierna_1', 'pierna_-1', 'torsoSup', 'cabeza', 'espada', 'capa'];
  for (const n of names) {
    const o = new THREE.Object3D();
    o.name = n;
    root.add(o);
  }
  return root;
}

const rig = makeRig();
const anim = new KnightAnimator(rig);

const dt = 1 / 60;
let t = 0;
const swordZs = [];
const torsoZs = [];
for (let i = 0; i < 300; i++) {
  t += dt;
  anim.locomotion(dt, t, 3.1, 0, 1, 0); // marcha frontal a velocidad de referencia
  swordZs.push(anim.sword.rotation.z);
  torsoZs.push(anim.torso.rotation.z);
}

const min = Math.min(...swordZs.slice(60));
const max = Math.max(...swordZs.slice(60));
console.log('swordZ rango (tras asentar):', min.toFixed(4), 'a', max.toFixed(4), '  amplitud:', (max - min).toFixed(4));
const tmin = Math.min(...torsoZs.slice(60));
const tmax = Math.max(...torsoZs.slice(60));
console.log('torsoZ rango (tras asentar):', tmin.toFixed(4), 'a', tmax.toFixed(4), '  amplitud:', (tmax - tmin).toFixed(4));

if (max - min < 0.01) {
  console.error('FALLO: la espada no se balancea lateralmente');
  process.exit(1);
}
console.log('OK: la espada ahora tiene balanceo lateral propio (tercer eje activo)');
