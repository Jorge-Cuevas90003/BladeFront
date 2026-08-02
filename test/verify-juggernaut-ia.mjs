// ============================================================================
//  Pruebas de la IA del Modo Juggernaut y de sus niveles de dificultad.
//  Correr:  node test/verify-juggernaut-ia.mjs
//
//  Se puede probar sin navegador porque toda la IA (steering, placajes,
//  esquivas, comité de ataque) es cálculo puro sobre Vector3: no toca WebGL ni
//  el DOM. Lo único que no se comprueba aquí es cómo se SIENTE jugar contra
//  ella, que es justo lo que ninguna prueba automática puede decir.
//
//  ── Por qué esta prueba mide y no solo comprueba que "no explota" ──
//
//  Un selector de dificultad es fácil de romper sin darse cuenta: basta con
//  leer el nivel y no llegar a usarlo en ningún cálculo. El juego seguiría
//  arrancando, las tres opciones aparecerían en el menú y nadie notaría nada
//  hasta jugar un rato. Por eso aquí se SIMULA la partida entera en los tres
//  niveles y se comparan los resultados: si "alto" no ataca más que "bajo", la
//  prueba falla aunque el código no lance un solo error.
// ============================================================================

import * as THREE from 'three';
import { JuggernautMode, NetworkBus, STATES } from '../assets/modo-juggernaut/js/juggernaut-mode.js';
import { EnemySystem } from '../assets/ejecutor-del-vacio/js/enemy-system.js';
import { DIFICULTADES, NIVELES, dificultadDe, mezclar } from '../assets/modo-juggernaut/js/dificultad.js';
import { createKnight } from '../assets/caballero-templario/js/knight.js';
import { KnightAnimator } from '../assets/caballero-templario/js/knight-anim.js';
import { createExecutor } from '../assets/ejecutor-del-vacio/js/executor.js';
import { createCyberBanner } from '../assets/modo-juggernaut/js/flag.js';

