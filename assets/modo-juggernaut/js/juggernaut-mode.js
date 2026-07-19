// Modo Juggernaut — núcleo de reglas, estados y animación procedural.
// Motor-agnóstico: el bucle anfitrión (vanilla o useFrame de R3F) llama a
// mode.update(dt, t). Los eventos "de red" salen por NetworkBus (EventTarget):
// en multijugador real, un adaptador websocket los publica/consume tal cual.

import * as THREE from 'three';
import { EnemySystem, lerpAngle } from '../../ejecutor-del-vacio/js/enemy-system.js';
import { animateExecutorWalk, animateExecutorSlam } from '../../ejecutor-del-vacio/js/executor.js';
import { MAT } from '../../caballero-templario/js/knight.js';
import { KnightAnimator } from '../../caballero-templario/js/knight-anim.js';

export const NetworkBus = new EventTarget();
const emit = (type, detail = {}) =>
  NetworkBus.dispatchEvent(new CustomEvent(type, { detail }));

export const STATES = {
  HUNT: 'HUNT',
  TACKLE_DASH: 'TACKLE_DASH',
  DODGE_ROLL: 'DODGE_ROLL',
  FALLING: 'FALLING',
  CORRUPTION_TRANSFORMATION: 'CORRUPTION_TRANSFORMATION',
  JUGGERNAUT: 'JUGGERNAUT',
  GROUND_SLAM: 'GROUND_SLAM',
};

const CYAN = new THREE.Color(0x49e6ff);
const RED = new THREE.Color(0xff0000);
const easeOutExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));

// ---------- Cazador (Templario Estelar) ----------
class Hunter {
  constructor(id, group, arenaRadius) {
    this.id = id;
    this.group = group;
    this.position = group.position;
    this.velocity = new THREE.Vector3();
    this.radius = 0.45;
    this.arenaRadius = arenaRadius;
    this.state = STATES.HUNT;
    this.falling = false;         // contrato con EnemySystem
    this.speed = 3.1;
    this.stateT = 0;
    this.tackleCd = 2 + Math.random() * 3;
    this.dodgeCd = 0;
    this.grabCd = 0;              // castigo tras perder el estandarte
    this.respawnT = 0;
    this.wanderPhase = Math.random() * Math.PI * 2; // cada uno deambula distinto
    this.anim = new KnightAnimator(group);
    this.inputDir = null;      // Vector3 → control humano; null → IA
    this.wantsTackle = false;  // flags de input (se convierten en buffer)
    this.wantsDodge = false;
    this.tackleBuf = 0;        // input buffering: la pulsación espera al
    this.dodgeBuf = 0;         // cooldown hasta 0.35 s, nunca se traga
    this._turn = 0;            // velocidad de giro normalizada (lean de curva)
    this._dashDir = new THREE.Vector3();
    this._side = new THREE.Vector3();

    // Visor propio (clonado): el material compartido no sirve para flashes por-jugador
    this.visorMat = null;
    group.traverse((o) => {
      if (o.isMesh && o.material === MAT.visor) {
        o.material = o.material.clone();
        this.visorMat = o.material;
      }
    });
  }

  setState(s) { this.state = s; this.stateT = 0; }

