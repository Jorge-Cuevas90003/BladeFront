// Modo Juggernaut — núcleo de reglas, estados y animación procedural.
// Motor-agnóstico: el bucle anfitrión (vanilla o useFrame de R3F) llama a
// mode.update(dt, t). Los eventos "de red" salen por NetworkBus (EventTarget):
// en multijugador real, un adaptador websocket los publica/consume tal cual.

import * as THREE from 'three';
import { EnemySystem, lerpAngle } from '../../ejecutor-del-vacio/js/enemy-system.js';
import { animateExecutorWalk, animateExecutorSlam } from '../../ejecutor-del-vacio/js/executor.js';
import { MAT } from '../../caballero-templario/js/knight.js';
import { KnightAnimator } from '../../caballero-templario/js/knight-anim.js';
import { dificultadDe, NIVEL_POR_DEFECTO } from './dificultad.js';

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

const ARRIBA = new THREE.Vector3(0, 1, 0);
// Vectores de usar y tirar. La IA corre 11 veces por fotograma: reservarlos
// aquí evita ~2000 objetos por segundo que el recolector tendría que barrer.
// Solo se usan dentro de una llamada, sin ceder el control entremedias.
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

// Adelanto con el que se apunta un placaje: el tiempo que tarda la embestida
// en cruzar su fase de avance. Es una constante y no una división por la
// distancia, porque la embestida dura lo mismo (0.55 s) se lance desde donde
// se lance — solo cambia si llega o no.
const T_EMBESTIDA = 0.35;

// ALCANCE de la embestida, medido integrando su propia curva de avance:
// recorre 1.40–1.56 unidades según la velocidad, más 1.5 del radio de golpe.
// O sea que un placaje lanzado a más de ~2.9 NO PUEDE conectar: se queda
// corto y solo gasta el cooldown. Las ventanas de `ventanaPlacaje` en
// dificultad.js tienen que respetar este techo — se descubrió al medir por qué
// un nivel que atacaba 4,5 veces más tumbaba al jefe MÁS TARDE.
const ALCANCE_EMBESTIDA = 2.9;

// Velocidad del cazador que lleva el jugador. Fija a propósito: ver setControlled.
const VEL_JUGADOR = 3.1;

