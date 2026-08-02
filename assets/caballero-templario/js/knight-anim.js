// Animador procedural del Caballero Templario — sin esqueletos ni clips:
// ciclos matemáticos sobre los pivotes del rig (pierna_±1, torsoSup, cabeza,
// espada, capa) + inclinación de raíz. Mezcla suave en todos los estados.
//
// Variedad:
//  - marcha con cadencia única, contra-rotación de hombros, doble armónico
//  - 5 variantes de idle rotativas
//  - 3 variantes de PLACAJE en 3 fases (anticipación → embestida → recuperación)
//  - 2 estilos de esquiva (voltereta / deslizamiento bajo)
//  - tambaleo al recibir un golpe (stagger)

import * as THREE from 'three';

const IDLE_VARIANTS = ['respirar', 'mirar', 'peso', 'pomo', 'guardia', 'floritura', 'revisar_filo', 'desafio', 'alerta'];
const TACKLE_VARIANTS = ['hombro', 'estocada', 'plancha'];
const DODGE_STYLES = ['giro', 'deslizamiento'];

export class KnightAnimator {
  constructor(knight) {
    this.root = knight;
    this.legR = knight.getObjectByName('pierna_1');
    this.legL = knight.getObjectByName('pierna_-1');
    this.torso = knight.getObjectByName('torsoSup');
    this.head = knight.getObjectByName('cabeza');
    this.sword = knight.getObjectByName('espada');
    this.cape = knight.getObjectByName('capa');

    this.phase = Math.random() * Math.PI * 2;      // cada uno pisa distinto
    this.gaitFreq = 7.4 + Math.random() * 1.6;     // ...y a su propio ritmo
    this._prevSpeed = 0;                            // para el lean de aceleración
    this._accelSm = 0;

    this.tackleVariant = 'hombro';
    this.dodgeStyle = 'giro';

    this._T = {
      legR: 0, legL: 0,
      // Apertura lateral de cada pierna. El pivote está en la cadera, así que
      // girar en Z separa el pie del eje del cuerpo: es lo que permite un paso
      // lateral de verdad en vez de girar el muñeco y andar siempre de frente.
      legRZ: 0, legLZ: 0,
      torsoX: 0, torsoZ: 0, torsoYaw: 0, torsoY: 0,
      headYaw: 0, headX: 0,
      swordX: 0,
      rootX: 0, // inclinación de todo el cuerpo (null → no tocar la raíz)
      rootZ: 0, // banqueo lateral de la raíz (null → no tocar)
    };

    this._idle = {
      current: IDLE_VARIANTS[Math.floor(Math.random() * IDLE_VARIANTS.length)],
      t: 0,
      next: 2.2 + Math.random() * 3.8,
    };
  }

  _apply(dt, k = 14) {
    const a = Math.min(1, dt * k), T = this._T;
    if (this.legR) {
      this.legR.rotation.x += (T.legR - this.legR.rotation.x) * a;
      this.legR.rotation.z += (T.legRZ - this.legR.rotation.z) * a;
    }
    if (this.legL) {
      this.legL.rotation.x += (T.legL - this.legL.rotation.x) * a;
      this.legL.rotation.z += (T.legLZ - this.legL.rotation.z) * a;
    }
    if (this.torso) {
      this.torso.rotation.x += (T.torsoX - this.torso.rotation.x) * a;
      this.torso.rotation.z += (T.torsoZ - this.torso.rotation.z) * a;
      this.torso.rotation.y += (T.torsoYaw - this.torso.rotation.y) * a;
      this.torso.position.y += (1.08 + T.torsoY - this.torso.position.y) * a;
    }
    if (this.head) {
      this.head.rotation.y += (T.headYaw - this.head.rotation.y) * a;
      this.head.rotation.x += (T.headX - this.head.rotation.x) * a;
    }
    if (this.sword) this.sword.rotation.x += (T.swordX - this.sword.rotation.x) * a;
    if (T.rootX !== null) {
      this.root.rotation.x += (T.rootX - this.root.rotation.x) * a;
    }
    if (T.rootZ !== null) {
      this.root.rotation.z += (T.rootZ - this.root.rotation.z) * a;
    }
  }

  _resetTargets() {
    const T = this._T;
    T.legR = 0; T.legL = 0; T.legRZ = 0; T.legLZ = 0;
    T.torsoX = 0; T.torsoZ = 0; T.torsoYaw = 0; T.torsoY = 0;
    T.headYaw = 0; T.headX = 0; T.swordX = 0; T.rootX = 0; T.rootZ = 0;
  }

