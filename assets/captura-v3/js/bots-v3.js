// ============================================================================
//  Bots para el modo local del PRFC v3 (plano continuo).
//
//  Solo deciden lo mismo que puede decidir un humano: una de las cinco
//  direcciones y si pulsan interactuar. No leen ni tocan el estado interno del
//  motor, así que un bot no puede hacer nada que un jugador de red no pueda.
//
//  Sin diagonales (§10), el camino recto no existe: se avanza por el eje con
//  mayor diferencia y se cambia de eje al alternar. Eso da el zigzag escalonado
//  típico de este tipo de rejilla libre.
// ============================================================================

import { DIRECCIONES, ESTADO_BANDERA } from '../../../red/v3/protocolo-v3.js';

// Memoria por bot: sirve para detectar atascos y para no cambiar de eje en cada
// ciclo (lo que produciría un temblor en diagonal en vez de avanzar).
const memoria = new Map(); // playerId -> { ejeUltimo, sinAvanzar, mejorDist, rumbo }

export function reiniciarBots() {
  memoria.clear();
}

export function olvidarBot(playerId) {
  memoria.delete(playerId);
}

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// Dirección cardinal que más acerca (o aleja) de un punto.
function haciaPunto(desdeX, desdeY, haciaX, haciaY, m, alejarse = false) {
  let dx = haciaX - desdeX;
  let dy = haciaY - desdeY;
  if (alejarse) { dx = -dx; dy = -dy; }

  // Se mantiene el eje anterior mientras siga siendo útil: cambiar de eje cada
  // ciclo haría que el bot vibre en el sitio en vez de avanzar.
  const prefiereX = Math.abs(dx) > Math.abs(dy);
  const eje = (m.ejeUltimo === 'x' && Math.abs(dx) > 1) ? 'x'
            : (m.ejeUltimo === 'y' && Math.abs(dy) > 1) ? 'y'
            : (prefiereX ? 'x' : 'y');
  m.ejeUltimo = eje;

  if (eje === 'x') return dx >= 0 ? DIRECCIONES.RIGHT : DIRECCIONES.LEFT;
  return dy >= 0 ? DIRECCIONES.DOWN : DIRECCIONES.UP; // y crece hacia abajo (§5)
}

// ---------------------------------------------------------------------------
//  Decide qué hace un bot este ciclo.
//    jugador : su entrada del GAME_STATE { playerId, x, y, hasFlag }
//    estado  : el GAME_STATE completo
//    cfg     : parámetros de la partida (circleRadius, interactionRadius…)
//  Devuelve { direction, interactuar }.
// ---------------------------------------------------------------------------
export function decidirBot(jugador, estado, cfg) {
  let m = memoria.get(jugador.playerId);
  if (!m) {
    m = { ejeUltimo: null, sinAvanzar: 0, mejorDist: Infinity, rumbo: Math.random() * Math.PI * 2 };
    memoria.set(jugador.playerId, m);
  }

  const R = cfg.circleRadius ?? 500;
  const rInter = cfg.interactionRadius ?? 60;
  const rJug = cfg.playerRadius ?? 15;
  const dOrigen = Math.hypot(jugador.x, jugador.y);

  // ── Caso 1: lleva la bandera → salir del círculo por el camino más corto.
  if (jugador.hasFlag) {
    m.ejeUltimo = null; // recalcula libremente: aquí lo que importa es salir ya
    // Se aleja del origen en línea recta; el eje dominante es el que más
    // rápido aumenta la distancia al centro.
    const dir = Math.abs(jugador.x) > Math.abs(jugador.y)
      ? (jugador.x >= 0 ? DIRECCIONES.RIGHT : DIRECCIONES.LEFT)
      : (jugador.y >= 0 ? DIRECCIONES.DOWN : DIRECCIONES.UP);
    // Si está justo en el centro, cualquier eje sirve.
    if (dOrigen < 1) return { direction: DIRECCIONES.RIGHT, interactuar: false };
    return { direction: dir, interactuar: false };
  }

  // ── Caso 2: alguien la lleva → perseguir al portador y robársela.
  if (estado.flagStatus === ESTADO_BANDERA.CARRIED && estado.flagCarrierId !== jugador.playerId) {
    const portador = estado.players.find((p) => p.playerId === estado.flagCarrierId);
    if (portador) {
      const d = dist(jugador.x, jugador.y, portador.x, portador.y);
      const dir = haciaPunto(jugador.x, jugador.y, portador.x, portador.y, m);
      // Se pulsa interactuar un poco antes de estar en rango: el portador se
      // mueve, y en el ciclo en que se resuelve puede haber entrado ya.
      return { direction: dir, interactuar: d <= rInter * 1.2 };
    }
  }

  // ── Caso 3: la bandera está libre o caída → ir por ella.
  if (estado.flagStatus === ESTADO_BANDERA.AVAILABLE || estado.flagStatus === ESTADO_BANDERA.DROPPED) {
    const d = dist(jugador.x, jugador.y, estado.flagX, estado.flagY);

    // Detección de atasco: si no se acerca durante varios ciclos, es que hay un
    // borde de por medio (o dos bots peleando el mismo eje). Se da un rodeo.
    if (d < m.mejorDist - 0.5) { m.mejorDist = d; m.sinAvanzar = 0; }
    else m.sinAvanzar++;

    if (m.sinAvanzar > 12) {
      m.sinAvanzar = 0;
      m.mejorDist = Infinity;
      m.ejeUltimo = m.ejeUltimo === 'x' ? 'y' : 'x'; // fuerza el otro eje
    }

    const dir = haciaPunto(jugador.x, jugador.y, estado.flagX, estado.flagY, m);
    return { direction: dir, interactuar: d <= rInter * 1.2 };
  }

  // ── Caso 4: la partida ya se decidió (bandera OUTSIDE) → quedarse quieto.
  return { direction: DIRECCIONES.NONE, interactuar: false };
}