// ---------- Cazador (Templario Estelar) ----------
class Hunter {
  constructor(id, group, arenaRadius, { indice = 0, total = 1, dificultad } = {}) {
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

    // Movimiento en el marco del propio caballero, suavizado: +1 de avance es
    // ir de frente, -1 retroceder; lateral es cuánto se desplaza a su derecha.
    // El animador los usa para elegir entre marchar, retroceder o dar pasos
    // laterales, en vez de animarlo todo como una carrera al frente.
    this._avance = 1;
    this._lateral = 0;

    // A qué mira. Con null encara hacia donde se mueve (lo de siempre); con un
    // punto, lo encara sin dejar de moverse alrededor — es lo que convierte el
    // acoso al jefe en un cerco en vez de once tipos corriendo en círculo de
    // espaldas a él.
    this._miraA = null;

    // Hueco asignado en el círculo de acoso. Sin esto los once convergían al
    // mismo punto —el más cercano al jefe— y se estorbaban entre ellos; con un
    // ángulo propio cada uno, lo rodean y le cierran las salidas.
    this.anguloHueco = (indice / Math.max(total, 1)) * Math.PI * 2;

    // Retardo de reacción ante un cambio de situación (el estandarte queda
    // libre, nace el jefe). En dificultad baja es lo que da margen al jugador
    // para llegar primero; en alta es casi cero.
    this.reaccionT = 0;
    this._flagEraLibre = false;
    this._jefeEraActivo = false;

    this.dif = dificultad ?? dificultadDe(NIVEL_POR_DEFECTO);
    this.aplicarDificultad(this.dif);

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

  aplicarDificultad(dif) {
    this.dif = dif;
    // La velocidad del jugador NO se toca: sería cambiarle el personaje bajo
    // los pies a mitad de ronda. La dificultad solo mueve a los rivales.
    if (!this.inputDir) this.speed = dif.velocidad;
  }

  _tirarReaccion() {
    const [a, b] = this.dif.reaccion;
    this.reaccionT = a + Math.random() * (b - a);
  }

  // Elige hacia qué lado rodar. `haciaJefe` debe venir normalizado.
  //
  // Antes se echaba a suertes con Math.random() < 0.5, y la mitad de las veces
  // la esquiva salvaba del slam para tirarte al abismo — el peor final posible
  // y encima por azar. Ahora se calcula qué lado acerca al centro y se acierta
  // según `esquivaFiable`: en dificultad baja se sigue fallando, pero ya es una
  // decisión del nivel y no un defecto.
  _elegirLadoEsquiva(haciaJefe) {
    this._side.crossVectors(haciaJefe, ARRIBA).normalize();
    const p = this.position;
    const rMas = Math.hypot(p.x + this._side.x, p.z + this._side.z);
    const rMenos = Math.hypot(p.x - this._side.x, p.z - this._side.z);
    const seguroEsNegar = rMenos < rMas;
    const acierta = Math.random() < this.dif.esquivaFiable;
    if (acierta ? seguroEsNegar : Math.random() < 0.5) this._side.negate();
  }

  // Empuje hacia el centro cuando se está cerca del filo. Es lo que separa a un
  // cazador que sobrevive de uno que se deja empujar al vacío en el primer
  // golpe: el ring-out es la forma más barata de perder aquí.
  _evitarBorde(desired) {
    const fuerza = this.dif.concienciaBorde;
    if (fuerza <= 0) return;
    const p = this.position;
    const r = Math.hypot(p.x, p.z);
    const margen = this.arenaRadius * 0.72;
    if (r <= margen || r < 0.001) return;
    const urgencia = Math.min((r - margen) / (this.arenaRadius - margen), 1);
    const k = urgencia * this.speed * 2.2 * fuerza;
    desired.x -= (p.x / r) * k;
    desired.z -= (p.z / r) * k;
  }

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

    // Reacción de la IA: cuando la situación CAMBIA (el estandarte queda
    // libre, nace un Juggernaut) se tira un dado de retardo. Un rival que
    // responde en el mismo fotograma en que pasan las cosas se siente
    // tramposo; uno que tarda un poco se siente humano.
    let atento = true;
    if (!this.inputDir) {
      if (ctx.flagFree && !this._flagEraLibre) this._tirarReaccion();
      if (ctx.bossActive && !this._jefeEraActivo) this._tirarReaccion();
      this._flagEraLibre = ctx.flagFree;
      this._jefeEraActivo = ctx.bossActive;
      this.reaccionT -= dt;
      atento = this.reaccionT <= 0;
    }

    // En combate se pelea DE CARA. Vale igual para la IA y para el jugador: es
    // lo natural, deja el placaje apuntado sin tener que girarse antes, y es lo
    // que hace que rodear al jefe se vea como un cerco —con sus pasos laterales
    // y sus retrocesos— en vez de una carrera en círculo dándole la espalda.
    this._miraA = null;
    if (ctx.bossActive && ctx.boss) {
      const dx = ctx.boss.position.x - p.x, dz = ctx.boss.position.z - p.z;
      if (dx * dx + dz * dz < 49) this._miraA = ctx.boss.position; // 7 unidades
    }

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
      if (this.grabCd <= 0 && ctx.flagFree && atento) {
        desired.subVectors(ctx.flagPos, p).setY(0);
        if (desired.length() > 0.2) desired.normalize().multiplyScalar(this.speed);
      } else {
        desired.set(
          Math.sin(this.wanderPhase + t * 0.5), 0,
          Math.cos(this.wanderPhase + t * 0.35)
        ).multiplyScalar(1.4);
      }
    } else {
      const dif = this.dif;
      const toBoss = _v1.subVectors(ctx.boss.position, p).setY(0);
      const d = toBoss.length();
      toBoss.normalize();

      // El jefe carga el slam y estoy cerca → rodada lateral, hacia el lado
      // que NO acerca al abismo (ver _elegirLadoEsquiva).
      if (atento && ctx.slamCharging && d < 5 && this.dodgeCd <= 0) {
        this._elegirLadoEsquiva(toBoss);
        this.dodgeCd = dif.cdEsquiva;
        this.anim.startDodge();
        this.setState(STATES.DODGE_ROLL);
        return;
      }

      // A distancia de placaje, con el cooldown listo y con permiso del comité
      // → TACKLE_DASH.
      //
      // El permiso existe porque once cazadores embistiendo a la vez es peor
      // que tres: se tapan entre ellos, el jefe se lleva un solo golpe y los
      // demás quedan tirados en el suelo a la vez, sin nadie cubriendo. El
      // comité limita cuántos se lanzan simultáneamente (`maxAtacantes`).
      // El techo se recorta al alcance real de la embestida pase lo que pase:
      // una tabla mal ajustada puede pedir una ventana más ancha, pero lanzar
      // desde fuera de alcance no es agresividad, es tirar el turno.
      const [minD, maxDPedido] = dif.ventanaPlacaje;
      const maxD = Math.min(maxDPedido, ALCANCE_EMBESTIDA);
      if (atento && d < maxD && d > minD && this.tackleCd <= 0 && ctx.pedirPlacaje()) {
        const [cdA, cdB] = dif.cdPlacaje;
        this.tackleCd = cdA + Math.random() * (cdB - cdA);

        // Apuntar a donde el jefe ESTARÁ cuando llegue la embestida, no a
        // donde está ahora. El jefe se mueve a ~3 u/s y el placaje tarda ~0.4 s
        // en cruzar: sin adelanto se le pasa por detrás una y otra vez, que es
        // exactamente lo que hacía que los cazadores parecieran inofensivos.
        _v3.copy(ctx.boss.position);
        if (dif.punteria > 0 && ctx.bossVel) {
          _v3.addScaledVector(ctx.bossVel, T_EMBESTIDA * dif.punteria);
        }
        this._dashDir.subVectors(_v3, p).setY(0);
        if (this._dashDir.lengthSq() < 1e-6) this._dashDir.copy(toBoss);
        else this._dashDir.normalize();

        this.anim.startTackle();
        emit('TACKLE_DASH', { playerId: this.id });
        this.setState(STATES.TACKLE_DASH);
        return;
      }

      // Anillo de acoso: cada cazador va a SU hueco del círculo en vez de
      // amontonarse en el punto más cercano al jefe. El anillo gira despacio
      // para que no parezca una formación congelada.
      const ringDist = dif.distanciaAnillo;
      const ang = this.anguloHueco + t * dif.giroAnillo;
      _v2.set(
        ctx.boss.position.x + Math.cos(ang) * ringDist - p.x,
        0,
        ctx.boss.position.z + Math.sin(ang) * ringDist - p.z
      ).clampLength(0, this.speed);

      // Aproximación radial pura (el comportamiento de siempre) y el hueco
      // asignado, mezclados según lo coordinado que sea el nivel.
      desired.copy(toBoss).multiplyScalar((d - ringDist) * 1.6);
      this._side.crossVectors(toBoss, ARRIBA);
      desired.addScaledVector(this._side, Math.sin(t * 0.9 + this.id.length) * 1.4);
      desired.lerp(_v2, dif.cohesionAnillo);

      this._evitarBorde(desired);
      desired.clampLength(0, this.speed);
    }

