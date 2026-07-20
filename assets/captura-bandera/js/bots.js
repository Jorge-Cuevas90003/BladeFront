// ============================================================================
//  IA simple para rellenar jugadores en el MODO LOCAL de prueba. No es parte
//  del protocolo: solo decide direcciones para que haya movimiento y se pueda
//  testear el juego sin 12 personas conectadas. ES module sin dependencias.
//
//  Estrategia greedy: si llevo la bandera, voy hacia el borde más cercano;
//  si no, voy hacia la bandera. Con algo de aleatoriedad para no atascarse.
// ============================================================================

const DIR_HACIA = (dr, dc) => {
  if (Math.abs(dr) >= Math.abs(dc)) return dr < 0 ? 'UP' : 'DOWN';
  return dc < 0 ? 'LEFT' : 'RIGHT';
};

// Decide la dirección de un bot dado el estado público del juego.
// jugador: el objeto público del propio bot; estado: serializarEstado(); cfg: config.
export function decidirDireccion(jugador, estado, cfg) {
  // Aún fuera del tablero: mantener la dirección de entrada (hacia adentro).
  if (!jugador.insideBoard) return jugador.direction;

  const { rows, columns } = cfg;

  if (jugador.hasFlag) {
    // Ir al borde más cercano para salir.
    const dArriba = jugador.row;
    const dAbajo = rows - 1 - jugador.row;
    const dIzq = jugador.column;
    const dDer = columns - 1 - jugador.column;
    const min = Math.min(dArriba, dAbajo, dIzq, dDer);
    if (min === dArriba) return 'UP';
    if (min === dAbajo) return 'DOWN';
    if (min === dIzq) return 'LEFT';
    return 'RIGHT';
  }

  const b = estado.flag;
  if (b && (b.status === 'AVAILABLE' || b.status === 'DROPPED' || b.status === 'CARRIED')) {
    // Perseguir la bandera (o a quien la lleve).
    const dr = b.row - jugador.row;
    const dc = b.column - jugador.column;
    if (dr === 0 && dc === 0) return jugador.direction;
    // 15% de las veces gira al eje secundario para rodear obstáculos.
    if (Math.random() < 0.15) {
      return Math.abs(dr) >= Math.abs(dc)
        ? (dc < 0 ? 'LEFT' : 'RIGHT')
        : (dr < 0 ? 'UP' : 'DOWN');
    }
    return DIR_HACIA(dr, dc);
  }

  return jugador.direction;
}
