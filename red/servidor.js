// Servidor autoritativo VOID-NET v0.1 — ESQUELETO para desarrollar en equipo.
// Correr:  cd red && npm install && node servidor.js
//
// La simulación real puede reutilizar el núcleo del juego tal cual
// (juggernaut-mode.js es motor-agnóstico): `npm i three` y descomentar los
// imports marcados. Este esqueleto ya maneja conexiones, registro, inputs
// y el bucle de snapshots; los TODO son el trabajo del equipo.

import { WebSocketServer } from 'ws';
// import * as THREE from 'three';
// import { JuggernautMode, NetworkBus } from '../assets/modo-juggernaut/js/juggernaut-mode.js';

const PUERTO = 8140;
const TICK_SIM = 1000 / 60;      // simulación 60 Hz
const TICK_SNAPSHOT = 1000 / 20; // publicación 20 Hz

const wss = new WebSocketServer({ port: PUERTO });
const clientes = new Map(); // ws → { id, nombre, input: {mov, acciones, seq} }
let proximoId = 1;
let seqServidor = 0;

const enviar = (ws, t, data) =>
  ws.send(JSON.stringify({ v: 1, t, seq: seqServidor++, ts: Date.now(), data }));

const difundir = (t, data) => {
  for (const ws of clientes.keys()) {
    if (ws.readyState === ws.OPEN) enviar(ws, t, data);
  }
};

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.v !== 1) return;

    switch (msg.t) {
      case 'HELLO': {
        const id = `J-${proximoId++}`;
        clientes.set(ws, {
          id,
          nombre: String(msg.data?.nombre ?? id).slice(0, 24),
          input: { mov: [0, 0], acciones: 0, seq: 0 },
        });
        enviar(ws, 'WELCOME', {
          id,
          config: { arenaRadius: 20.7, winDominio: 45, tickRate: 20 },
        });
        // TODO(equipo): crear/asignar el Hunter de este jugador en la sim
        console.log(`+ ${id} conectado (${clientes.size} jugadores)`);
        break;
      }
      case 'INPUT': {
        const c = clientes.get(ws);
        if (!c) return;
        // TODO(equipo): validar rangos (|mov| ≤ 1, acciones ≤ 7, anti-flood)
        c.input = msg.data;
        break;
      }
      case 'PING':
        enviar(ws, 'PONG', { ts: msg.ts });
        break;
    }
  });

  ws.on('close', () => {
    const c = clientes.get(ws);
    if (c) {
      clientes.delete(ws);
      difundir('ADIOS', { id: c.id, motivo: 'desconexion' });
      // TODO(equipo): retirar su Hunter de la sim (¿o dejarlo a la IA?)
      console.log(`- ${c.id} desconectado`);
    }
  });
});

// ---------- Bucle de simulación (60 Hz) ----------
setInterval(() => {
  // TODO(equipo): aplicar cada clientes.get(ws).input a su Hunter
  //   (hunter.inputDir.set(mov[0], 0, mov[1]); flags → wantsTackle/wantsDodge)
  // TODO(equipo): mode.update(dt, t)  ← la MISMA clase del cliente, headless
  // TODO(equipo): suscribirse a NetworkBus y re-difundir como EVENT
}, TICK_SIM);

// ---------- Bucle de snapshots (20 Hz) ----------
let tick = 0;
setInterval(() => {
  tick++;
  // TODO(equipo): serializar el estado real de la sim; esto es un stub
  difundir('SNAPSHOT', {
    tick,
    jugadores: [...clientes.values()].map((c) => ({
      id: c.id, p: [0, 0, 0], ry: 0, estado: 'HUNT', esJefe: false,
    })),
    estandarte: { estado: 'LIBRE', pos: [0, 0, 0] },
    dominio: {},
  });
}, TICK_SNAPSHOT);

console.log(`VOID-NET v0.1 escuchando en ws://localhost:${PUERTO}`);
