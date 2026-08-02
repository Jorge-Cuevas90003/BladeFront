// Sistema de IA y físicas del Ejecutor — motor-agnóstico (sin DOM, sin React).
// El bucle anfitrión (three vanilla o useFrame de R3F) llama a update(dt, t, players).
//
// players: [{ id, position: Vector3, velocity: Vector3, radius, falling }]

import * as THREE from 'three';

// Interpolación angular por el arco corto (giros suaves, sin snap robótico)
export function lerpAngle(a, b, k) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * k;
}

export class EnemySystem {
  constructor(enemy, {
    speed = 2.6,            // velocidad de persecución constante
    arenaRadius = 11,
    collisionRadius = 0.8,  // umbral de colisión (spec)
    knockbackForce = 13,    // impulso explosivo del impacto
    visorBase = 22,         // intensidad de reposo del visor
    visorFlash = 50,        // intensidad durante el impacto (5 frames)

    // ── Astucia (ambos a 0 = comportamiento original, literal) ──
    // Existen para que el Modo Juggernaut module la dificultad del jefe sin
    // tocar esta clase, que también usa la demo del Ejecutor. Con los valores
    // por defecto esta clase se comporta EXACTAMENTE como antes de existir.
    prediccion = 0,         // 0 = va a donde estás; 1 = a donde vas a estar
    sesgoBorde = 0,         // 0 = siempre al más cercano; >0 = prefiere al que
                            //     ya está cerca del abismo (sacarlo cuesta menos)
  } = {}) {
    this.enemy = enemy;
    this.speed = speed;
    this.arenaRadius = arenaRadius;
    this.collisionRadius = collisionRadius;
    this.knockbackForce = knockbackForce;
    this.visorBase = visorBase;
    this.visorFlash = visorFlash;
    this.prediccion = prediccion;
    this.sesgoBorde = sesgoBorde;

    // Estado espacial (equivalente al useRef de la spec)
    this.position = enemy.position;
    this.velocity = new THREE.Vector3();
    this.targetPlayerId = null;

    this.flashFrames = 0;
    this._dir = new THREE.Vector3();
    this._cooldown = new Map(); // anti multi-golpe por jugador
  }

  // Reajuste en caliente: cambiar de dificultad a mitad de ronda no debe
  // obligar a reconstruir el jefe (perdería posición, cooldowns y visor).
  configurar({ velocidad, prediccion, sesgoBorde } = {}) {
    if (velocidad !== undefined) this.speed = velocidad;
    if (prediccion !== undefined) this.prediccion = prediccion;
    if (sesgoBorde !== undefined) this.sesgoBorde = sesgoBorde;
  }