  update(dt, t, ctx) {
    this.stateT += dt;
    this.tackleCd -= dt; this.dodgeCd -= dt; this.grabCd -= dt;
    const p = this.position;

    if (this.state === STATES.FALLING) {
      this.velocity.y -= 7.5 * dt;
      p.addScaledVector(this.velocity, dt);
      this.group.rotation.x += dt * 1.4;
      this.anim.fall(dt, t);
      if (p.y < -14) {
        this.respawnT += dt;
        if (this.respawnT > 1.5) {
          const a = Math.random() * Math.PI * 2;
          p.set(Math.cos(a) * 3.5, 0, Math.sin(a) * 3.5);
          this.velocity.set(0, 0, 0);
          this.group.rotation.set(0, 0, 0);
          this.respawnT = 0;
          this.falling = false;
          this.setState(STATES.HUNT);
        }
      }
      return;
    }

    if (this.state === STATES.TACKLE_DASH) {
      // Placaje en 3 fases: anticipación (0–0.22, telegrafiado, sin avance) →
      // embestida explosiva (0.22–0.75) → recuperación con deslizamiento
      const DUR = 0.55;
      const k = Math.min(this.stateT / DUR, 1);
      let moveK = 0;
      if (k > 0.22 && k <= 0.75) moveK = 1 - easeOutExpo((k - 0.22) / 0.53);
      else if (k > 0.75) moveK = 0.12; // resbala al frenar
      p.addScaledVector(this._dashDir, (this.speed * 0.4 + 14 * moveK) * dt);

      // solo conecta durante la embestida (la anticipación se puede esquivar)
      if (ctx.boss && ctx.bossActive && k > 0.22) {
        const d = p.distanceTo(ctx.boss.position);
        if (d < 1.5) ctx.onTackleHit(this); // ¡derribo! suelta el estandarte
      }
      this._postMove(dt);
      this.anim.tackle(dt, k);
      if (k >= 1) this.setState(STATES.HUNT);
      return;
    }

    if (this.state === STATES.DODGE_ROLL) {
      // Esquiva: voltereta 360° o deslizamiento bajo (estilo del animador)
      const DUR = 0.45;
      const k = Math.min(this.stateT / DUR, 1);
      if (this.anim.dodgeStyle === 'giro') {
        this.group.rotation.z = k * Math.PI * 2;
      }
      const boost = this.anim.dodgeStyle === 'giro' ? 7.5 : 9.2;
      p.addScaledVector(this._side, boost * (1 - k * 0.5) * dt);
      if (k >= 1) { this.group.rotation.z = 0; this.setState(STATES.HUNT); }
      this._postMove(dt);
      this.anim.dodge(dt, k);
      return;
    }

    // ----- HUNT: perseguir estandarte o acosar al Juggernaut -----
    const desired = new THREE.Vector3();
    if (this.inputDir) {
      // Control humano: WASD relativo a cámara + acciones manuales
      const hasDir = this.inputDir.lengthSq() > 0.01;
      const facing = new THREE.Vector3(
        Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y)
      );
      if (this.wantsDodge) { this.wantsDodge = false; this.dodgeBuf = 0.35; }
      if (this.wantsTackle) { this.wantsTackle = false; this.tackleBuf = 0.35; }
      this.dodgeBuf -= dt; this.tackleBuf -= dt;

      if (this.dodgeBuf > 0 && this.dodgeCd <= 0) {
        this.dodgeBuf = 0;
        this.dodgeCd = 1.2;
        this._side.copy(hasDir ? this.inputDir : facing).normalize();
        this.anim.startDodge();
        this.setState(STATES.DODGE_ROLL);
        return;
      }
      if (this.tackleBuf > 0 && this.tackleCd <= 0) {
        this.tackleBuf = 0;
        this.tackleCd = 1.6;
        this._dashDir.copy(hasDir ? this.inputDir : facing).normalize();
        this.anim.startTackle();
        emit('TACKLE_DASH', { playerId: this.id });
        this.setState(STATES.TACKLE_DASH);
        return;
      }
      if (hasDir) desired.copy(this.inputDir).normalize().multiplyScalar(this.speed);
    } else if (!ctx.bossActive) {
      if (this.grabCd <= 0 && ctx.flagFree) {
        desired.subVectors(ctx.flagPos, p).setY(0);
        if (desired.length() > 0.2) desired.normalize().multiplyScalar(this.speed);
      } else {
        desired.set(
          Math.sin(this.wanderPhase + t * 0.5), 0,
          Math.cos(this.wanderPhase + t * 0.35)
        ).multiplyScalar(1.4);
      }
    } else {
      const toBoss = new THREE.Vector3().subVectors(ctx.boss.position, p).setY(0);
      const d = toBoss.length();
      toBoss.normalize();

      // El jefe carga el slam y estoy cerca → rodada lateral
      if (ctx.slamCharging && d < 5 && this.dodgeCd <= 0) {
        this._side.crossVectors(toBoss, new THREE.Vector3(0, 1, 0)).normalize();
        if (Math.random() < 0.5) this._side.negate();
        this.dodgeCd = 2.5;
        this.anim.startDodge();
        this.setState(STATES.DODGE_ROLL);
        return;
      }
      // A distancia de placaje y con el cooldown listo → TACKLE_DASH
      if (d < 3.6 && d > 1.4 && this.tackleCd <= 0) {
        this.tackleCd = 3 + Math.random() * 3;
        this._dashDir.copy(toBoss);
        this.anim.startTackle();
        emit('TACKLE_DASH', { playerId: this.id });
        this.setState(STATES.TACKLE_DASH);
        return;
      }
      // Mantener un anillo de acoso alrededor del jefe
      const ringDist = 3.0;
      desired.copy(toBoss).multiplyScalar((d - ringDist) * 1.6);
      this._side.crossVectors(toBoss, new THREE.Vector3(0, 1, 0));
      desired.addScaledVector(this._side, Math.sin(t * 0.9 + this.id.length) * 1.4);
      desired.clampLength(0, this.speed);
    }

