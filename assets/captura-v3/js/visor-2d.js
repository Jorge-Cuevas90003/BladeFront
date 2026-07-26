// ============================================================================
//  Visor 2D del PRFC v3 — vista cenital sobre canvas.
//
//  No es una versión reducida del 3D: es una HERRAMIENTA DE DIAGNÓSTICO.
//  Dibuja exactamente lo que dice el GAME_STATE y nada más, sin interpolar
//  posiciones ni suavizar nada. Si un caballero aparece donde no debe, aquí se
//  ve en crudo, sin que la animación lo disimule.
//
//  Sirve además para comprobar contra otros equipos: casi todos renderizan en
//  2D, así que poner esta vista al lado de la suya hace evidente cualquier
//  discrepancia de coordenadas o de escala.
//
//  Coordenadas (§5): el plano es continuo, centrado en (0,0), con y creciendo
//  HACIA ABAJO. Eso coincide con el sentido nativo del canvas, así que el
//  mapeo es una traslación al centro y un factor de escala. Sin inversiones:
//  es justo el tipo de detalle donde dos equipos divergen sin darse cuenta.
// ============================================================================

import { TIPOS, ESTADO_BANDERA, PARAMS_DEFECTO } from '../../../red/v3/protocolo-v3.js';

const COLOR = {
  fondo: '#06080c',
  fueraMapa: '#04050a',
  rejilla: 'rgba(73,230,255,.07)',
  bordeMapa: 'rgba(73,230,255,.35)',
  circulo: 'rgba(255,182,56,.55)',
  circuloRelleno: 'rgba(255,182,56,.045)',
  victoria: 'rgba(255,182,56,.22)',
  yo: '#49e6ff',
  otro: '#cfd8e6',
  portador: '#ffb638',
  bandera: '#ffb638',
  texto: '#63728a',
};

