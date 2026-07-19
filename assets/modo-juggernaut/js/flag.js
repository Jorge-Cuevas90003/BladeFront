// El Ciber-Estandarte central — bandera medieval rasgada de energía, generada
// con arrays de vértices crudos, colgando de un asta metálica de alto detalle.
// userData.update(t) aplica la función de onda de la spec a los vértices.

import * as THREE from 'three';

const COLS = 16, ROWS = 11;
const BANNER_W = 0.88, BANNER_TOP = 2.42;

// RNG determinista (el borde rasgado es siempre el mismo)
function makeRng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Geometría del paño construida a mano: posiciones, índices y UVs crudos.
// Cuelga de la barra superior; el borde inferior es irregular (rasgado).
function tornBannerGeometry() {
  const rng = makeRng(1313);
  // longitud de caída por columna: base 1.15 + rasgones profundos alternos
  const drop = [];
  for (let c = 0; c <= COLS; c++) {
    let L = 1.12 + rng() * 0.16;
    if (c % 4 === 2) L -= 0.22 + rng() * 0.14; // muescas del desgarro
    drop.push(L);
  }

  const positions = [];
  const uvs = [];
  for (let r = 0; r <= ROWS; r++) {
    for (let c = 0; c <= COLS; c++) {
      const u = c / COLS, v = r / ROWS;
      positions.push(0.06 + u * BANNER_W, BANNER_TOP - v * drop[c], 0);
      uvs.push(u, 1 - v);
    }
  }
  const indices = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const a = r * (COLS + 1) + c;
      const b = a + 1, d = a + COLS + 1, e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function createCyberBanner() {
  const g = new THREE.Group();
  g.name = 'CiberEstandarte';

  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.95, roughness: 0.35 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x96742f, metalness: 1.0, roughness: 0.4 });

  // Asta de alto detalle + remate + barra transversal (gonfalón)
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.7, 32), metal);
  staff.position.y = 1.35;
  staff.castShadow = staff.receiveShadow = true;
  g.add(staff);

  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 24), brass);
  finial.position.y = 2.85;
  finial.castShadow = true;
  g.add(finial);

  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.05, 24), brass);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0.48, BANNER_TOP + 0.03, 0);
  bar.castShadow = true;
  g.add(bar);

  // Paño de energía: dorado ardiente sobre tela casi negra
  const clothMat = new THREE.MeshStandardMaterial({
    color: 0x241a08,
    emissive: 0xffb638,
    emissiveIntensity: 1.6,
    metalness: 0.1,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const banner = new THREE.Mesh(tornBannerGeometry(), clothMat);
  banner.castShadow = true;
  g.add(banner);

  // Luz propia del estandarte
  const light = new THREE.PointLight(0xffb638, 26, 9, 1.9);
  light.position.set(0.4, 1.8, 0);
  g.add(light);

  // Copia de las posiciones en reposo para la onda
  const posAttr = banner.geometry.attributes.position;
  const base = posAttr.array.slice();

  g.userData.clothMat = clothMat;
  g.userData.light = light;

  // Onda de la spec: vertex.z += sin(vertex.y * 2.0 + time * 5.0) * 0.08
  // (escalada por la caída desde la barra para que el borde cosido no se despegue)
  g.userData.update = (t) => {
    for (let i = 0; i < posAttr.count; i++) {
      const ix = i * 3;
      const x = base[ix], y = base[ix + 1];
      const hang = Math.min(1, (BANNER_TOP - y) / 0.9); // 0 en la costura → 1 abajo
      posAttr.array[ix + 2] =
        Math.sin(y * 2.0 + t * 5.0) * 0.08 * hang +
        Math.sin(x * 3.0 + t * 3.2) * 0.05 * hang; // viento del abismo lateral
    }
    posAttr.needsUpdate = true;
    banner.geometry.computeVertexNormals();
    clothMat.emissiveIntensity = 1.45 + Math.sin(t * 4.2) * 0.35;
  };

  return g;
}
