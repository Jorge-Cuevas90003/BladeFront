// ============================================================================
//  Bridge WebSocket ↔ TCP para el PRFC v3.
//
//  El navegador no puede abrir sockets TCP crudos ni mandar datagramas UDP, así
//  que este proceso hace de traductor para las dos cosas:
//
//    navegador ──WebSocket binario──▶ BRIDGE ──TCP──▶ servidor oficial
//    navegador ──HTTP GET──────────▶ BRIDGE ──UDP broadcast──▶ red local
//
//  Sobre el tramo de juego NO se parsea NADA: los bytes se reenvían tal cual en
//  ambos sentidos. Es a propósito — si el bridge decodificara, habría que
//  actualizarlo cada vez que cambie el protocolo, y podría desincronizarse del
//  servidor. Como tubería tonta, cualquier cambio del PRFC lo atraviesa solo.
//
//  El reensamblado de mensajes lo hace el cliente con AcumuladorTCP: TCP no
//  respeta límites de mensaje, así que un frame WebSocket puede traer medio
//  mensaje o dos y medio.
//
//  Correr:  node red/v3/bridge-v3.js --ws 8146 --tcp-host 127.0.0.1 --tcp-port 5000
// ============================================================================

import http from 'node:http';
import net from 'node:net';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { buscarServidores } from './descubrimiento.js';
import { PARAMS_DEFECTO } from './protocolo-v3.js';

export function crearBridge({
  puertoWs = 8146,
  tcpHost = '127.0.0.1',
  tcpPort = PARAMS_DEFECTO.serverPort,
  puertoUdp = PARAMS_DEFECTO.discoveryPort,
  log = () => {},
} = {}) {
  // La página se sirve desde otro puerto (8145), así que sin CORS el navegador
  // no podría consultar el descubrimiento.
  const cors = (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
  };

  const http_ = http.createServer(async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const url = new URL(req.url, 'http://localhost');

    // Descubrimiento por delegación: el navegador no puede hacer broadcast UDP,
    // así que lo hace el bridge y devuelve la lista ya resuelta.
    if (url.pathname === '/servidores') {
      const espera = Math.min(3000, Number(url.searchParams.get('espera')) || 800);
      try {
        const servidores = await buscarServidores({
          puerto: Number(url.searchParams.get('puerto')) || puertoUdp,
          direccion: url.searchParams.get('direccion') || '255.255.255.255',
          esperaMs: espera,
        });
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ servidores }));
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: e.message }));
      }
    }

    if (url.pathname === '/salud') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true, destinoPorDefecto: `${tcpHost}:${tcpPort}` }));
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Bridge PRFC v3. Rutas: /servidores, /salud, y WebSocket en /');
  });

  const wss = new WebSocketServer({ server: http_ });

  wss.on('connection', (ws, req) => {
    // Destino configurable por query, para poder elegir servidor desde la UI
    // sin relanzar el bridge.
    let host = tcpHost, port = tcpPort;
    try {
      const u = new URL(req.url, 'http://localhost');
      if (u.searchParams.has('host')) host = u.searchParams.get('host');
      if (u.searchParams.has('port')) port = Number(u.searchParams.get('port')) || tcpPort;
    } catch {}

    const tcp = net.connect(port, host);
    tcp.setNoDelay(true);
    log(`navegador conectado → abriendo TCP a ${host}:${port}`);

    // Lo que llega del navegador puede encolarse antes de que el TCP esté
    // listo; sin este búfer se perdería el JOIN si el usuario es rápido.
    let tcpListo = false;
    const pendiente = [];

    tcp.on('connect', () => {
      tcpListo = true;
      for (const b of pendiente) tcp.write(b);
      pendiente.length = 0;
    });

    // servidor → navegador: bytes crudos, sin tocar.
    tcp.on('data', (d) => {
      if (ws.readyState === ws.OPEN) ws.send(d, { binary: true });
    });

    // navegador → servidor: idem.
    ws.on('message', (datos, esBinario) => {
      // Un cliente que mande texto está mal configurado (falta binaryType);
      // se convierte igual para no dejarlo mudo sin explicación.
      const buf = esBinario ? datos : Buffer.from(datos);
      if (tcpListo) { if (!tcp.destroyed) tcp.write(buf); }
      else pendiente.push(buf);
    });

    const cerrar = () => {
      try { ws.close(); } catch {}
      try { tcp.end(); } catch {}
    };
    ws.on('close', cerrar);
    ws.on('error', cerrar);
    tcp.on('close', cerrar);
    tcp.on('error', (e) => {
      log(`error TCP (${host}:${port}): ${e.message}`);
      // Cerrar con un código propio permite al cliente distinguir "no pude
      // conectar con el servidor" de "se cayó el bridge".
      try { ws.close(4001, 'no se pudo conectar con el servidor de juego'); } catch {}
      try { tcp.destroy(); } catch {}
    });
  });

  return {
    http: http_,
    wss,
    get puerto() { return http_.address()?.port ?? puertoWs; },
    escuchar() {
      return new Promise((resolve) => http_.listen(puertoWs, () => resolve(http_.address()?.port ?? puertoWs)));
    },
    cerrar() {
      return new Promise((resolve) => {
        for (const c of wss.clients) { try { c.terminate(); } catch {} }
        wss.close(() => http_.close(resolve));
      });
    },
  };
}

// --- modo programa ----------------------------------------------------------
const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esPrincipal) {
  const args = process.argv.slice(2);
  const val = (n, def) => {
    const i = args.indexOf('--' + n);
    return i >= 0 && args[i + 1] ? args[i + 1] : def;
  };
  const marca = (...a) => console.log(new Date().toISOString().slice(11, 19), '[bridge]', ...a);

  const b = crearBridge({
    puertoWs: Number(val('ws', 8146)),
    tcpHost: val('tcp-host', '127.0.0.1'),
    tcpPort: Number(val('tcp-port', PARAMS_DEFECTO.serverPort)),
    puertoUdp: Number(val('discovery-port', PARAMS_DEFECTO.discoveryPort)),
    log: marca,
  });

  const p = await b.escuchar();
  marca(`WebSocket para el navegador en ws://localhost:${p}`);
  marca(`destino TCP por defecto: ${val('tcp-host', '127.0.0.1')}:${Number(val('tcp-port', PARAMS_DEFECTO.serverPort))}`);
  marca(`descubrimiento delegado en http://localhost:${p}/servidores`);

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => { await b.cerrar(); process.exit(0); });
  }
}