  // overrideDir (opcional): dirección manual normalizable — si se pasa, el
  // steering la usa en vez de perseguir (modo jugador-jefe); la detección de
  // colisión sigue funcionando contra el jugador más cercano.
  update(dt, t, players, overrideDir = null) {
    const e = this.position;

    // --- 1. Escaneo de proximidad: jugador activo más cercano (euclídea en XZ) ---
    //
    // Se distinguen DOS cosas que antes eran la misma:
    //   · `closest` — el más cercano de verdad. Manda en la colisión, siempre.
    //   · `objetivo` — a quién persigue. Con sesgoBorde = 0 es el mismo, así
    //     que el comportamiento original queda intacto; con sesgoBorde > 0 el
    //     jefe prefiere a quien ya está pegado al abismo, porque empujarlo
    //     cuesta un golpe en vez de tres.
    let closest = null;
    let best = Infinity;
    let objetivo = null;
    let mejorPuntos = Infinity;
    for (const p of players) {
      if (p.falling) continue;
      const dist = Math.sqrt((e.x - p.position.x) ** 2 + (e.z - p.position.z) ** 2);
      if (dist < best) { best = dist; closest = p; }

      // Cuanto más cerca del filo esté el jugador, más se le descuenta de la
      // distancia: pasa a "parecer" más cerca de lo que está y gana prioridad.
      const rBorde = Math.hypot(p.position.x, p.position.z) / this.arenaRadius;
      const puntos = dist - rBorde * rBorde * this.sesgoBorde * this.arenaRadius * 0.6;
      if (puntos < mejorPuntos) { mejorPuntos = puntos; objetivo = p; }
    }
    this.targetPlayerId = objetivo ? objetivo.id : null;

    const manual = overrideDir !== null;
    const manualIdle = manual && overrideDir.lengthSq() < 0.01;

    if (closest || manual) {
      // --- 2. Steering: vector direccional normalizado hacia el objetivo ---
      if (manual) {
        this._dir.copy(manualIdle ? this._dir : overrideDir);
        this._dir.y = 0;
        if (this._dir.lengthSq() > 0) this._dir.normalize();
      } else {
        this._dir.subVectors(objetivo.position, e);
        this._dir.y = 0;

        // Interceptar en vez de seguir. Persiguiendo la posición actual el
        // jefe va siempre por detrás y basta con correr en círculos para
        // torearlo eternamente; apuntando a donde ESTARÁ, corta el ángulo.
        // El adelanto es el tiempo que tardaría en llegar, y se limita a 1.2 s
        // para que un objetivo lejano no lo mande a perseguir el horizonte.
        if (this.prediccion > 0 && objetivo.velocity) {
          const adelanto = Math.min(this._dir.length() / Math.max(this.speed, 0.001), 1.2);
          this._dir.x += objetivo.velocity.x * adelanto * this.prediccion;
          this._dir.z += objetivo.velocity.z * adelanto * this.prediccion;
        }
        this._dir.normalize();
      }

      // Avance a velocidad de rastreo constante (quieto si es manual sin input)
      if (!manualIdle) {
        this.velocity.copy(this._dir).multiplyScalar(this.speed);
        e.addScaledVector(this._dir, this.speed * dt);
      } else {
        this.velocity.set(0, 0, 0);
      }

      // No sale de la arena
      const r = Math.sqrt(e.x * e.x + e.z * e.z);
      const maxR = this.arenaRadius - 1.0;
      if (r > maxR) { e.x *= maxR / r; e.z *= maxR / r; }

      // --- Rotación: encara al objetivo con giro PESADO (masa de jefe) ---
      if (!manualIdle && this._dir.lengthSq() > 0) {
        this.enemy.rotation.y = lerpAngle(
          this.enemy.rotation.y,
          Math.atan2(this._dir.x, this._dir.z),
          Math.min(1, dt * 4.5)
        );
      }
      this.enemy.rotation.x = 0.05;

      // --- 3. Colisión cinética y knockback ---
      const cd = closest ? (this._cooldown.get(closest.id) || 0) : Infinity;
      if (closest && best < this.collisionRadius + closest.radius && cd <= 0) {
        // Impulso explosivo desde el centro del impacto hacia fuera:
        // se inyecta directo en las físicas del jugador → ring-out hacia el abismo
        const impact = new THREE.Vector3()
          .subVectors(closest.position, e).setY(0).normalize();
        if (impact.lengthSq() < 0.5) impact.copy(this._dir); // superpuestos: usa el avance
        closest.velocity.addScaledVector(impact, this.knockbackForce);
        closest.velocity.y = 2.2; // pequeño despegue para vender el golpe
        this.flashFrames = 5;
        this._cooldown.set(closest.id, 0.7);
      }
    }
    for (const [id, v] of this._cooldown) if (v > 0) this._cooldown.set(id, v - dt);

    // Zancada pesada (bob de pisada)
    this.enemy.position.y = Math.abs(Math.sin(t * 4.6)) * 0.05;

    // --- 4. Retroalimentación visual: flash del visor y pulso del filo ---
    const { visorMat, heatMat, glowLight } = this.enemy.userData;
    if (this.flashFrames > 0) {
      visorMat.emissiveIntensity = this.visorFlash;
      if (glowLight) glowLight.intensity = 9;
      this.flashFrames--;
    } else {
      visorMat.emissiveIntensity = this.visorBase + Math.sin(t * 5.2) * 2.5;
      if (glowLight) glowLight.intensity = 1.4;
    }
    heatMat.emissiveIntensity = 2.2 + (Math.sin(t * 3.1) * 0.5 + 0.5) * 1.6;
  }
}

