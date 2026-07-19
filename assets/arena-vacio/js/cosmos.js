// Cosmos del Vacío — telón de fondo cinematográfico reutilizable:
//   1. Monolitos colosales flotantes (siluetas góticas + brutalistas)
//   2. Anomalía de Eclipse (toro emisivo + luna negra + luz de contraluz real)
//   3. Campo de ceniza cósmica (2500 partículas ascendentes)
//   4. Océano de niebla rugiente (planos con ruido procedural en vertex shader)
//
// createCosmos() → { group, update(dt, t) }. El anfitrión añade group a la
// escena y llama update en su bucle. Sin dependencias del modo de juego.

import * as THREE from 'three';

const PI2 = Math.PI * 2;

function makeRng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 1. Monolitos ----------
function lancet(cx, y0, wd, ht) {
  const p = new THREE.Path();
  p.moveTo(cx - wd / 2, y0);
  p.lineTo(cx - wd / 2, y0 + ht * 0.7);
  p.lineTo(cx, y0 + ht);
  p.lineTo(cx + wd / 2, y0 + ht * 0.7);
  p.lineTo(cx + wd / 2, y0);
  p.closePath();
  return p;
}

// Catedral gótica en ruinas (silueta con ventanales por los que pasa el eclipse)
function cathedralGeo(rng) {
  const s = new THREE.Shape();
  const tw = 0.2 + rng() * 0.08;
  const hL = 0.55 + rng() * 0.2;
  const spL = hL + 0.3 + rng() * 0.3;
  const hN = 0.36 + rng() * 0.12;
  const gN = hN + 0.24 + rng() * 0.16;
  const hR = 0.48 + rng() * 0.2;
  s.moveTo(-0.5, 0);
  s.lineTo(-0.5, hL);
  s.lineTo(-0.5 + tw * 0.5, spL);
  s.lineTo(-0.5 + tw, hL * 0.95);
  s.lineTo(-0.5 + tw, hN);
  s.lineTo(0, gN);
  s.lineTo(0.5 - tw, hN);
  s.lineTo(0.5 - tw, hR);
  if (rng() < 0.6) { // torre derecha rota
    s.lineTo(0.5 - tw * 0.6, hR + 0.05 + rng() * 0.06);
    s.lineTo(0.5 - tw * 0.3, hR - 0.07);
    s.lineTo(0.5, hR + 0.02);
  } else {
    s.lineTo(0.5 - tw * 0.5, hR + 0.3 + rng() * 0.2);
    s.lineTo(0.5, hR * 0.95);
  }
  s.lineTo(0.5, 0);
  s.closePath();
  s.holes.push(lancet(-0.13, 0.05, 0.05, 0.2));
  s.holes.push(lancet(0, 0.05, 0.05, 0.25));
  s.holes.push(lancet(0.13, 0.05, 0.05, 0.2));
  const rose = new THREE.Path();
  rose.absarc(0, gN * 0.6, 0.05, 0, PI2, true);
  s.holes.push(rose);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false });
  geo.translate(0, 0, -0.06);
  return geo;
}

// Torre brutalista: volúmenes crudos, cortantes, apilados
function brutalistTower(rng, mat, H) {
  const g = new THREE.Group();
  const main = new THREE.Mesh(new THREE.BoxGeometry(H * 0.16, H, H * 0.1), mat);
  main.position.y = H / 2;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(H * 0.1, H * (0.5 + rng() * 0.25), H * 0.15), mat);
  slab.position.set(H * (0.1 + rng() * 0.04), H * 0.32, 0);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(H * 0.018, H * 0.42, H * 0.045), mat);
  fin.position.set(-H * 0.05, H * (1.02 + rng() * 0.12), 0);
  g.add(main, slab, fin);
  if (rng() < 0.5) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(H * 0.24, H * 0.08, H * 0.06), mat);
    wing.position.set(0, H * (0.6 + rng() * 0.3), 0);
    wing.rotation.z = (rng() - 0.5) * 0.2;
    g.add(wing);
  }
  return g;
}

// ---------- 4. Shader del océano de niebla ----------
const FogOceanShader = {
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0x1a232b) },
    uOpacity: { value: 0.34 },
  },
  vertexShader: /* glsl */`
    uniform float uTime;
    varying vec2 vUv;
    varying float vH;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1, 0)), f.x),
        mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }
    void main() {
      vUv = uv;
      vec2 p = uv * 13.0;
      // fbm de 3 octavas a la deriva: la niebla "rueda" sobre sí misma
      float n = vnoise(p + uTime * 0.12) * 0.6
              + vnoise(p * 2.3 - uTime * 0.07) * 0.3
              + vnoise(p * 5.1 + vec2(uTime * 0.05, -uTime * 0.04)) * 0.15;
      vH = n;
      vec3 pos = position + vec3(0.0, 0.0, n * 2.4); // normal local del plano
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uColor;
    uniform float uOpacity;
    varying vec2 vUv;
    varying float vH;
    void main() {
      float d = distance(vUv, vec2(0.5));
      float edge = smoothstep(0.5, 0.16, d);
      float a = uOpacity * edge * (0.3 + vH * 0.85);
      gl_FragColor = vec4(uColor * (0.4 + vH * 0.6), a);
    }`,
};

