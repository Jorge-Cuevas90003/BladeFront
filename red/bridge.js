// ============================================================================
//  Bridge TCP ↔ WebSocket — deja que un cliente de NAVEGADOR (three.js) hable
//  con el servidor oficial, que solo entiende TCP crudo (§23). El navegador
//  no puede abrir sockets TCP, así que este proceso hace de traductor:
//
//    navegador  ──WebSocket──▶  BRIDGE  ──TCP + JSON\n──▶  servidor oficial
//
//  El protocolo hacia el servidor NO cambia: se reenvía cada línea tal cual.
//  El WebSocket es solo la tubería interna navegador↔bridge.
//
//  Correr:  node red/bridge.js --ws 8140 --tcp-host 127.0.0.1 --tcp-port 5000
// ============================================================================

import net from 'node:net';
import process from 'node:process';
import { WebSocketServer } from 'ws';
import { LectorLineas } from './protocolo.js';

const args = process.argv.slice(2);
const val = (n, def) => {
  const i = args.indexOf('--' + n);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const WS_PORT = Number(val('ws', 8140));
const TCP_HOST = val('tcp-host', '127.0.0.1');
const TCP_PORT = Number(val('tcp-port', 5000));

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), '[bridge]', ...a);

const wss = new WebSocketServer({ port: WS_PORT });
log(`WebSocket para el navegador en ws://localhost:${WS_PORT}`);
log(`Reenviando a TCP ${TCP_HOST}:${TCP_PORT}`);

wss.on('connection', (ws, req) => {
  let targetHost = TCP_HOST;
  let targetPort = TCP_PORT;

  try {
    const u = new URL(req.url, 'http://localhost');
    if (u.searchParams.has('targetHost')) targetHost = u.searchParams.get('targetHost');
    if (u.searchParams.has('targetPort')) targetPort = Number(u.searchParams.get('targetPort')) || TCP_PORT;
  } catch {}

  // Por cada navegador que se conecta, abrimos UNA conexión TCP al servidor objetivo.
  const tcp = net.connect(targetPort, targetHost);
  log(`navegador conectado → abriendo TCP al servidor en ${targetHost}:${targetPort}`);

  // servidor (TCP, por líneas) → navegador (WS, un JSON por frame)
  const lector = new LectorLineas((obj) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  });
  tcp.on('data', (d) => lector.alimentar(d));

  // navegador (WS) → servidor (TCP, agregando el \n del framing)
  ws.on('message', (data) => {
    if (!tcp.destroyed) tcp.write(data.toString() + '\n');
  });

  const cerrar = () => { try { ws.close(); } catch {} try { tcp.end(); } catch {} };
  ws.on('close', cerrar);
  ws.on('error', cerrar);
  tcp.on('close', cerrar);
  tcp.on('error', (e) => { log(`error TCP (${targetHost}:${targetPort}):`, e.message); cerrar(); });
});