    this.velocity.x += (desired.x - this.velocity.x) * Math.min(1, dt * 4);
    this.velocity.z += (desired.z - this.velocity.z) * Math.min(1, dt * 4);
    this._postMove(dt);
    // golpeado en pleno vuelo → tambaleo; si no, locomoción normal
    const speedNow = Math.hypot(this.velocity.x, this.velocity.z);
    if (speedNow > this.speed * 1.55) this.anim.stagger(dt, t);
    else this.anim.locomotion(dt, t, speedNow, this._turn);
  }

  _postMove(dt) {
    const p = this.position;
    // inercia del knockback: rozamiento
    const knocked = this.velocity.lengthSq() > this.speed * this.speed * 2.4;
    if (knocked) {
      this.velocity.x *= 1 - Math.min(1, dt * 2.2);
      this.velocity.z *= 1 - Math.min(1, dt * 2.2);
    }
    // GRAVEDAD: los golpes lanzan en arco y se ATERRIZA; sin esto los
    // jugadores salían volando y se quedaban flotando para siempre
    if (p.y > 0 || this.velocity.y !== 0) this.velocity.y -= 9 * dt;
    if (this.state !== STATES.TACKLE_DASH) p.addScaledVector(this.velocity, dt);
    else p.y += this.velocity.y * dt;
    if (p.y < 0) { p.y = 0; this.velocity.y = 0; }

    const r = Math.sqrt(p.x * p.x + p.z * p.z);
    if (r > this.arenaRadius - 0.35) {
      // solo hay ring-out si de verdad se sale, o si vuela hacia FUERA
      const outward = (this.velocity.x * p.x + this.velocity.z * p.z) > 0;
      if (r > this.arenaRadius || (knocked && outward)) {
        this.falling = true;
        this.velocity.y = 1.5;
        emit('RING_OUT', { playerId: this.id });
        this.setState(STATES.FALLING);
      } else {
        p.x *= (this.arenaRadius - 0.35) / r;
        p.z *= (this.arenaRadius - 0.35) / r;
      }
    }
    // Encara hacia donde se mueve, con giro suavizado + registro del giro
    if (this.velocity.lengthSq() > 0.4 && this.state === STATES.HUNT) {
      const prev = this.group.rotation.y;
      const target = Math.atan2(this.velocity.x, this.velocity.z);
      this.group.rotation.y = lerpAngle(prev, target, Math.min(1, dt * 9));
      const dAng = this.group.rotation.y - prev;
      this._turn += ((dAng / Math.max(dt, 0.001)) / 6 - this._turn) * Math.min(1, dt * 8);
      this._turn = THREE.MathUtils.clamp(this._turn, -1, 1);
    } else {
      this._turn *= 1 - Math.min(1, dt * 6);
    }
  }
}