  // ---------- Locomoción ----------
  //
  // `avance` y `lateral` son el movimiento EN EL MARCO DEL PROPIO CABALLERO,
  // normalizados a [-1, 1]: +1 de avance es ir de frente, -1 es retroceder, y
  // el lateral es cuánto se desplaza a su derecha. Con ellos hay tres marchas
  // distintas —frente, espaldas y paso lateral— en vez de una sola.
  //
  // Antes solo llegaba la RAPIDEZ, un escalar. Como el cuerpo giraba siempre
  // hacia donde se movía, todo se animaba como una marcha al frente: retroceder
  // era darse la vuelta y correr, y esquivar de lado era un giro de 90°. Los
  // valores por defecto (1, 0) reproducen ese comportamiento para cualquier
  // llamada antigua.
  locomotion(dt, t, speed, turn = 0, avance = 1, lateral = 0) {
    const w = THREE.MathUtils.clamp(speed / 3.0, 0, 1.3);
    if (w > 0.12) this._walk(dt, t, w, turn, avance, lateral);
    else this._idleUpdate(dt, t);
  }

  _walk(dt, t, w, turn, avance = 1, lateral = 0) {
    const f = this.gaitFreq * (0.5 + 0.5 * Math.min(w, 1));
    const th = t * f + this.phase;
    const s = Math.sin(th);
    // zancada asimétrica: la pierna se lanza rápido y se recoge lenta
    const stride = s + 0.22 * Math.sin(2 * th + 1.3);
    // pisada con peso: el bob cae seco y sube suave
    const foot = Math.pow(Math.abs(s), 0.7);
    // lean de aceleración: arranca inclinándose, frena echándose atrás
    const speed = w * 3.0;
    const accel = (speed - this._prevSpeed) / Math.max(dt, 0.001);
    this._prevSpeed = speed;
    this._accelSm += (THREE.MathUtils.clamp(accel, -6, 6) - this._accelSm) *
      Math.min(1, dt * 6);

    const av = THREE.MathUtils.clamp(avance, -1, 1);
    const lat = THREE.MathUtils.clamp(lateral, -1, 1);
    const atras = av < -0.15;
    // Cuanto más de lado va, menos zancada frontal le queda.
    const frontal = 1 - Math.abs(lat) * 0.65;
    // El paso hacia atrás es más corto y más cauto que el de frente: nadie
    // retrocede con la misma zancada con la que carga.
    const largoPaso = (atras ? -0.62 : 1) * frontal;

    const T = this._T;
    this._resetTargets();
    T.legR = stride * 0.58 * w * largoPaso;
    T.legL = -T.legR;

    // Paso lateral: las dos piernas se inclinan hacia el lado del
    // desplazamiento y se turnan para abrir y cerrar — el clásico
    // "sale una, cierra la otra" en vez de alternar hacia delante.
    if (Math.abs(lat) > 0.05) {
      const abre = 0.16 * Math.sin(th) * w;
      T.legRZ = lat * (0.15 * w + abre);
      T.legLZ = lat * (0.15 * w - abre);
    }

    // De espaldas el torso se yergue y se echa atrás; de frente se inclina.
    T.torsoX = (atras ? -0.09 : 0.14) * w + 0.02 * Math.sin(t * 1.6 + this.phase) +
      THREE.MathUtils.clamp(this._accelSm * 0.028, -0.16, 0.16);
    T.torsoZ = s * 0.042 * w - turn * 0.3 - lat * 0.14 * w;
    T.torsoYaw = -s * 0.12 * w + lat * 0.16 * w;
    T.torsoY = (foot * 0.045 + Math.sin(t * f * 2 + 0.7) * 0.011) * w;
    T.rootZ = -turn * 0.09 - lat * 0.07 * w; // banquea hacia la curva y hacia el lado
    // Mira hacia donde se desplaza aunque el cuerpo apunte a otro sitio: es lo
    // que vende que está rodeando a algo sin quitarle la vista de encima.
    T.headYaw = turn * 0.45 + lat * 0.34 + Math.sin(t * f * 0.5 + this.phase) * 0.05;
    T.headX = (atras ? 0.04 : -0.06) * w;
    // Retrocediendo la espada se cruza al frente, en guardia, en vez de ir
    // colgando hacia atrás como cuando se corre.
    T.swordX = (atras ? 0.28 : -0.5) * w;
    if (this.cape) {
      this.cape.rotation.x =
        Math.sin(t * 0.5 + this.phase) * 0.015 + (atras ? -0.12 : 0.32) * w +
        Math.sin(t * f + this.phase) * 0.03 * w;
    }
    this._apply(dt);
    this._idle.t = 0;
  }