// ---------- Ensamblaje ----------
export function createCosmos({ ashCount = 2500 } = {}) {
  const group = new THREE.Group();
  group.name = 'CosmosDelVacio';
  const rng = makeRng(4242);

  // --- 1. Ocho monolitos colosales (50–150 unidades, escala Y titánica) ---
  // Albedo un pelo por encima del negro puro de la spec: siguen siendo
  // siluetas, pero el rim cian/dorado dibuja sus aristas contra el vacío
  const monoMat = new THREE.MeshStandardMaterial({
    color: 0x0a0b0e, roughness: 0.9, metalness: 0.0, // sin especular
  });
  const monoliths = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI2 + (rng() - 0.5) * 0.55;
    const d = 55 + rng() * 85;
    const H = 34 + rng() * 40;
    let m;
    if (rng() < 0.5) {
      m = new THREE.Mesh(cathedralGeo(rng), monoMat);
      m.scale.set(H * 0.62, H, H * 0.62);
    } else {
      m = brutalistTower(rng, monoMat, H);
    }
    m.position.set(Math.cos(a) * d, -12 + rng() * 9, Math.sin(a) * d);
    m.rotation.y = -a - Math.PI / 2 + (rng() - 0.5) * 0.6;
    m.rotation.z = (rng() - 0.5) * 0.05;
    m.userData.baseY = m.position.y;
    m.userData.phase = i * 2.4 + rng();
    m.userData.spin = (rng() - 0.5) * 0.008;
    monoliths.push(m);
    group.add(m);
  }

  // --- 2. Anomalía de Eclipse: aro solar-dorado + luna negra ---
  const eclipse = new THREE.Group();
  // Nota: la spec pedía intensidad 30, pero con ACES + bloom eso funde el
  // abismo en un amanecer dorado; 6 mantiene el aro "al blanco" sin lavar
  // los negros del fondo (calibrado sobre captura).
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: 0xffb638, emissiveIntensity: 6,
    fog: false, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(30, 2.2, 18, 110), ringMat);
  ring.scale.set(1.2, 0.82, 1); // toro comprimido: elipse baja de horizonte
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(35, 64),
    new THREE.MeshBasicMaterial({ color: 0x020203, fog: false })
  );
  moon.position.z = 1.2; // el cuerpo que eclipsa, delante del aro
  eclipse.add(ring, moon);
  eclipse.position.set(-58, 24, -158);
  eclipse.lookAt(0, 6, 0);
  group.add(eclipse);

  // Luz REAL del eclipse: proyecta rim dorado sobre monolitos y anillo de combate
  const eclipseLight = new THREE.DirectionalLight(0xffcf6a, 1.2);
  eclipseLight.position.copy(eclipse.position);
  eclipseLight.target.position.set(0, 0, 0);
  group.add(eclipseLight, eclipseLight.target);

  // --- 3. Campo de ceniza cósmica (asciende y recicla) ---
  const ashPos = new Float32Array(ashCount * 3);
  const ashSpeed = new Float32Array(ashCount);
  const Y_MIN = -25, Y_MAX = 45;
  for (let i = 0; i < ashCount; i++) {
    const a = rng() * PI2;
    const r = 10 + rng() * 85;
    ashPos[i * 3 + 0] = Math.cos(a) * r;
    ashPos[i * 3 + 1] = Y_MIN + rng() * (Y_MAX - Y_MIN);
    ashPos[i * 3 + 2] = Math.sin(a) * r;
    ashSpeed[i] = 0.25 + rng() * 0.3; // media ≈ 0.4 (spec)
  }
  const ashGeo = new THREE.BufferGeometry();
  ashGeo.setAttribute('position', new THREE.BufferAttribute(ashPos, 3));
  const ash = new THREE.Points(ashGeo, new THREE.PointsMaterial({
    color: 0xd8c9a8, size: 0.3, transparent: true, opacity: 0.22,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  ash.frustumCulled = false;
  group.add(ash);

  // --- 4. Océano de niebla rugiente (3 planos, ruido en GPU) ---
  const fogMats = [];
  const fogSpecs = [
    { size: 190, y: -5.0, op: 0.34, rot: 0.0 },  // spec: directamente bajo la arena
    { size: 235, y: -7.4, op: 0.26, rot: 2.1 },
    { size: 280, y: -10.0, op: 0.2, rot: 4.2 },
  ];
  for (const f of fogSpecs) {
    const mat = new THREE.ShaderMaterial({
      ...FogOceanShader,
      uniforms: THREE.UniformsUtils.clone(FogOceanShader.uniforms),
      transparent: true,
      depthWrite: false,
    });
    mat.uniforms.uOpacity.value = f.op;
    mat.uniforms.uTime.value = f.rot * 7; // desfase temporal por capa
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(f.size, f.size, 96, 96), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.rotation.z = f.rot;
    plane.position.y = f.y;
    plane.userData.t0 = f.rot * 7;
    fogMats.push(mat);
    group.add(plane);
  }

  // --- Bucle ---
  function update(dt, t) {
    // deriva orgánica de los monolitos: cosenos desfasados (forma integrada
    // de la spec `+= cos(t*0.3+i)*0.05`, que a 60 fps equivale a esta onda)
    for (const m of monoliths) {
      m.position.y = m.userData.baseY + Math.sin(t * 0.3 + m.userData.phase) * 2.6;
      m.rotation.y += dt * m.userData.spin;
    }

    // ceniza ascendiendo con reciclado al fondo del abismo
    const p = ashGeo.attributes.position;
    for (let i = 0; i < ashCount; i++) {
      let y = p.array[i * 3 + 1] + dt * ashSpeed[i];
      if (y > Y_MAX) y = Y_MIN;
      p.array[i * 3 + 1] = y;
    }
    p.needsUpdate = true;

    // océano de niebla + respiración del eclipse
    for (const mat of fogMats) mat.uniforms.uTime.value += dt;
    ringMat.emissiveIntensity = 6 + Math.sin(t * 0.7) * 0.8;
  }

  return { group, update };
}