    this.velocity.x += (desired.x - this.velocity.x) * Math.min(1, dt * 4);
    this.velocity.z += (desired.z - this.velocity.z) * Math.min(1, dt * 4);
    // Se lee ANTES de _postMove porque ahí es donde gira: la animación tiene
    // que describir el movimiento respecto a donde mira ahora, no después.
    const speedNow = this._leerMovimientoLocal(dt);
    this._postMove(dt);
    // golpeado en pleno vuelo → tambaleo; si no, locomoción normal
    if (speedNow > this.speed * 1.55) this.anim.stagger(dt, t);
    else this.anim.locomotion(dt, t, speedNow, this._turn, this._avance, this._lateral);
  }

  // Descompone la velocidad en el marco del caballero. Se llama ANTES de
  // girarlo, para que la animación refleje cómo se mueve respecto a donde está
  // mirando AHORA. Suavizado, porque sin él un bandazo mínimo hace saltar de
  // "marcha al frente" a "paso lateral" en un fotograma.
  _leerMovimientoLocal(dt) {
    const v = this.velocity;
    const plano = Math.hypot(v.x, v.z);
    let av = 1, lat = 0;
    if (plano > 0.05) {
      const yaw = this.group.rotation.y;
      const sy = Math.sin(yaw), cy = Math.cos(yaw);
      av = (v.x * sy + v.z * cy) / plano;
      lat = (v.x * cy - v.z * sy) / plano;
    }
    const k = Math.min(1, dt * 8);
    this._avance += (av - this._avance) * k;
    this._lateral += (lat - this._lateral) * k;
    return plano;
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
    // ¿A dónde encara? Dos casos:
    //
    //  · Con un objetivo (`_miraA`) lo encara SIN dejar de moverse alrededor.
    //    Ahí es donde aparecen de verdad el paso lateral y el retroceso: rodear
    //    al jefe de frente se ve como un cerco, y el placaje sale de cara.
    //  · Sin objetivo, mira hacia donde se mueve, como siempre.
    let objetivoYaw = null;
    if (this._miraA) {
      const dx = this._miraA.x - p.x, dz = this._miraA.z - p.z;
      if (dx * dx + dz * dz > 0.02) objetivoYaw = Math.atan2(dx, dz);
    } else if (this.velocity.lengthSq() > 0.4) {
      objetivoYaw = Math.atan2(this.velocity.x, this.velocity.z);
    }

    if (objetivoYaw !== null && this.state === STATES.HUNT) {
      const prev = this.group.rotation.y;
      this.group.rotation.y = lerpAngle(prev, objetivoYaw, Math.min(1, dt * 9));
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
  constructor(scene, {
    arenaRadius, hunterCount = 11, knightFactory, executorFactory, flag,
    dificultad = NIVEL_POR_DEFECTO,
  }) {
    this.scene = scene;
    this.arenaRadius = arenaRadius;
    this.flag = flag;
    this.flagHome = flag.position.clone();

    this.nivel = dificultad;
    this.dif = dificultadDe(dificultad);

    // 11 cazadores (una sola malla por jugador, reutilizada siempre: sin fugas)
    this.hunters = [];
    for (let i = 0; i < hunterCount; i++) {
      const knight = knightFactory();
      knight.scale.setScalar(0.92);
      const a = (i / hunterCount) * Math.PI * 2;
      const r = arenaRadius * 0.4 + (i % 3);
      knight.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      scene.add(knight);
      this.hunters.push(new Hunter(`J-${i + 1}`, knight, arenaRadius, {
        indice: i, total: hunterCount, dificultad: this.dif,
      }));
    }

    // UN solo Ejecutor reutilizado para cualquier portador (cero popping/leaks)
    this.executor = executorFactory();
    this.executor.visible = false;
    scene.add(this.executor);
    this.bossVisor = this.executor.userData.visorMat;

    this.ai = new EnemySystem(this.executor, {
      speed: this.dif.jefe.velocidad,
      prediccion: this.dif.jefe.prediccion,
      sesgoBorde: this.dif.jefe.sesgoBorde,
      arenaRadius, collisionRadius: 1.1, knockbackForce: 11,
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

  // Cambio de nivel EN CALIENTE, sin reiniciar la ronda: se reajustan los
  // cazadores y el jefe en su sitio. Reconstruirlos perdería posiciones,
  // cooldowns y el marcador de Dominio, y cambiar de dificultad no debería
  // costar la partida que llevas jugada.
  setDificultad(nivel) {
    this.nivel = nivel;
    this.dif = dificultadDe(nivel);
    for (const h of this.hunters) h.aplicarDificultad(this.dif);
    this.ai.configurar({
      velocidad: this.dif.jefe.velocidad,
      prediccion: this.dif.jefe.prediccion,
      sesgoBorde: this.dif.jefe.sesgoBorde,
    });
    return this.dif;
  }

  // Control humano de un cazador (null → todo IA)
  setControlled(hunter) {
    if (this.controlled) {
      // Al soltarlo vuelve a ser IA: recupera la velocidad del nivel.
      this.controlled.inputDir = null;
      this.controlled.aplicarDificultad(this.dif);
    }
    this.controlled = hunter;
    if (hunter) {
      hunter.inputDir = new THREE.Vector3();
      hunter.tackleCd = 0; // sin cooldowns heredados de la IA:
      hunter.dodgeCd = 0;  // las acciones responden desde el primer frame
      // El personaje del jugador corre siempre igual. La dificultad mueve a los
      // rivales, no al jugador: si "alto" además te ralentizara, no sería un
      // rival mejor, sería el mismo rival con el jugador lastrado.
      hunter.speed = VEL_JUGADOR;
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

    // El estandarte se monta en la ESPALDA (estandarte de guerra samurái):
    // despeja la garra, el hacha y las púas dorsales — sin clipping con el
    // cuerpo ni con los cazadores que placan de frente
    this.executor.add(this.flag);
    this.flag.position.set(-0.14, 1.32, -0.62);
    this.flag.rotation.set(0.32, 0, 0.14);
    this.flag.scale.setScalar(0.75);

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
      if (s.cd <= 0 && (near.length >= this.dif.jefe.slamMinCerca || manual)) {
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
      const [cdA, cdB] = this.dif.jefe.cdSlam;
      s.active = false; s.cd = cdA + Math.random() * (cdB - cdA);
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

    // Comité de ataque: cuántos están embistiendo AHORA. Se cuenta antes de
    // actualizar a nadie y se va incrementando dentro del propio fotograma, de
    // modo que si el primer cazador se lanza, el segundo ya lo ve ocupado. Con
    // un contador calculado solo al principio, los once se lanzarían igual.
    const comite = {
      n: activeHunters.reduce((c, h) => c + (h.state === STATES.TACKLE_DASH ? 1 : 0), 0),
    };

    const ctx = {
      flagPos: this.flag.getWorldPosition(new THREE.Vector3()),
      flagFree: this.phase === 'FREE' && this.flagCd <= 0,
      boss: bossActive ? this.executor : null,
      bossActive,
      // Velocidad real del jefe: es lo que permite a los cazadores apuntar
      // adelantado en vez de embestir a donde el jefe ya no está.
      bossVel: bossActive ? this.ai.velocity : null,
      slamCharging: this.slam.charging,
      onTackleHit: (h) => this._onTackleHit(h),
      pedirPlacaje: () => {
        if (comite.n >= this.dif.maxAtacantes) return false;
        comite.n++;
        return true;
      },
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