let ok = 0, fail = 0;
const check = (cond, msg) => {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ FALLA: ${msg}`); }
};

// PRNG sembrado: la IA usa Math.random para cooldowns, esquivas y deambuleo.
// Sin fijarlo, dos ejecuciones del mismo nivel darían números distintos y las
// comparaciones entre niveles no significarían nada.
function sembrar(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const RADIO = 20.7;   // el mismo radio jugable que usa main.js (ARENA_RADIUS × 1.85)

// Simula una partida completa y devuelve lo que pasó. `conJugador` deja a J-1
// bajo "control humano" quieto, para medir el caso en que el humano no ayuda.
function simular(nivel, { segundos = 90, semilla = 20260728, conJugador = false } = {}) {
  const azarOriginal = Math.random;
  Math.random = sembrar(semilla);

  const cuenta = { placajes: 0, derribos: 0, caidas: 0, jefesNacidos: 0 };
  const oyentes = {
    TACKLE_DASH: () => cuenta.placajes++,
    FLAG_DROPPED: () => cuenta.derribos++,
    RING_OUT: () => cuenta.caidas++,
    JUGGERNAUT_BORN: () => cuenta.jefesNacidos++,
  };
  for (const [tipo, fn] of Object.entries(oyentes)) NetworkBus.addEventListener(tipo, fn);

  let modo = null, error = null;
  try {
    const flag = createCyberBanner();
    flag.position.set(0, 0, 0);
    const escena = new THREE.Scene();
    escena.add(flag);

    modo = new JuggernautMode(escena, {
      arenaRadius: RADIO, hunterCount: 11,
      knightFactory: createKnight, executorFactory: createExecutor,
      flag, dificultad: nivel,
    });
    if (conJugador) modo.setControlled(modo.hunters[0]);

    const dt = 1 / 60;
    for (let i = 0; i < segundos * 60; i++) modo.update(dt, i * dt);
  } catch (e) {
    error = e;
  } finally {
    for (const [tipo, fn] of Object.entries(oyentes)) NetworkBus.removeEventListener(tipo, fn);
    Math.random = azarOriginal;
  }

  // Segundos totales en los que hubo un Juggernaut vivo. Dividido entre cuántos
  // nacieron da el "reinado medio": cuánto aguanta el jefe antes de que lo
  // tumben. Es LA medida de si los cazadores son mejores — mucho mejor que
  // contar derribos, que está topado por cuántos jefes llega a haber.
  const dominioTotal = modo
    ? [...modo.holdTimes.values()].reduce((a, b) => a + b, 0)
    : 0;

  return { ...cuenta, dominioTotal, modo, error };
}

try {
  // ── 1. La tabla de dificultad es coherente ────────────────────────────────
  // Antes de simular nada: si los números no escalan en el orden correcto, no
  // hay IA que arregle el nivel.
  console.log('\n== 1. La tabla de niveles escala en el orden correcto ==');
  {
    const [b, m, a] = [DIFICULTADES.bajo, DIFICULTADES.medio, DIFICULTADES.alto];
    check(NIVELES.length === 3 && NIVELES.every((n) => DIFICULTADES[n]),
      'están los tres niveles y todos tienen tabla');
    check(b.punteria < m.punteria && m.punteria < a.punteria,
      `la puntería sube: ${b.punteria} < ${m.punteria} < ${a.punteria}`);
    check(b.cdPlacaje[0] > m.cdPlacaje[0] && m.cdPlacaje[0] > a.cdPlacaje[0],
      'el tiempo entre placajes BAJA al subir de nivel');
    check(b.reaccion[0] > m.reaccion[0] && m.reaccion[0] > a.reaccion[0],
      'el retardo de reacción baja al subir de nivel');
    check(b.esquivaFiable < m.esquivaFiable && m.esquivaFiable < a.esquivaFiable,
      'esquivan mejor al subir de nivel');
    check(b.maxAtacantes < a.maxAtacantes,
      `en alto atacan más a la vez (${b.maxAtacantes} → ${a.maxAtacantes})`);
    check(b.concienciaBorde < a.concienciaBorde, 'y evitan mejor el abismo');
    check(b.jefe.velocidad < a.jefe.velocidad && b.jefe.prediccion < a.jefe.prediccion,
      'el jefe también escala: más rápido y con más predicción');
    check(dificultadDe('inventado') === DIFICULTADES.medio,
      'un nivel desconocido cae en medio en vez de dejar la IA sin parámetros');
  }

  // ── 2. Los tres niveles simulan una partida entera sin romperse ───────────
  console.log('\n== 2. Los tres niveles aguantan 90 s de partida ==');
  const corridas = {};
  for (const nivel of NIVELES) {
    const r = simular(nivel);
    corridas[nivel] = r;
    if (r.error) console.error(`    ${nivel}: ${r.error.stack?.split('\n').slice(0, 3).join('\n    ')}`);
    check(!r.error, `${nivel}: 90 s simulados sin excepciones`);
    check(r.jefesNacidos > 0, `${nivel}: la partida arranca de verdad (${r.jefesNacidos} Juggernauts)`);
  }

  // ── 3. La dificultad se NOTA: más agresivos al subir ──────────────────────
  // Este es el bloque que de verdad importa. Con los mismos 90 s y la misma
  // semilla, lo único que cambia entre corridas es el nivel.
  console.log('\n== 3. La dificultad cambia el comportamiento medido ==');
  {
    const b = corridas.bajo, m = corridas.medio, a = corridas.alto;
    console.log(`    placajes lanzados → bajo ${b.placajes} · medio ${m.placajes} · alto ${a.placajes}`);
    console.log(`    derribos del jefe → bajo ${b.derribos} · medio ${m.derribos} · alto ${a.derribos}`);

    check(a.placajes > b.placajes,
      `en alto se lanzan más placajes que en bajo (${a.placajes} > ${b.placajes})`);
    check(m.placajes > b.placajes,
      `y en medio más que en bajo (${m.placajes} > ${b.placajes})`);
    check(a.derribos > b.derribos,
      `en alto el jefe cae más veces que en bajo (${a.derribos} > ${b.derribos})`);

    // NOTA sobre el reinado del jefe con los dos bandos al mismo nivel: no se
    // acorta al subir de dificultad, y está bien que sea así. En "alto" suben
    // A LA VEZ los cazadores y el jefe, así que el equilibrio ENTRE ELLOS se
    // mantiene —lo que cambia es que todo pasa más deprisa y más apretado—.
    // Medir ahí la habilidad de un bando es imposible: hay dos variables
    // moviéndose. Se aísla cada una en el bloque 3b.
    const reinado = (r) => (r.jefesNacidos ? r.dominioTotal / r.jefesNacidos : 0);
    console.log(`    reinado medio del jefe → bajo ${reinado(b).toFixed(2)}s · medio ${reinado(m).toFixed(2)}s · alto ${reinado(a).toFixed(2)}s`);
  }

  // ── 3b. Aislando cada bando: ¿de quién viene la mejora? ───────────────────
  //
  // Con los dos bandos al mismo nivel no se puede saber si mejoraron los
  // cazadores, el jefe, o ninguno. Aquí se congela uno y se mueve el otro.
  //
  // Y se promedia sobre VARIAS SEMILLAS. Una sola partida no vale para
  // concluir nada: entre dos configuraciones se midieron diferencias del 4 %
  // que cambiaban de signo al tocar cualquier otra cosa, o sea que eran ruido.
  // Con tres semillas la comparación sobrevive a la aleatoriedad de cooldowns,
  // esquivas y deambuleo.
  console.log('\n== 3b. Cada bando mejora por separado (promedio de 3 partidas) ==');
  {
    const SEMILLAS = [20260728, 424242, 8675309];
    const reinadoMedio = (tabla) => {
      let suma = 0;
      for (const semilla of SEMILLAS) {
        const r = simular(tabla, { segundos: 60, semilla });
        if (r.error) throw r.error;
        suma += r.jefesNacidos ? r.dominioTotal / r.jefesNacidos : 0;
      }
      return suma / SEMILLAS.length;
    };
    const placajesMedios = (tabla) => {
      let suma = 0;
      for (const semilla of SEMILLAS) suma += simular(tabla, { segundos: 60, semilla }).placajes;
      return suma / SEMILLAS.length;
    };

    // (a) Jefe clavado en medio; solo cambian los cazadores.
    const czBajo = reinadoMedio(mezclar('bajo', 'medio'));
    const czAlto = reinadoMedio(mezclar('alto', 'medio'));
    console.log(`    jefe fijo · cazadores bajo ${czBajo.toFixed(2)}s → alto ${czAlto.toFixed(2)}s`);
    check(czAlto < czBajo,
      `contra el MISMO jefe, los cazadores de alto lo tumban antes (${czAlto.toFixed(2)}s < ${czBajo.toFixed(2)}s)`);
    const pBajo = placajesMedios(mezclar('bajo', 'medio'));
    const pAlto = placajesMedios(mezclar('alto', 'medio'));
    check(pAlto > pBajo, `y lo acosan más (${pAlto.toFixed(0)} placajes > ${pBajo.toFixed(0)})`);

    // (b) Cazadores clavados en medio; solo cambia el jefe.
    const jfBajo = reinadoMedio(mezclar('medio', 'bajo'));
    const jfAlto = reinadoMedio(mezclar('medio', 'alto'));
    console.log(`    cazadores fijos · jefe bajo ${jfBajo.toFixed(2)}s → alto ${jfAlto.toFixed(2)}s`);
    check(jfAlto > jfBajo,
      `contra los MISMOS cazadores, el jefe de alto sobrevive más (${jfAlto.toFixed(2)}s > ${jfBajo.toFixed(2)}s)`);
  }

  // ── 4. El comité de ataque limita los placajes simultáneos ────────────────
  // Sin este límite los once embisten a la vez, se tapan, y quedan todos en el
  // suelo al mismo tiempo. Se comprueba sobre la simulación, no leyendo el
  // código: se cuenta cuántos están embistiendo en cada fotograma.
  console.log('\n== 4. No embisten todos a la vez ==');
  {
    const azarOriginal = Math.random;
    Math.random = sembrar(777);
    const flag = createCyberBanner();
    const escena = new THREE.Scene();
    escena.add(flag);
    const modo = new JuggernautMode(escena, {
      arenaRadius: RADIO, hunterCount: 11,
      knightFactory: createKnight, executorFactory: createExecutor,
      flag, dificultad: 'alto',
    });

    let pico = 0;
    const dt = 1 / 60;
    for (let i = 0; i < 90 * 60; i++) {
      modo.update(dt, i * dt);
      const embistiendo = modo.hunters.filter(
        (h) => h !== modo.holder && h.state === STATES.TACKLE_DASH
      ).length;
      if (embistiendo > pico) pico = embistiendo;
    }
    Math.random = azarOriginal;

    const tope = DIFICULTADES.alto.maxAtacantes;
    console.log(`    pico de embestidas simultáneas: ${pico} (tope del nivel: ${tope})`);
    check(pico > 0, 'hubo embestidas que contar');
    check(pico <= tope, `nunca se pasa del tope de atacantes simultáneos (${pico} ≤ ${tope})`);
  }

  // ── 5. Cambio de nivel en caliente ────────────────────────────────────────
  // Cambiar de dificultad a media partida no puede costar la ronda jugada.
  console.log('\n== 5. Se puede cambiar de nivel sin reiniciar ==');
  {
    const flag = createCyberBanner();
    const escena = new THREE.Scene();
    escena.add(flag);
    const modo = new JuggernautMode(escena, {
      arenaRadius: RADIO, hunterCount: 11,
      knightFactory: createKnight, executorFactory: createExecutor,
      flag, dificultad: 'bajo',
    });
    const dt = 1 / 60;
    for (let i = 0; i < 20 * 60; i++) modo.update(dt, i * dt);

    const posAntes = modo.hunters[3].position.clone();
    const dominioAntes = new Map(modo.holdTimes);

    modo.setDificultad('alto');
    check(modo.nivel === 'alto' && modo.dif === DIFICULTADES.alto, 'el modo registra el nivel nuevo');
    check(modo.hunters.every((h) => h.dif === DIFICULTADES.alto),
      'todos los cazadores reciben la tabla nueva');
    check(modo.ai.speed === DIFICULTADES.alto.jefe.velocidad
      && modo.ai.prediccion === DIFICULTADES.alto.jefe.prediccion,
      'y el jefe también se reajusta');
    check(modo.hunters[3].position.equals(posAntes), 'nadie se teletransporta al cambiar');
    check(modo.holdTimes.size === dominioAntes.size, 'el marcador de Dominio se conserva');

    // Y sigue simulando sin romperse después del cambio.
    let exploto = null;
    try { for (let i = 0; i < 20 * 60; i++) modo.update(dt, i * dt); } catch (e) { exploto = e; }
    check(!exploto, 'la partida continúa sin errores tras el cambio');
  }

  // ── 6. La velocidad del JUGADOR no depende del nivel ──────────────────────
  // Un rival mejor tiene que ser mejor él, no el mismo rival con el jugador
  // lastrado. Si "alto" además te ralentizara, la dificultad sería un impuesto.
  console.log('\n== 6. El nivel no toca al personaje del jugador ==');
  {
    const vel = {};
    for (const nivel of NIVELES) {
      const flag = createCyberBanner();
      const escena = new THREE.Scene();
      escena.add(flag);
      const modo = new JuggernautMode(escena, {
        arenaRadius: RADIO, hunterCount: 11,
        knightFactory: createKnight, executorFactory: createExecutor,
        flag, dificultad: nivel,
      });
      modo.setControlled(modo.hunters[0]);
      vel[nivel] = modo.hunters[0].speed;
      // Y los rivales SÍ cambian de velocidad con el nivel.
      vel[nivel + '_rival'] = modo.hunters[1].speed;
    }
    check(vel.bajo === vel.medio && vel.medio === vel.alto,
      `el jugador corre igual en los tres niveles (${vel.bajo})`);
    check(vel.bajo_rival < vel.alto_rival,
      `pero los rivales no (${vel.bajo_rival} → ${vel.alto_rival})`);
  }

  // ── 7. La demo del Ejecutor no se ve afectada ─────────────────────────────
  // EnemySystem lo comparten el Modo Juggernaut y la demo del Ejecutor. Los
  // parámetros nuevos son opcionales justo para eso: sin pasarlos, la clase
  // tiene que comportarse EXACTAMENTE como antes de que existieran.
  console.log('\n== 7. Compatibilidad: la demo del Ejecutor sigue igual ==');
  {
    const falso = new THREE.Object3D();
    falso.userData = {
      visorMat: { emissiveIntensity: 0 },
      heatMat: { emissiveIntensity: 0 },
      glowLight: { intensity: 0 },
    };
    const sis = new EnemySystem(falso, { arenaRadius: 11 });
    check(sis.prediccion === 0 && sis.sesgoBorde === 0,
      'sin opciones nuevas, predicción y sesgo quedan en 0 (comportamiento original)');

    // Sin sesgo va al MÁS CERCANO, esté quien esté al borde.
    const lejos = [
      { id: 'cerca', position: new THREE.Vector3(2, 0, 0), velocity: new THREE.Vector3(), radius: 0.45, falling: false },
      { id: 'borde', position: new THREE.Vector3(0, 0, 10.5), velocity: new THREE.Vector3(), radius: 0.45, falling: false },
    ];
    sis.update(1 / 60, 0, lejos);
    check(sis.targetPlayerId === 'cerca', 'persigue al más cercano, como siempre');

    // El sesgo de borde DESEMPATA, no manda por encima de todo: un jefe que
    // abandonara a quien tiene a dos pasos para cruzar el ruedo entero detrás
    // de otro sería peor IA, no mejor. Por eso se prueba a IGUAL distancia —
    // el jefe está en (5,0,0) y los dos objetivos a 5 de él, pero uno pegado
    // al filo. Ahí sí debe elegir al del filo: sacarlo cuesta un empujón.
    falso.position.set(5, 0, 0);
    const empatados = [
      { id: 'centro', position: new THREE.Vector3(0, 0, 0), velocity: new THREE.Vector3(), radius: 0.45, falling: false },
      { id: 'borde', position: new THREE.Vector3(10, 0, 0), velocity: new THREE.Vector3(), radius: 0.45, falling: false },
    ];
    const neutro = new EnemySystem(falso, { arenaRadius: 11 });
    neutro.update(1 / 60, 0, empatados);
    check(neutro.targetPlayerId === 'centro',
      'a igual distancia y sin sesgo, no hay preferencia por el filo');

    falso.position.set(5, 0, 0);
    const listo = new EnemySystem(falso, { arenaRadius: 11, sesgoBorde: 0.8 });
    listo.update(1 / 60, 0, empatados);
    check(listo.targetPlayerId === 'borde',
      'con sesgoBorde, a igual distancia elige al que está al filo');

    // configurar() ajusta en caliente sin reconstruir.
    listo.configurar({ velocidad: 4.2, prediccion: 0.5 });
    check(listo.speed === 4.2 && listo.prediccion === 0.5, 'configurar() reajusta en caliente');
  }

  // ── 8. Movimiento en todas las direcciones ────────────────────────────────
  //
  // Antes el caballero giraba SIEMPRE hacia donde se movía y solo se animaba
  // una marcha al frente: retroceder era darse la vuelta y correr, y moverse
  // de lado era un giro de 90°. Ahora, con el jefe cerca, encara al jefe y se
  // desplaza alrededor — y ahí es donde aparecen el paso lateral y el
  // retroceso de verdad.
  console.log('\n== 8. Los caballeros se mueven en todas las direcciones ==');
  {
    const flag = createCyberBanner();
    const escena = new THREE.Scene();
    escena.add(flag);
    const modo = new JuggernautMode(escena, {
      arenaRadius: RADIO, hunterCount: 11,
      knightFactory: createKnight, executorFactory: createExecutor,
      flag, dificultad: 'medio',
    });

    const obs = { lateralMax: 0, avanceMin: 1, conMira: 0, muestras: 0, piernaZ: 0 };
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 60; i++) {
      modo.update(dt, i * dt);
      if (i % 6) continue;
      for (const h of modo.hunters) {
        if (h === modo.holder) continue;
        obs.muestras++;
        obs.lateralMax = Math.max(obs.lateralMax, Math.abs(h._lateral));
        obs.avanceMin = Math.min(obs.avanceMin, h._avance);
        if (h._miraA) obs.conMira++;
        const pierna = h.group.getObjectByName('pierna_1');
        if (pierna) obs.piernaZ = Math.max(obs.piernaZ, Math.abs(pierna.rotation.z));
      }
    }
    const fraccionMira = obs.conMira / obs.muestras;
    console.log(`    lateral máx ${obs.lateralMax.toFixed(2)} · avance mín ${obs.avanceMin.toFixed(2)} · encarando al jefe ${(fraccionMira * 100).toFixed(0)}% · pierna.z ${obs.piernaZ.toFixed(3)}`);

    check(obs.lateralMax > 0.5,
      `se desplazan de lado de verdad (lateral máx ${obs.lateralMax.toFixed(2)})`);
    check(obs.avanceMin < -0.3,
      `y también retroceden sin darse la vuelta (avance mín ${obs.avanceMin.toFixed(2)})`);
    check(fraccionMira > 0.05,
      `encaran al jefe en combate (${(fraccionMira * 100).toFixed(0)} % del tiempo)`);
    check(obs.piernaZ > 0.02,
      `las piernas se abren para el paso lateral (rotación z ${obs.piernaZ.toFixed(3)})`);
  }

  // ── 9. El animador sigue sirviendo a quien lo llamaba antes ───────────────
  // KnightAnimator lo usan también el visor de Captura la Bandera y la demo
  // del caballero, que llaman a locomotion() con la firma vieja. Los
  // parámetros nuevos son opcionales justo para eso.
  console.log('\n== 9. Compatibilidad del animador ==');
  {
    const caballero = createKnight();
    const anim = new KnightAnimator(caballero);
    let exploto = null;
    try {
      for (let i = 0; i < 120; i++) anim.locomotion(1 / 60, i / 60, 2.5, 0); // firma vieja
    } catch (e) { exploto = e; }
    check(!exploto, 'locomotion() con la firma antigua sigue funcionando');

    const pierna = caballero.getObjectByName('pierna_1');
    check(Math.abs(pierna.rotation.z) < 1e-6,
      'y sin pedir movimiento lateral, la pierna no se abre (0 por defecto)');
    check(Math.abs(pierna.rotation.x) > 0.01, 'pero sí camina: la zancada se mueve');
  }

  console.log(`\n${'='.repeat(52)}`);
  console.log(`Resultado: ${ok} OK, ${fail} FALLAS`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('\nExcepción en la prueba:', e);
  process.exit(1);
}
