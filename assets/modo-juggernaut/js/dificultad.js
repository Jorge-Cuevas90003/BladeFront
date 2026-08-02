// ============================================================================
//  Niveles de dificultad del Modo Juggernaut.
//
//  Todo lo que separa a un rival torpe de uno temible vive AQUÍ, en datos, no
//  repartido por el código de la IA. Así se puede subir o bajar un nivel sin
//  tocar lógica, y se ve de un vistazo qué cambia entre uno y otro.
//
//  ── Qué significa "dificultad" en este modo ──
//
//  El jugador controla a un cazador (J-1). Sus rivales son de DOS tipos a la
//  vez, y la dificultad afecta a los dos:
//
//    · los otros diez cazadores — compiten por el estandarte y, cuando el
//      jugador lo lleva, son ellos quienes vienen a placarlo;
//    · el Juggernaut — cuando lo lleva otro, es la amenaza que hay que tumbar.
//
//  Por eso cada nivel trae un bloque `jefe` además de los ajustes de cazador:
//  ambos papeles tienen que escalar juntos o el nivel se siente incoherente.
//
//  ── Los números ──
//
//  `medio` reproduce a grandes rasgos el comportamiento que tenía el juego
//  antes de que existieran los niveles; `bajo` y `alto` se abren desde ahí.
// ============================================================================

export const NIVELES = ['bajo', 'medio', 'alto'];

export const DIFICULTADES = {
  // ── BAJO ─────────────────────────────────────────────────────────────────
  // Rivales lentos de reflejos y de mala puntería. Fallan placajes, esquivan
  // hacia donde no deben y van de uno en uno: hay hueco de sobra para agarrar
  // el estandarte y aguantar los 45 s.
  bajo: {
    etiqueta: 'Bajo',
    velocidad: 2.75,
    reaccion: [0.50, 1.00],     // segundos de retardo antes de reaccionar a algo nuevo
    punteria: 0.10,             // 0 = apunta a donde el jefe ESTÁ; 1 = a donde estará
    // Distancias entre las que se lanza el placaje. El techo NUNCA debe pasar
    // de ~2.9: es lo que alcanza de verdad la embestida (avance medido + radio
    // de golpe). Más allá, el placaje sale y no puede conectar.
    // Aquí se queda corto a propósito: dudan y se acercan de más antes de
    // decidirse, que es como ataca alguien inseguro.
    ventanaPlacaje: [1.4, 2.4],
    cdPlacaje: [5.0, 8.0],
    esquivaFiable: 0.30,        // probabilidad de esquivar hacia el lado seguro
    cdEsquiva: 3.5,
    concienciaBorde: 0.15,      // cuánto evitan que los saquen del ruedo
    maxAtacantes: 1,            // cuántos pueden estar placando a la vez
    cohesionAnillo: 0.30,       // cuánto respetan su hueco para rodear al jefe
    distanciaAnillo: 3.4,
    giroAnillo: 0.15,
    jefe: {
      velocidad: 2.45,
      prediccion: 0,            // persigue tu posición actual: fácil de torear
      sesgoBorde: 0,            // no busca a propósito a quien está en el filo
      slamMinCerca: 3,          // cuántos cazadores cerca para lanzar el slam
      cdSlam: [6.5, 9.0],
    },
  },

  // ── MEDIO ────────────────────────────────────────────────────────────────
  // El juego "de fábrica": placajes que a veces entran, esquivas decentes y
  // algo de coordinación, pero con huecos aprovechables.
  medio: {
    etiqueta: 'Medio',
    velocidad: 3.1,
    reaccion: [0.18, 0.40],
    punteria: 0.45,
    ventanaPlacaje: [1.4, 2.8],
    cdPlacaje: [3.0, 6.0],
    esquivaFiable: 0.65,
    cdEsquiva: 2.5,
    concienciaBorde: 0.50,
    maxAtacantes: 2,
    cohesionAnillo: 0.60,
    distanciaAnillo: 3.0,
    giroAnillo: 0.25,
    jefe: {
      velocidad: 2.9,
      prediccion: 0.35,
      sesgoBorde: 0.25,
      slamMinCerca: 2,
      cdSlam: [4.5, 6.5],
    },
  },

  // ── ALTO ─────────────────────────────────────────────────────────────────
  // Reaccionan casi al instante, predicen el movimiento antes de embestir, se
  // reparten el círculo para rodear y esquivan siempre hacia dentro del ruedo.
  // El jefe además va a por quien ya está cerca del abismo.
  alto: {
    etiqueta: 'Alto',
    velocidad: 3.45,
    reaccion: [0.05, 0.14],
    punteria: 0.90,
    // Justo en el filo del alcance: golpean desde lo más lejos que pueden.
    ventanaPlacaje: [1.3, 2.9],
    cdPlacaje: [1.8, 3.4],
    esquivaFiable: 0.95,
    cdEsquiva: 1.6,
    concienciaBorde: 0.90,
    maxAtacantes: 4,
    cohesionAnillo: 0.90,
    distanciaAnillo: 2.7,
    giroAnillo: 0.40,
    jefe: {
      velocidad: 3.25,
      prediccion: 0.80,
      sesgoBorde: 0.60,
      slamMinCerca: 1,
      cdSlam: [2.8, 4.2],
    },
  },
};

// Nunca devuelve undefined: un nivel desconocido (una URL manipulada, un
// localStorage viejo) cae en `medio` en vez de dejar la IA sin parámetros y
// reventar en el primer fotograma.
//
// También acepta una tabla ya montada. Sirve para mezclar bandos —cazadores de
// un nivel contra un jefe de otro—, que es como se puede medir de quién viene
// una diferencia: subiendo los dos a la vez, el equilibrio entre ellos apenas
// se mueve y no se ve cuál de los dos mejoró.
export function dificultadDe(nivel) {
  if (nivel && typeof nivel === 'object') return nivel;
  return DIFICULTADES[nivel] ?? DIFICULTADES.medio;
}

// Cazadores de un nivel, jefe de otro.
export function mezclar(nivelCazadores, nivelJefe) {
  return { ...dificultadDe(nivelCazadores), jefe: dificultadDe(nivelJefe).jefe };
}

export const NIVEL_POR_DEFECTO = 'medio';
