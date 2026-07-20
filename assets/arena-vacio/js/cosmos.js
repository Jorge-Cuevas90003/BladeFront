// Cosmos del Vacío — telón de fondo cinematográfico reutilizable:
//   1. Monolitos colosales flotantes (siluetas góticas + brutalistas)
//   2. Anomalía de Eclipse (toro emisivo + luna negra + corona + contraluz real)
//   3. Campo de ceniza cósmica (2500 partículas ascendentes)
//   4. Océano de niebla rugiente (planos con ruido procedural en vertex shader)
//   5. Cielo profundo: campo de estrellas + nebulosas de gas cósmico
//   6. Luna quebrada anillada (segundo cuerpo celeste)
//   7. Escombros flotantes a la deriva + meteoros ardientes
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

// ---------- Texturas de cielo profundo ----------
function makeStarTexture() {
  const s = 64;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2, 0, PI2); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Nubes de gas: blobs suaves de color frío profundo sobre transparente
function makeNebulaTexture(seed) {
  const rng = makeRng(seed);
  const s = 512;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d');
  const palette = ['86,96,180', '54,120,150', '118,72,158', '40,84,124'];
  for (let i = 0; i < 30; i++) {
    const x = rng() * s, y = rng() * s, r = s * (0.09 + rng() * 0.3);
    const col = palette[Math.floor(rng() * palette.length)];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${col},${0.045 + rng() * 0.07})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Corona solar: rayos radiales irregulares
function makeRaysTexture() {
  const s = 512;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.translate(s / 2, s / 2);
  const rng = makeRng(77);
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * PI2;
    const len = (s * 0.5) * (0.45 + rng() * 0.55);
    const w = 0.008 + rng() * 0.022;
    ctx.save();
    ctx.rotate(a);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, 'rgba(255,205,120,0.55)');
    g.addColorStop(1, 'rgba(255,205,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -len * w); ctx.lineTo(len, 0); ctx.lineTo(0, len * w);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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

  // ==================================================================
  // 5. CIELO PROFUNDO: campo de estrellas (2 capas de brillo)
  // ==================================================================
  const starTex = makeStarTexture();
  const starGroup = new THREE.Group();
  function starLayer(count, size, opacity, dMin, dMax) {
    const pos = new Float32Array(count * 3);
    const colArr = new Float32Array(count * 3);
    const cc = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const u = rng() * 2 - 1, th = rng() * PI2, sr = Math.sqrt(1 - u * u);
      const rad = dMin + rng() * (dMax - dMin);
      pos[i * 3 + 0] = Math.cos(th) * sr * rad;
      pos[i * 3 + 1] = Math.abs(u) * rad * 0.5 + 15; // domo superior
      pos[i * 3 + 2] = Math.sin(th) * sr * rad;
      const r = rng();
      if (r < 0.72) cc.setHSL(0.58, 0.22, 0.82);       // blanco-azulado
      else if (r < 0.88) cc.setHSL(0.11, 0.6, 0.72);   // dorado
      else cc.setHSL(0.52, 0.55, 0.72);                // cian
      colArr[i * 3 + 0] = cc.r; colArr[i * 3 + 1] = cc.g; colArr[i * 3 + 2] = cc.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({
      size, map: starTex, vertexColors: true, transparent: true,
      opacity, depthWrite: false, sizeAttenuation: false,
      blending: THREE.AdditiveBlending,
    }));
    pts.frustumCulled = false;
    starGroup.add(pts);
    return pts;
  }
  starLayer(2600, 1.7, 0.5, 300, 520);
  const starsBright = starLayer(430, 3.4, 0.9, 260, 470);
  group.add(starGroup);

  // ==================================================================
  // Nebulosas: nubes de gas cósmico en el horizonte lejano
  // ==================================================================
  const nebTex = makeNebulaTexture(2025);
  const nebSpecs = [
    { pos: [-30, 34, -205], scale: 250, rot: 0.2, op: 0.5 },
    { pos: [130, 22, -175], scale: 210, rot: -0.6, op: 0.4 },
    { pos: [-160, 46, -110], scale: 190, rot: 1.1, op: 0.34 },
  ];
  for (const n of nebSpecs) {
    const mat = new THREE.MeshBasicMaterial({
      map: nebTex, transparent: true, opacity: n.op,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(n.scale, n.scale), mat);
    pl.position.set(...n.pos);
    pl.lookAt(0, n.pos[1] * 0.3, 0);
    pl.rotateZ(n.rot);
    group.add(pl);
  }

  // ==================================================================
  // 1. Ocho monolitos colosales (siluetas titánicas)
  // ==================================================================
  const monoMat = new THREE.MeshStandardMaterial({
    color: 0x0a0b0e, roughness: 0.9, metalness: 0.0, // silueta, sin especular
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

  // ==================================================================
  // 2. Anomalía de Eclipse: aro dorado + luna negra + CORONA
  // ==================================================================
  const eclipse = new THREE.Group();
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

  // corona: rayos radiales que giran + disco de resplandor
  const corona = new THREE.Mesh(
    new THREE.PlaneGeometry(165, 165),
    new THREE.MeshBasicMaterial({
      map: makeRaysTexture(), transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    })
  );
  corona.position.z = -3;
  const coronaGlow = new THREE.Mesh(
    new THREE.CircleGeometry(56, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffbe52, transparent: true, opacity: 0.14,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    })
  );
  coronaGlow.position.z = -2.4;
  eclipse.add(corona, coronaGlow);

  eclipse.position.set(-58, 24, -158);
  eclipse.lookAt(0, 6, 0);
  group.add(eclipse);

  // Luz REAL del eclipse: rim dorado sobre monolitos y anillo de combate
  const eclipseLight = new THREE.DirectionalLight(0xffcf6a, 1.2);
  eclipseLight.position.copy(eclipse.position);
  eclipseLight.target.position.set(0, 0, 0);
  group.add(eclipseLight, eclipseLight.target);

  // ==================================================================
  // 6. Luna quebrada anillada (segundo cuerpo celeste, lado opuesto)
  // ==================================================================
  const moon2 = new THREE.Group();
  const moonBody = new THREE.Mesh(
    new THREE.IcosahedronGeometry(9, 1),
    new THREE.MeshStandardMaterial({
      color: 0x232a33, roughness: 1, metalness: 0, flatShading: true,
      emissive: 0x0e141c, emissiveIntensity: 0.6,
    })
  );
  const moonRing = new THREE.Mesh(
    new THREE.RingGeometry(12, 17.5, 72),
    new THREE.MeshBasicMaterial({
      color: 0x647888, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false, fog: false,
    })
  );
  moonRing.rotation.x = -1.15;
  moonRing.rotation.y = 0.3;
  const moonHalo = new THREE.Mesh(
    new THREE.SphereGeometry(10.5, 24, 16),
    new THREE.MeshBasicMaterial({
      color: 0x3a5570, transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide, fog: false,
    })
  );
  moon2.add(moonBody, moonRing, moonHalo);
  moon2.position.set(150, 78, -110);
  group.add(moon2);

  // ==================================================================
  // 7. Escombros flotantes a la deriva (fragmentos de roca en el vacío)
  // ==================================================================
  const DEBRIS = 34;
  const debrisMat = new THREE.MeshStandardMaterial({
    color: 0x0c0e12, roughness: 1, metalness: 0, flatShading: true,
  });
  const debris = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), debrisMat, DEBRIS);
  const dData = [];
  for (let i = 0; i < DEBRIS; i++) {
    dData.push({
      a: rng() * PI2,
      rad: 26 + rng() * 34,
      y: -8 + rng() * 26,
      size: 0.5 + rng() * 2.6,
      drift: 0.015 + rng() * 0.04,
      spin: (rng() - 0.5) * 0.5,
      ex: rng() * PI2, ez: rng() * PI2,
      sy: 0.6 + rng() * 0.7, sz: 0.6 + rng() * 0.7, // formas irregulares
    });
  }
  debris.frustumCulled = false;
  group.add(debris);

  // ==================================================================
  // 7b. Meteoros: estelas ardientes cruzando el vacío
  // ==================================================================
  const meteors = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffd9a0, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      })
    );
    m.visible = false;
    m.frustumCulled = false;
    group.add(m);
    meteors.push({
      mesh: m, active: false, t: 0, dur: 0, next: 2 + rng() * 9,
      from: new THREE.Vector3(), to: new THREE.Vector3(),
    });
  }

  // ==================================================================
  // 3. Campo de ceniza cósmica (asciende y recicla)
  // ==================================================================
  const ashPos = new Float32Array(ashCount * 3);
  const ashSpeed = new Float32Array(ashCount);
  const Y_MIN = -25, Y_MAX = 45;
  for (let i = 0; i < ashCount; i++) {
    const a = rng() * PI2;
    const r = 10 + rng() * 85;
    ashPos[i * 3 + 0] = Math.cos(a) * r;
    ashPos[i * 3 + 1] = Y_MIN + rng() * (Y_MAX - Y_MIN);
    ashPos[i * 3 + 2] = Math.sin(a) * r;
    ashSpeed[i] = 0.25 + rng() * 0.3;
  }
  const ashGeo = new THREE.BufferGeometry();
  ashGeo.setAttribute('position', new THREE.BufferAttribute(ashPos, 3));
  const ash = new THREE.Points(ashGeo, new THREE.PointsMaterial({
    color: 0xd8c9a8, size: 0.3, transparent: true, opacity: 0.22,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  ash.frustumCulled = false;
  group.add(ash);

  // ==================================================================
  // 4. Océano de niebla rugiente (3 planos, ruido en GPU)
  // ==================================================================
  const fogMats = [];
  const fogSpecs = [
    { size: 190, y: -5.0, op: 0.34, rot: 0.0 },
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
    mat.uniforms.uTime.value = f.rot * 7;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(f.size, f.size, 96, 96), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.rotation.z = f.rot;
    plane.position.y = f.y;
    fogMats.push(mat);
    group.add(plane);
  }

  // ---------- Bucle ----------
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion();
  const _pos = new THREE.Vector3(), _scl = new THREE.Vector3(), _eul = new THREE.Euler();
  const _dir = new THREE.Vector3(), _UX = new THREE.Vector3(1, 0, 0);

  function update(dt, t) {
    // monolitos: deriva orgánica con cosenos desfasados
    for (const m of monoliths) {
      m.position.y = m.userData.baseY + Math.sin(t * 0.3 + m.userData.phase) * 2.6;
      m.rotation.y += dt * m.userData.spin;
    }

    // estrellas: parpadeo sutil + parallax lentísimo
    starGroup.rotation.y += dt * 0.004;
    starsBright.material.opacity = 0.75 + Math.sin(t * 2.3) * 0.15;

    // eclipse: corona girando + latido del aro
    corona.rotation.z += dt * 0.03;
    ringMat.emissiveIntensity = 6 + Math.sin(t * 0.7) * 0.8;

    // luna quebrada: rotación majestuosa
    moon2.rotation.y += dt * 0.02;

    // escombros flotantes: órbita lenta + tumbo propio
    for (let i = 0; i < DEBRIS; i++) {
      const d = dData[i];
      d.a += dt * d.drift;
      d.ex += dt * d.spin;
      d.ez += dt * d.spin * 0.7;
      _pos.set(Math.cos(d.a) * d.rad, d.y + Math.sin(t * 0.2 + d.a) * 0.8, Math.sin(d.a) * d.rad);
      _eul.set(d.ex, d.a, d.ez);
      _scl.set(d.size, d.size * d.sy, d.size * d.sz);
      _m4.compose(_pos, _q.setFromEuler(_eul), _scl);
      debris.setMatrixAt(i, _m4);
    }
    debris.instanceMatrix.needsUpdate = true;

    // meteoros: lanzamiento periódico y estela que se estira y desvanece
    for (const me of meteors) {
      if (!me.active) {
        me.next -= dt;
        if (me.next <= 0) {
          const a = rng() * PI2;
          me.from.set(Math.cos(a) * 190, 95 + rng() * 60, Math.sin(a) * 190);
          const a2 = a + Math.PI * 0.5 + (rng() - 0.5) * 1.0;
          me.to.set(Math.cos(a2) * 190, 15 + rng() * 45, Math.sin(a2) * 190);
          me.t = 0; me.dur = 0.7 + rng() * 0.7;
          me.active = true; me.mesh.visible = true;
        }
      } else {
        me.t += dt;
        const k = me.t / me.dur;
        if (k >= 1) {
          me.active = false; me.mesh.visible = false;
          me.next = 4 + rng() * 11;
        } else {
          me.mesh.position.lerpVectors(me.from, me.to, k);
          _dir.subVectors(me.to, me.from).normalize();
          me.mesh.quaternion.setFromUnitVectors(_UX, _dir);
          const fade = Math.sin(k * Math.PI);
          me.mesh.scale.set(16 + fade * 22, 0.8, 1);
          me.mesh.material.opacity = fade * 0.9;
        }
      }
    }

    // ceniza ascendiendo con reciclado al fondo del abismo
    const p = ashGeo.attributes.position;
    for (let i = 0; i < ashCount; i++) {
      let y = p.array[i * 3 + 1] + dt * ashSpeed[i];
      if (y > Y_MAX) y = Y_MIN;
      p.array[i * 3 + 1] = y;
    }
    p.needsUpdate = true;

    // océano de niebla
    for (const mat of fogMats) mat.uniforms.uTime.value += dt;
  }

  return { group, update };
}
