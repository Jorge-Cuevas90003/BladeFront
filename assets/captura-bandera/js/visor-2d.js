// ============================================================================
//  Visor 2D — render mínimo en canvas para TESTEAR el juego. Escucha el
//  ClienteCaptura (local o red) y dibuja el último GAME_STATE. Las teclas
//  mandan CHANGE_DIRECTION. Es deliberadamente simple: su trabajo no es verse
//  bonito, sino probar que el motor y el protocolo funcionan de punta a punta.
//
//  El cliente 3D de three.js consumirá EXACTAMENTE los mismos eventos del bus
//  (GAME_STATE, FLAG_*, GAME_OVER); solo cambia cómo se dibuja cada [row,col].
// ============================================================================

import { ClienteCaptura } from 'red/cliente-red.js';
import { TIPOS } from 'red/protocolo.js';

const $ = (id) => document.getElementById(id);
const lienzo = $('lienzo');
const ctx = lienzo.getContext('2d');

let cliente = null;
let estado = null;   // último GAME_STATE
let inicio = null;   // GAME_STARTED (tablero + obstáculos)

const COL = { bg: '#070a0e', celda: '#0f1520', reja: '#141c28', obst: '#33405a', flag: '#ffb638', yo: '#4aa8ff', otro: '#8ea2bd', portador: '#ff4a3d' };

// --- UI: mostrar/ocultar campos según el modo ------------------------------
$('modo').addEventListener('change', () => {
  const red = $('modo').value === 'red';
  $('wrapUrl').style.display = red ? '' : 'none';
  $('wrapBots').style.display = red ? 'none' : '';
});

$('jugar').addEventListener('click', jugar);
$('reset').addEventListener('click', () => location.reload());

function feed(txt) {
  const li = document.createElement('li');
  li.textContent = txt;
  $('feed').prepend(li);
  while ($('feed').children.length > 40) $('feed').lastChild.remove();
}

async function jugar() {
  if (cliente) cliente.detener();
  $('feed').innerHTML = '';
  const nombre = $('nombre').value || 'Tú';
  cliente = new ClienteCaptura();

  cliente.addEventListener(TIPOS.GAME_STARTED, (e) => { inicio = e.detail; dibujar(); });
  cliente.addEventListener(TIPOS.GAME_STATE, (e) => { estado = e.detail; render(); });
  cliente.addEventListener(TIPOS.FLAG_PICKED_UP, (e) => feed(`🏳️ ${e.detail.playerId} tomó la bandera`));
  cliente.addEventListener(TIPOS.FLAG_STOLEN, (e) => feed(`🔁 ${e.detail.newCarrierId} le robó a ${e.detail.previousCarrierId}`));
  cliente.addEventListener(TIPOS.PLAYER_DISCONNECTED, (e) => feed(`✂️ ${e.detail.playerId} se desconectó`));
  cliente.addEventListener(TIPOS.GAME_OVER, (e) => feed(`🏆 Ganó ${e.detail.winnerName} (${e.detail.winnerId})`));
  cliente.addEventListener(TIPOS.ERROR, (e) => feed(`✗ ${e.detail.code}: ${e.detail.description}`));

  $('iModo').textContent = $('modo').value;

  try {
    if ($('modo').value === 'local') {
      cliente.iniciarLocal({ nombre, bots: Number($('bots').value) || 0 });
      feed('▶ modo local iniciado');
    } else {
      feed('⏳ conectando al bridge…');
      await cliente.conectar($('url').value, nombre);
      feed('▶ conectado en modo red como ' + cliente.playerId);
    }
    $('iYo').textContent = cliente.playerId || '—';
  } catch (err) {
    feed('✗ no se pudo conectar: ' + (err.message || err));
  }
}

// --- input: teclas → CHANGE_DIRECTION --------------------------------------
const TECLAS = {
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  w: 'UP', s: 'DOWN', a: 'LEFT', d: 'RIGHT', W: 'UP', S: 'DOWN', A: 'LEFT', D: 'RIGHT',
};
window.addEventListener('keydown', (e) => {
  const dir = TECLAS[e.key];
  if (dir && cliente) { cliente.cambiarDireccion(dir); e.preventDefault(); }
});

// --- render ----------------------------------------------------------------
function render() {
  if (!estado) return;
  $('iTick').textContent = estado.tick;
  $('iBandera').textContent = estado.flag.status;
  $('iJug').textContent = estado.players.length;
  const yo = estado.players.find((p) => p.playerId === cliente?.playerId);
  $('iYo').textContent = yo ? `${cliente.playerId} [${yo.row},${yo.column}]${yo.hasFlag ? ' 🏳️' : ''}` : (cliente?.playerId || '—');
  dibujar();
}

function dibujar() {
  const cols = inicio?.columns || 20;
  const rows = inicio?.rows || 20;
  const W = lienzo.width, H = lienzo.height;
  const cw = W / cols, ch = H / rows;

  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, W, H);

  // rejilla
  ctx.strokeStyle = COL.reja;
  ctx.lineWidth = 1;
  for (let c = 0; c <= cols; c++) { ctx.beginPath(); ctx.moveTo(c * cw, 0); ctx.lineTo(c * cw, H); ctx.stroke(); }
  for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * ch); ctx.lineTo(W, r * ch); ctx.stroke(); }

  // obstáculos
  if (inicio?.obstacles) {
    ctx.fillStyle = COL.obst;
    for (const o of inicio.obstacles) ctx.fillRect(o.column * cw + 1, o.row * ch + 1, cw - 2, ch - 2);
  }

  // bandera
  if (estado?.flag && estado.flag.row >= 0 && (estado.flag.status === 'AVAILABLE' || estado.flag.status === 'DROPPED')) {
    dibujarBandera(estado.flag.column * cw + cw / 2, estado.flag.row * ch + ch / 2, Math.min(cw, ch) * 0.4);
  }

  // jugadores
  if (estado?.players) {
    for (const p of estado.players) {
      if (!p.insideBoard) continue; // fuera del tablero no se pinta
      const x = p.column * cw + cw / 2;
      const y = p.row * ch + ch / 2;
      const rad = Math.min(cw, ch) * 0.34;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle = p.playerId === cliente?.playerId ? COL.yo : (p.hasFlag ? COL.portador : COL.otro);
      ctx.fill();
      if (p.hasFlag) dibujarBandera(x, y - rad - 3, rad * 0.7);
    }
  }
}

function dibujarBandera(x, y, s) {
  ctx.strokeStyle = COL.flag; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - s * 0.3, y - s); ctx.lineTo(x - s * 0.3, y + s); ctx.stroke();
  ctx.fillStyle = COL.flag;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.3, y - s);
  ctx.lineTo(x + s * 0.7, y - s * 0.5);
  ctx.lineTo(x - s * 0.3, y);
  ctx.closePath(); ctx.fill();
}

// pinta el tablero vacío al cargar
dibujar();