  _idleUpdate(dt, t) {
    const I = this._idle;
    I.t += dt;
    if (I.t > I.next) {
      I.t = 0;
      I.next = 2.4 + Math.random() * 3.8;
      const others = IDLE_VARIANTS.filter((v) => v !== I.current);
      I.current = others[Math.floor(Math.random() * others.length)];
    }

    const T = this._T;
    const br = Math.sin(t * 1.5 + this.phase);
    this._resetTargets();
    T.torsoX = 0.024 * br;
    T.torsoY = 0.008 * br;
    T.torsoZ = 0.012 * Math.sin(t * 0.4 + this.phase); // micro-vaivén de peso
    T.swordX = Math.sin(t * 1.8 + this.phase) * 0.04;  // micro-respiración de la espada
    this._prevSpeed = 0; this._accelSm *= 0.9;

    switch (I.current) {
      case 'mirar':
        T.headYaw = Math.sin(t * 0.55 + this.phase) * 0.42;
        T.torsoYaw = Math.sin(t * 0.55 + this.phase) * 0.1;
        break;
      case 'peso':
        T.torsoZ = 0.05 + Math.sin(t * 0.5 + this.phase) * 0.02;
        T.legR = 0.07; T.legL = -0.05;
        break;
      case 'pomo':
        T.torsoX += 0.1;
        T.headX = 0.22;
        T.swordX = 0.1 + Math.sin(t * 2.0) * 0.05;
        break;
      case 'guardia': // alerta: espada un punto alzada, barre con la mirada
        T.swordX = -0.22 + Math.sin(t * 1.4 + this.phase) * 0.06;
        T.torsoX += 0.04;
        T.headYaw = Math.sign(Math.sin(t * 0.8 + this.phase)) * 0.35;
        break;
      case 'floritura': // blandir/rotar espada sutilmente en arco
        T.swordX = -0.38 + Math.sin(t * 2.2 + this.phase) * 0.25;
        T.torsoYaw = Math.sin(t * 1.4 + this.phase) * 0.18;
        T.torsoX += 0.06;
        T.headYaw = Math.sin(t * 1.4 + this.phase) * 0.22;
        break;
      case 'revisar_filo': // eleva la espada e inspecciona el filo
        T.swordX = 0.32 + Math.sin(t * 1.2 + this.phase) * 0.08;
        T.headX = 0.28;
        T.headYaw = -0.25 + Math.sin(t * 0.9) * 0.1;
        T.torsoX += 0.07;
        T.legR = 0.05; T.legL = -0.03;
        break;
      case 'desafio': // postura erguida de desafío con la mandoble bajada firmemente
        T.torsoX = -0.10 + Math.sin(t * 0.8) * 0.02;
        T.headX = -0.12;
        T.swordX = -0.45;
        T.torsoYaw = Math.sin(t * 0.6) * 0.08;
        break;
      case 'alerta': // guardia alta con escaneo rápido
        T.swordX = -0.52 + Math.cos(t * 2.5) * 0.08;
        T.headYaw = Math.sin(t * 1.8 + this.phase) * 0.45;
        T.torsoX = 0.09;
        T.legR = 0.12; T.legL = -0.1;
        break;
      // 'respirar': solo la base
    }
    if (this.cape) this.cape.rotation.x = Math.sin(t * 0.5 + this.phase) * 0.018;
    this._apply(dt, 4.5);
  }

  // ---------- Placaje en 3 fases con 3 variantes ----------
  // Anti-repetición: nunca sale la misma variante dos veces seguidas
  startTackle() {
    const otras = TACKLE_VARIANTS.filter((v) => v !== this.tackleVariant);
    this.tackleVariant = otras[Math.floor(Math.random() * otras.length)];
    return this.tackleVariant;
  }