export function crearVisor2D(canvas, cliente) {
  const ctx = canvas.getContext('2d');
  let cfg = { ...PARAMS_DEFECTO };
  let escala = 1, cx = 0, cy = 0;

  // Escala y centro. Se recalcula al redimensionar y al empezar la partida,
  // porque mapSize llega en el GAME_STARTED y puede no ser el de por defecto.
  function ajustar() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    // El panel puede estar oculto por una media query, y entonces mide 0. Un
    // canvas de ancho cero rompe getImageData y deja el contexto inservible
    // aunque después se muestre, así que aquí no se toca nada.
    if (w === 0 || h === 0) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = w / 2;
    cy = h / 2;
    // Cabe el mapa entero con un margen; el lado menor manda.
    escala = (Math.min(w, h) * 0.92) / cfg.mapSize;
  }

  const aX = (x) => cx + x * escala;
  const aY = (y) => cy + y * escala;   // y crece hacia abajo en ambos sistemas

  function dibujar() {
    const est = cliente.estado;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === 0 || h === 0) return;   // panel oculto: no hay nada que pintar
    if (canvas.width === 0) ajustar();

    ctx.fillStyle = COLOR.fueraMapa;
    ctx.fillRect(0, 0, w, h);

    const lado = cfg.mapSize * escala;
    const x0 = cx - lado / 2, y0 = cy - lado / 2;

    // Mapa
    ctx.fillStyle = COLOR.fondo;
    ctx.fillRect(x0, y0, lado, lado);

    // Rejilla de referencia cada 250 unidades: da sentido de distancia sin
    // sugerir que el juego sea por casillas, que no lo es.
    ctx.strokeStyle = COLOR.rejilla;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let v = -cfg.mapSize / 2; v <= cfg.mapSize / 2; v += 250) {
      ctx.moveTo(aX(v), y0); ctx.lineTo(aX(v), y0 + lado);
      ctx.moveTo(x0, aY(v)); ctx.lineTo(x0 + lado, aY(v));
    }
    ctx.stroke();

    ctx.strokeStyle = COLOR.bordeMapa;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0, y0, lado, lado);

    // Círculo central y línea de victoria. La segunda es la de §16:
    // circleRadius + playerRadius, que es donde de verdad se gana, no el borde
    // del círculo. Verlas separadas evita discutir por qué "ya salí y no gané".
    ctx.fillStyle = COLOR.circuloRelleno;
    ctx.beginPath();
    ctx.arc(cx, cy, cfg.circleRadius * escala, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLOR.circulo;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = COLOR.victoria;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(cx, cy, (cfg.circleRadius + cfg.playerRadius) * escala, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (!est) {
      ctx.fillStyle = COLOR.texto;
      ctx.font = '13px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('esperando GAME_STATE…', cx, cy);
      return;
    }

    // Bandera en el suelo (si la lleva alguien se dibuja sobre su portador)
    if (est.flagStatus === ESTADO_BANDERA.AVAILABLE || est.flagStatus === ESTADO_BANDERA.DROPPED) {
      const fx = aX(est.flagX), fy = aY(est.flagY);
      // Radio de interacción: explica de un vistazo por qué un INTERACT no
      // alcanzó, que es la duda más común al depurar.
      ctx.strokeStyle = 'rgba(255,182,56,.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(fx, fy, cfg.interactionRadius * escala, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = COLOR.bandera;
      ctx.beginPath();
      ctx.moveTo(fx, fy - 9);
      ctx.lineTo(fx + 8, fy - 4);
      ctx.lineTo(fx, fy + 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(fx - 1, fy - 9, 1.5, 13);
    }

    // Jugadores
    for (const p of est.players) {
      const x = aX(p.x), y = aY(p.y);
      const esYo = p.playerId === cliente.playerId;
      const r = Math.max(3, cfg.playerRadius * escala);

      if (p.hasFlag) {
        ctx.strokeStyle = 'rgba(255,182,56,.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, cfg.interactionRadius * escala, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = p.hasFlag ? COLOR.portador : (esYo ? COLOR.yo : COLOR.otro);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      if (esYo) {
        ctx.strokeStyle = COLOR.yo;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Vector de dirección: hace visible el INPUT que el servidor tiene
      // registrado, que no siempre es el último que uno cree haber mandado.
      const d = { 1: [0, -1], 2: [0, 1], 3: [-1, 0], 4: [1, 0] }[p.direction];
      if (d) {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + d[0] * (r + 7), y + d[1] * (r + 7));
        ctx.stroke();
      }

      ctx.fillStyle = COLOR.texto;
      ctx.font = '10px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`#${p.playerId}`, x, y - r - 5);
    }

    // Lectura numérica cruda: es lo que se compara con el servidor del otro
    // equipo cuando los dibujos no coinciden.
    ctx.fillStyle = COLOR.texto;
    ctx.font = '11px Rajdhani, monospace';
    ctx.textAlign = 'left';
    const yo = est.players.find((p) => p.playerId === cliente.playerId);
    const lineas = [
      `tick ${est.tick}`,
      `bandera ${['','AVAILABLE','CARRIED','DROPPED','OUTSIDE'][est.flagStatus] || '?'}` +
        (est.flagCarrierId ? ` #${est.flagCarrierId}` : ''),
      `bandera xy ${est.flagX.toFixed(1)}, ${est.flagY.toFixed(1)}`,
      yo ? `yo xy ${yo.x.toFixed(1)}, ${yo.y.toFixed(1)} · r ${Math.hypot(yo.x, yo.y).toFixed(1)}` : 'yo —',
      `jugadores ${est.players.length}`,
    ];
    lineas.forEach((t, i) => ctx.fillText(t, 10, 18 + i * 14));
  }

  // El GAME_STARTED trae los parámetros reales, que pueden no ser los de §21
  // si el anfitrión los cambió.
  cliente.addEventListener(String(TIPOS.GAME_STARTED), (e) => {
    cfg = { ...cfg, ...e.detail };
    ajustar();
  });

  window.addEventListener('resize', ajustar);
  ajustar();

  let vivo = true;
  (function bucle() {
    if (!vivo) return;
    dibujar();
    requestAnimationFrame(bucle);
  })();

  return {
    ajustar,
    detener() { vivo = false; },
    get cfg() { return cfg; },
  };
}