// Física mínima de jugador para la demo y el juego real:
// huida + inercia del knockback + caída al vacío (ring-out) + respawn.
export class PlayerSim {
  constructor(id, group, arenaRadius) {
    this.id = id;
    this.group = group;
    this.position = group.position;
    this.velocity = new THREE.Vector3();
    this.radius = 0.45;
    this.arenaRadius = arenaRadius;
    this.falling = false;
    this.respawnT = 0;
    this.speed = 3.0;
    this._wander = new THREE.Vector3();
    this._pickWander();
  }

  _pickWander() {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * this.arenaRadius * 0.55;
    this._wander.set(Math.cos(a) * r, 0, Math.sin(a) * r);
  }

  update(dt, enemyPos) {
    const p = this.position;

    if (this.falling) {
      // Caída al abismo de niebla
      this.velocity.y -= 7.5 * dt;
      p.addScaledVector(this.velocity, dt);
      this.group.rotation.x += dt * 1.2;
      if (p.y < -14) {
        this.respawnT += dt;
        if (this.respawnT > 1.4) {
          const a = Math.random() * Math.PI * 2;
          p.set(Math.cos(a) * 3, 0, Math.sin(a) * 3);
          this.velocity.set(0, 0, 0);
          this.group.rotation.set(0, 0, 0);
          this.falling = false;
          this.respawnT = 0;
        }
      }
      return;
    }

    const knocked = this.velocity.lengthSq() > this.speed * this.speed * 2.2;
    if (!knocked) {
      // Deambula + huye del Ejecutor
      const desired = this._wander.clone().sub(p);
      if (desired.length() < 1.2) this._pickWander();
      desired.y = 0;
      desired.normalize().multiplyScalar(this.speed);
      const dEnemy = p.distanceTo(enemyPos);
      if (dEnemy < 7) {
        const flee = p.clone().sub(enemyPos).setY(0).normalize()
          .multiplyScalar(this.speed * (1.6 - dEnemy / 7));
        desired.add(flee);
      }
      this.velocity.x += (desired.x - this.velocity.x) * Math.min(1, dt * 4);
      this.velocity.z += (desired.z - this.velocity.z) * Math.min(1, dt * 4);
      this.velocity.y = 0;
    } else {
      // Inercia del golpe: solo la frena el rozamiento
      this.velocity.x *= 1 - Math.min(1, dt * 2.2);
      this.velocity.z *= 1 - Math.min(1, dt * 2.2);
      this.velocity.y = Math.max(this.velocity.y - 7.5 * dt, -3);
    }

    p.addScaledVector(this.velocity, dt);
    if (p.y < 0) { p.y = 0; this.velocity.y = 0; }

    // Ring-out: cruzar el borde = caer a la niebla
    const r = Math.sqrt(p.x * p.x + p.z * p.z);
    if (r > this.arenaRadius - 0.35) {
      if (knocked || r > this.arenaRadius) {
        this.falling = true;
        this.velocity.y = 1.5;
      } else {
        // paseo normal: no se tira solo
        p.x *= (this.arenaRadius - 0.35) / r;
        p.z *= (this.arenaRadius - 0.35) / r;
      }
    }

    // Encara hacia donde se mueve, con giro suavizado
    if (this.velocity.lengthSq() > 0.4) {
      this.group.rotation.y = lerpAngle(
        this.group.rotation.y,
        Math.atan2(this.velocity.x, this.velocity.z),
        Math.min(1, dt * 8)
      );
    }
  }
}
