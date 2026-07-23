// ============================================================================
//  Lanzador Unificado de BladeFront — Captura la Bandera
//  Arranca el Servidor TCP, el Bridge WebSocket Dinámico y el Servidor Web 3D.
//  Abre el navegador automáticamente.
//
//  Uso: node iniciar.js   o   npm start   o   Doble clic en iniciar.bat
// ============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, exec } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;

const PORT_WEB = 8145;
const PORT_BRIDGE = 8140;
const PORT_TCP = 5000;

const log = (tag, ...msg) => console.log(`\x1b[36m[${tag}]\x1b[0m`, ...msg);

// ----------------------------------------------------------------------------
// 1. Servidor HTTP Estático para el juego 3D (sin dependencias externas)
// ----------------------------------------------------------------------------
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm'
};

const serverWeb = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/assets/captura-bandera/index-3d.html';

  let filePath = path.join(ROOT, reqPath);

  // Si piden un directorio o archivo sin extensión, buscar .html o index-3d.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index-3d.html');
  } else if (!path.extname(filePath) && fs.existsSync(filePath + '.html')) {
    filePath = filePath + '.html';
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Archivo no encontrado');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

serverWeb.listen(PORT_WEB, () => {
  log('HTTP WEB', `Servidor Web activo en http://localhost:${PORT_WEB}`);
});

// ----------------------------------------------------------------------------
// 2. Iniciar Servidor TCP Autoritativo
// ----------------------------------------------------------------------------
const procServidor = spawn('node', ['red/servidor.js', '--port', String(PORT_TCP), '--auto'], {
  cwd: ROOT,
  stdio: 'inherit'
});

// ----------------------------------------------------------------------------
// 3. Iniciar Bridge WebSocket Dinámico
// ----------------------------------------------------------------------------
const procBridge = spawn('node', ['red/bridge.js', '--ws', String(PORT_BRIDGE)], {
  cwd: ROOT,
  stdio: 'inherit'
});

// ----------------------------------------------------------------------------
// 4. Abrir Navegador Automáticamente
// ----------------------------------------------------------------------------
const gameUrl = `http://localhost:${PORT_WEB}/assets/captura-bandera/index-3d.html`;

setTimeout(() => {
  console.log('\n===========================================================');
  console.log(' ⚔️   BLADEFRONT / CAPTURA LA BANDERA — SISTEMA INICIADO');
  console.log('===========================================================');
  console.log(` 🌐 Juego 3D en Navegador: ${gameUrl}`);
  console.log(` 🛰️  Bridge Dinámico:      ws://localhost:${PORT_BRIDGE}`);
  console.log(` ⚡ Servidor TCP Local:     0.0.0.0:${PORT_TCP}`);
  console.log('-----------------------------------------------------------');
  console.log(' 💡 Para conectarte a cualquier compañero en Radmin VPN:');
  console.log('    Escribe la IP de tu compañero en la casilla de la UI y presiona "Entrar".');
  console.log('===========================================================\n');

  const startCmd = process.platform === 'win32' ? `start ${gameUrl}` :
                  process.platform === 'darwin' ? `open ${gameUrl}` : `xdg-open ${gameUrl}`;
  exec(startCmd, () => {});
}, 1000);

// Limpieza al cerrar con Ctrl+C
process.on('SIGINT', () => {
  log('SISTEMA', 'Cerrando todos los servicios...');
  procServidor.kill();
  procBridge.kill();
  serverWeb.close();
  process.exit(0);
});