// ---------- Orquestador del modo ----------
export class JuggernautMode {
  constructor(scene, { arenaRadius, hunterCount = 11, knightFactory, executorFactory, flag }) {
    this.scene = scene;
    this.arenaRadius = arenaRadius;
    this.flag = flag;
    this.flagHome = flag.position.clone();

    // 11 cazadores (una sola malla por jugador, reutilizada siempre: sin fugas)
    this.hunters = [];
    for (let i = 0; i < hunterCount; i++) {
      const knight = knightFactory();
      knight.scale.setScalar(0.92);
      const a = (i / hunterCount) * Math.PI * 2;
      const r = arenaRadius * 0.4 + (i % 3);
      knight.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      scene.add(knight);
      this.hunters.push(new Hunter(`J-${i + 1}`, knight, arenaRadius));
    }

    // UN solo Ejecutor reutilizado para cualquier portador (cero popping/leaks)
    this.executor = executorFactory();
    this.executor.visible = false;
    scene.add(this.executor);
    this.bossVisor = this.executor.userData.visorMat;

    this.ai = new EnemySystem(this.executor, {
      speed: 2.9, arenaRadius, collisionRadius: 1.1, knockbackForce: 11,
    });

    this.phase = 'FREE';        // FREE | TRANSFORM | ACTIVE
    this.holder = null;         // Hunter transformado en Juggernaut
    this.transformT = 0;
    this.flagCd = 0;

    // Control humano y marcador de Dominio
    this.controlled = null;               // Hunter bajo control del jugador
    this.controlDir = new THREE.Vector3();
    this.requestSlam = false;
    this.holdTimes = new Map();           // id → segundos como Juggernaut

    this.slam = { active: false, t: 0, charging: false, cd: 3 };
    this.shakeFrames = 0;       // el anfitrión lo consume para sacudir la cámara
    this.spawnGrace = 0;        // inmunidad al placaje tras nacer

    // onda expansiva (una sola malla reutilizada para slam y nacimiento)
    this.slamRing = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.05, 48),
      new THREE.MeshBasicMaterial({
        color: 0xff2200, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    this.slamRing.rotation.x = -Math.PI / 2;
    this.slamRing.visible = false;
    scene.add(this.slamRing);
  }

  _burstRing(pos) {
    this.slamRing.visible = true;
    this.slamRing.position.set(pos.x, 0.06, pos.z);
    this.slamRing.scale.setScalar(1);
    this.slamRing.material.opacity = 0.9;
  }

  // Control humano de un cazador (null → todo IA)
  setControlled(hunter) {
    if (this.controlled) this.controlled.inputDir = null;
    this.controlled = hunter;
    if (hunter) {
      hunter.inputDir = new THREE.Vector3();
      hunter.tackleCd = 0; // sin cooldowns heredados de la IA:
      hunter.dodgeCd = 0;  // las acciones responden desde el primer frame
    }
  }

  // Mejor marca de Dominio: [id, segundos] o null
  bestDominio() {
    let best = null;
    for (const [id, s] of this.holdTimes) {
      if (!best || s > best[1]) best = [id, s];
    }
    return best;
  }

  // --- placaje conecta con el jefe: el estandarte cae ---
  _onTackleHit(hunter) {
    if (this.phase !== 'ACTIVE') return;

    // rebote del placador (bounce-back)
    const back = new THREE.Vector3()
      .subVectors(hunter.position, this.executor.position).setY(0).normalize();
    hunter.velocity.addScaledVector(back, 9);
    hunter.velocity.y = 1.6;

    // recién nacido: el placaje rebota sin arrancarle el estandarte
    if (this.spawnGrace > 0) return;
    emit('FLAG_DROPPED', { by: hunter.id, from: this.holder.id });

    // el estandarte cae al mundo donde estaba el jefe
    this.scene.attach(this.flag);
    this.flag.position.y = 0;
    this.flag.rotation.set(0, this.flag.rotation.y, 0);
    this.flag.scale.setScalar(1); // attach hereda la escala del jefe: resetear
    const r = Math.hypot(this.flag.position.x, this.flag.position.z);
    const maxR = this.arenaRadius - 1.5;
    if (r > maxR) { this.flag.position.x *= maxR / r; this.flag.position.z *= maxR / r; }
    this.flagCd = 1.2;

    // el portador vuelve a ser templario, expulsado hacia atrás
    const h = this.holder;
    h.group.position.copy(this.executor.position);
    h.group.position.y = 0;
    h.group.rotation.set(0, this.executor.rotation.y, 0);
    h.group.visible = true;
    h.velocity.addScaledVector(back, -7);
    h.grabCd = 2.5;
    if (h.visorMat) {
      h.visorMat.emissive.copy(CYAN);
      h.visorMat.emissiveIntensity = 3.5;
    }

    this.executor.visible = false;
    this.executor.scale.setScalar(1);
    this.slam.active = false; this.slam.charging = false;
    this.holder = null;
    this.phase = 'FREE';
  }

  _startTransform(hunter) {
    emit('FLAG_CAPTURED', { playerId: hunter.id });
    this.holder = hunter;
    this.phase = 'TRANSFORM';
    this.transformT = 0;
    hunter.velocity.set(0, 0, 0); // vector de traslación congelado 0.4 s
    hunter.setState(STATES.CORRUPTION_TRANSFORMATION);
  }

  _finishTransform() {
    const h = this.holder;
    h.group.visible = false;
    this.executor.position.copy(h.group.position);
    this.executor.position.y = 0;
    this.executor.rotation.set(0, h.group.rotation.y, 0);
    this.executor.scale.setScalar(1.0); // el lerp 1.0 → 1.38 corre en update
    this.executor.visible = true;
    this.bossVisor.emissive.copy(RED);
    this.bossVisor.emissiveIntensity = 45;

    // El estandarte se ancla a la mano de garra (la derecha empuña el hacha)
    this.executor.add(this.flag);
    this.flag.position.set(-0.62, 0.95, 0.28);
    this.flag.rotation.set(0.12, 0.4, -0.18);
    this.flag.scale.setScalar(0.8);

    this.phase = 'ACTIVE';
    this.slam.cd = 2.2; // el primer slam llega pronto: el jefe impone respeto
    this.spawnGrace = 1.5;

    // Onda de corrupción: el nacimiento expulsa a todos los cercanos
    this._burstRing(this.executor.position);
    this.shakeFrames = 6;
    for (const other of this.hunters) {
      if (other === h || other.falling) continue;
      const d = other.position.distanceTo(this.executor.position);
      if (d < 4.2) {
        const out = new THREE.Vector3()
          .subVectors(other.position, this.executor.position).setY(0).normalize();
        other.velocity.addScaledVector(out, 10 * (1 - d / 5));
        other.velocity.y = 2.0;
      }
    }
    emit('JUGGERNAUT_BORN', { playerId: h.id });
  }

  _updateSlam(dt, t, activeHunters) {
    const s = this.slam;
    const e = this.executor;
    if (!s.active) {
      s.cd -= dt;
      const near = activeHunters.filter((h) => h.position.distanceTo(e.position) < 4.5);
      const manual = this.requestSlam;
      this.requestSlam = false;
      if (s.cd <= 0 && (near.length >= 2 || manual)) {
        s.active = true; s.charging = true; s.t = 0; s.holdFrames = 0;
        emit('GROUND_SLAM', { playerId: this.holder.id, phase: 'windup' });
      }
      return false;
    }
    s.t += dt;
    const RISE = 0.55;
    if (s.charging) {
      if (s.t < RISE) {
        // el torso trepa en Y con la senoide de la spec
        e.position.y = Math.sin((s.t / RISE) * Math.PI / 2) * 1.35;
      } else if (s.holdFrames < 3) {
        s.holdFrames++;               // 3 frames suspendido en el aire
        e.position.y = 1.35;
      } else {
        s.charging = false; s.t = 0;
      }
      animateExecutorSlam(e, 'windup', s.t * 3);
      return true;
    }
    // caída a 5× la velocidad de subida
    e.position.y = Math.max(0, 1.35 - (s.t * 5 * (1.35 / RISE)));
    animateExecutorSlam(e, 'impact');
    if (e.position.y <= 0) {
      s.active = false; s.cd = 4.5 + Math.random() * 2;
      this.shakeFrames = 10;          // 10 frames de micro-sacudidas de cámara
      emit('GROUND_SLAM', { playerId: this.holder.id, phase: 'impact' });
      for (const h of activeHunters) {
        const d = h.position.distanceTo(e.position);
        if (d < 4.5) {
          const out = new THREE.Vector3().subVectors(h.position, e.position).setY(0).normalize();
          h.velocity.addScaledVector(out, 11 * (1 - d / 5));
          h.velocity.y = 2.4;
        }
      }
      this._burstRing(e.position);
    }
    return true;
  }

  update(dt, t) {
    this.flagCd -= dt;
    this.spawnGrace -= dt;
    this.flag.userData.update(t);

    // onda expansiva del slam desvaneciéndose
    if (this.slamRing && this.slamRing.visible) {
      this.slamRing.scale.addScalar(dt * 9);
      this.slamRing.material.opacity -= dt * 1.6;
      if (this.slamRing.material.opacity <= 0) this.slamRing.visible = false;
    }

    const activeHunters = this.hunters.filter((h) => h !== this.holder);
    const bossActive = this.phase === 'ACTIVE';

    const ctx = {
      flagPos: this.flag.getWorldPosition(new THREE.Vector3()),
      flagFree: this.phase === 'FREE' && this.flagCd <= 0,
      boss: bossActive ? this.executor : null,
      bossActive,
      slamCharging: this.slam.charging,
      onTackleHit: (h) => this._onTackleHit(h),
    };

    for (const h of activeHunters) h.update(dt, t, ctx);

    // Separación entre cazadores (relajación posicional): nada de apiñarse
    for (let i = 0; i < activeHunters.length; i++) {
      const a = activeHunters[i];
      if (a.falling) continue;
      for (let j = i + 1; j < activeHunters.length; j++) {
        const b = activeHunters[j];
        if (b.falling) continue;
        const dx = a.position.x - b.position.x;
        const dz = a.position.z - b.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.0001 && d2 < 1.0) {
          const d = Math.sqrt(d2);
          const corr = (1.0 - d) * 0.18;
          const nx = dx / d, nz = dz / d;
          a.position.x += nx * corr; a.position.z += nz * corr;
          b.position.x -= nx * corr; b.position.z -= nz * corr;
        }
      }
    }

    if (this.phase === 'FREE') {
      // Disparador de proximidad del estandarte
      if (this.flagCd <= 0) {
        for (const h of activeHunters) {
          if (h.falling || h.grabCd > 0 || h.state !== STATES.HUNT) continue;
          if (h.position.distanceTo(ctx.flagPos) < 1.0) { this._startTransform(h); break; }
        }
      }
    } else if (this.phase === 'TRANSFORM') {
      // 0.4 s congelado mientras la corrupción lo devora; el visor pasa
      // violentamente de cian a rojo ardiente
      this.transformT += dt;
      const h = this.holder;
      const k = Math.min(this.transformT / 0.4, 1);
      if (h.visorMat) {
        h.visorMat.emissive.copy(CYAN).lerp(RED, k);
        h.visorMat.emissiveIntensity = 3.5 + (45 - 3.5) * k * (0.55 + 0.45 * Math.sin(t * 70));
      }
      h.anim.grab(dt, k);              // reverencia: arranca el estandarte
      h.group.rotation.y += dt * 9 * k; // convulsión
      if (k >= 1) this._finishTransform();
    } else if (this.phase === 'ACTIVE') {
      // Escala del jefe: lerp lineal 1.0 → 1.38
      const s = THREE.MathUtils.lerp(this.executor.scale.x, 1.38, Math.min(1, dt * 5));
      this.executor.scale.setScalar(s);

      // Dominio: acumula tiempo como Juggernaut
      const id = this.holder.id;
      this.holdTimes.set(id, (this.holdTimes.get(id) || 0) + dt);

      const slamming = this._updateSlam(dt, t, activeHunters);
      if (!slamming) {
        // si el humano ES el jefe, manda su input; si no, la IA persigue
        const manualDir = this.controlled === this.holder ? this.controlDir : null;
        this.ai.update(dt, t, activeHunters, manualDir); // persecución + golpes + visor
      } else {
        // durante el slam el visor arde fijo
        this.bossVisor.emissiveIntensity = 45;
      }
      animateExecutorWalk(this.executor, t, slamming ? 0 : 1);
    }
  }
}