  // k: progreso 0→1 del estado completo (anticipación 0–0.22, embestida
  // 0.22–0.75, recuperación 0.75–1)
  tackle(dt, k) {
    const T = this._T;
    this._resetTargets();

    if (k < 0.22) {
      // ANTICIPACIÓN: se agacha y arma el golpe (telegrafiado)
      const w = k / 0.22;
      T.rootX = 0.08 * w;
      T.torsoY = -0.12 * w;
      T.torsoX = 0.15 * w;
      T.legR = 0.35 * w; T.legL = -0.3 * w; // peso a la pierna trasera
      switch (this.tackleVariant) {
        case 'hombro': T.torsoYaw = -0.5 * w; T.headYaw = 0.3 * w; break;
        case 'estocada': T.swordX = 0.4 * w; T.headX = -0.1 * w; break;
        case 'plancha': T.torsoX = 0.32 * w; T.headX = -0.2 * w; break;
      }
      this._apply(dt, 26);
      return;
    }

    // EMBESTIDA plena → RECUPERACIÓN (la pose se deshace)
    const w = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
    switch (this.tackleVariant) {
      case 'hombro': // el hombro izquierdo rompe la línea
        T.rootX = 0.42 * w;
        T.torsoX = 0.22 * w;
        T.torsoYaw = 0.55 * w;      // giro contrario al armado: latigazo
        T.torsoZ = -0.16 * w;
        T.legR = -0.8 * w; T.legL = -0.35 * w;
        T.headYaw = -0.4 * w; T.headX = -0.18 * w;
        T.swordX = -1.0 * w;
        T.torsoY = -0.14 * w;
        break;
      case 'estocada': // barrido bajo, la claymore como lanza
        T.rootX = 0.18 * w;
        T.torsoX = 0.55 * w;
        T.torsoY = -0.3 * w;
        T.legR = 1.0 * w; T.legL = -0.9 * w;
        T.swordX = 1.35 * w;        // ¡punta al frente!
        T.headX = -0.35 * w;
        break;
      case 'plancha': // tacleada voladora
        T.rootX = 0.92 * w;
        T.torsoX = 0.22 * w;
        T.legR = -1.1 * w; T.legL = -1.0 * w;
        T.swordX = -1.3 * w;
        T.headX = -0.5 * w;
        break;
    }
    this._apply(dt, k > 0.75 ? 10 : 26);
  }

  // ---------- Esquiva con 2 estilos (alternan siempre) ----------
  startDodge() {
    this.dodgeStyle =
      DODGE_STYLES[(DODGE_STYLES.indexOf(this.dodgeStyle) + 1) % DODGE_STYLES.length];
    return this.dodgeStyle;
  }

  dodge(dt, k) {
    const T = this._T;
    this._resetTargets();
    if (this.dodgeStyle === 'giro') {
      // voltereta: cuerpo en bola (la raíz gira 360° desde fuera)
      T.rootX = null;
      T.rootZ = null; // el giro de 360° lo controla la física, no el animador
      T.legR = 1.1; T.legL = 1.1;
      T.torsoX = 0.55; T.torsoY = -0.06;
      T.headX = 0.3;
      T.swordX = -0.6;
    } else {
      // deslizamiento bajo: patina de lado casi a ras de suelo
      const w = Math.sin(Math.min(k, 1) * Math.PI);
      T.rootX = 0.1 * w;
      T.torsoY = -0.34 * w;
      T.torsoX = 0.3 * w;
      T.torsoZ = 0.35 * w;
      T.legR = 1.2 * w; T.legL = 0.25 * w;
      T.headYaw = 0.4 * w;
      T.swordX = -0.8 * w;
    }
    this._apply(dt, 22);
  }

  // compatibilidad con llamadas antiguas
  roll(dt, k = 0.5) { this.dodge(dt, k); }

  // ---------- Tambaleo al encajar un golpe ----------
  stagger(dt, t) {
    const T = this._T;
    this._resetTargets();
    T.rootX = -0.14;
    T.torsoX = -0.3 + Math.sin(t * 11) * 0.06; // sacudida
    T.torsoZ = Math.sin(t * 9) * 0.08;
    T.legR = 0.45; T.legL = -0.4;              // pies frenando en el suelo
    T.headX = -0.35;
    T.swordX = -1.2;                            // la espada vuela atrás
    this._apply(dt, 12);
  }

  // ---------- Robo del estandarte ----------
  grab(dt, k) {
    const T = this._T;
    this._resetTargets();
    const w = Math.sin(Math.min(k, 1) * Math.PI);
    T.torsoX = 0.6 * w;
    T.legR = 0.22; T.legL = -0.22;
    T.torsoY = -0.05 * w;
    T.headX = 0.35 * w;
    this._apply(dt, 18);
  }

  // ---------- Caída al abismo ----------
  fall(dt, t) {
    const T = this._T;
    this._resetTargets();
    T.rootX = null; // la raíz la voltea la física de caída
    T.legR = -0.5 + Math.sin(t * 9) * 0.25;
    T.legL = 0.35 + Math.cos(t * 8) * 0.25;
    T.torsoX = -0.2;
    T.headYaw = Math.sin(t * 6) * 0.3;
    T.swordX = -0.4;
    this._apply(dt, 10);
  }
}
