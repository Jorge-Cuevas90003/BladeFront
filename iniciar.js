// ============================================================================
//  Lanzador Unificado de BladeFront — Captura la Bandera
//
//  Arranca de un tirón las tres piezas que hacen falta para jugar en red:
//    1. el servidor autoritativo TCP,
//    2. el bridge WebSocket↔TCP (el navegador no puede hablar TCP crudo),
//    3. un servidor HTTP estático que sirve LA RAÍZ DEL PROYECTO.
//
//  Se sirve la raíz y no assets/ a propósito: las páginas importan módulos con
//  rutas del tipo '../../../red/v3/protocolo-v3.js', que quedan FUERA de
//  assets/. Sirviendo solo assets/ el navegador daría 404 en esos imports.
//
//  Por defecto lanza la implementación v3 (PRFC v3, plano continuo). Con --v1
//  lanza la antigua de rejilla, que se conserva intacta.
//
//  Uso:  node iniciar.js   ·   npm start   ·   doble clic en iniciar.bat
//        node iniciar.js --ayuda
// ============================================================================

import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dgram from 'node:dgram';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawn, exec } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(__filename);

// El lanzador no debe detener servicios del sistema para apropiarse de un
// puerto. Si 5001 está ocupado se informa mediante la comprobación de puertos
// que aparece más abajo, sin afectar la conectividad de Windows.

// ----------------------------------------------------------------------------
//  Argumentos
// ----------------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const val = (n, def) => {
  const i = args.indexOf('--' + n);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const num = (n, def) => {
  const v = Number(val(n, def));
  return Number.isFinite(v) && v > 0 && v < 65536 ? Math.trunc(v) : def;
};

if (flag('ayuda') || flag('help') || args.includes('-h')) {
  console.log(`
  Lanzador de BladeFront — Captura la Bandera

    node iniciar.js [opciones]

    --v1                       arranca la implementación antigua (rejilla)
                               en vez de la v3, que es la de por defecto
    --puerto-tcp N             puerto del servidor de juego      (5000)
    --puerto-descubrimiento N  puerto UDP de descubrimiento      (5001)
                               si está ocupado se busca otro solo
    --puerto-bridge N          puerto del bridge WebSocket  (8146; 8140 en v1)
    --nombre "TEXTO"           nombre con el que el servidor se anuncia
    --sin-navegador            no abrir el navegador automáticamente
    --ayuda                    esta ayuda

    La página siempre se sirve en http://localhost:${8145}.
`);
  process.exit(0);
}

const V1 = flag('v1');

const PUERTO_WEB = 8145;
const PUERTO_TCP = num('puerto-tcp', 5000);
const PUERTO_BRIDGE = num('puerto-bridge', V1 ? 8140 : 8146);
const PUERTO_UDP_PEDIDO = num('puerto-descubrimiento', 5001);
const NOMBRE = val('nombre', 'BladeFront');
const SIN_NAVEGADOR = flag('sin-navegador');

// Todo lo que cambia entre las dos implementaciones, en un solo sitio.
const MODO = V1
  ? {
      etiqueta: 'v1 (rejilla, JSON por línea)',
      servidor: 'red/servidor.js',
      bridge: 'red/bridge.js',
      pagina: '/assets/captura-bandera/index-3d.html',
      // La v1 no tiene descubrimiento UDP: el jugador escribe la IP a mano.
      descubrimiento: false,
    }
  : {
      etiqueta: 'v3 (PRFC v3, plano continuo)',
      servidor: 'red/v3/servidor-v3.js',
      bridge: 'red/v3/bridge-v3.js',
      pagina: '/assets/captura-v3/index.html',
      descubrimiento: true,
    };

const URL_JUEGO = `http://localhost:${PUERTO_WEB}${MODO.pagina}`;

// ----------------------------------------------------------------------------
//  Consola
// ----------------------------------------------------------------------------
const C = {
  gris: '\x1b[90m', cian: '\x1b[36m', verde: '\x1b[32m',
  amarillo: '\x1b[33m', rojo: '\x1b[31m', magenta: '\x1b[35m',
  negrita: '\x1b[1m', fin: '\x1b[0m',
};
const log = (...m) => console.log(`${C.cian}[lanzador]${C.fin}`, ...m);
const aviso = (...m) => console.log(`${C.amarillo}[lanzador]${C.fin}`, ...m);
const error = (...m) => console.error(`${C.rojo}[lanzador]${C.fin}`, ...m);

// ----------------------------------------------------------------------------
//  1. ¿Está libre el puerto UDP de descubrimiento?
//
//  Problema real en Windows: hay servicios del sistema que ya tienen atado el
//  5001 (aquí lo tiene 'nidmsrv'). El servidor arranca igual, pero se queda
//  INVISIBLE para la búsqueda automática de partidas y nadie entiende por qué,
//  porque el juego funciona si escribes la IP a mano.
//
//  Se comprueba con dos ataduras seguidas y ambas tienen que salir bien:
//    · sin reuseAddr → detecta que OTRO proceso ya está en ese puerto
//      (en Windows reuseAddr deja compartirlo, y entonces los datagramas se
//       los puede quedar el otro: el servidor parecería anunciarse y no).
//    · con reuseAddr → es exactamente como lo ata descubrimiento.js.
// ----------------------------------------------------------------------------
function atarUdp(puerto, reuseAddr) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr });
    let hecho = false;
    sock.once('error', (e) => {
      if (hecho) return;
      hecho = true;
      try { sock.close(); } catch {}
      resolve(e.code || e.message);
    });
    try {
      sock.bind(puerto, () => {
        if (hecho) return;
        hecho = true;
        sock.close(() => resolve(null)); // null = libre
      });
    } catch (e) {
      hecho = true;
      resolve(e.code || e.message);
    }
  });
}

// Devuelve null si el puerto está libre, o el código del fallo si no.
async function motivoOcupado(puerto) {
  return (await atarUdp(puerto, false)) ?? (await atarUdp(puerto, true));
}

// Prueba si un puerto TCP está libre.
function probarPuertoTcp(puerto) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => { s.close(() => resolve(true)); });
    try { s.listen(puerto, '0.0.0.0'); } catch { resolve(false); }
  });
}

// Elige el puerto TCP pedido, o busca automáticamente el siguiente libre si está ocupado.
async function elegirPuertoTcp(pedido) {
  if (await probarPuertoTcp(pedido)) return pedido;
  for (let p = 5002; p <= 5050; p++) {
    if (await probarPuertoTcp(p)) return p;
  }
  return pedido;
}

// Prueba el puerto pedido y, si no, salta de 100 en 100: 5101, 5201...
async function elegirPuertoUdp(pedido) {
  let motivoOriginal = null;
  for (let i = 0; i < 12; i++) {
    const puerto = pedido + i * 100;
    if (puerto > 65535) break;
    const fallo = await motivoOcupado(puerto);
    if (!fallo) return { puerto, cambiado: i > 0, motivo: motivoOriginal };
    if (i === 0) motivoOriginal = fallo;
  }
  return { puerto: pedido, cambiado: false, motivo: motivoOriginal, sinAlternativa: true };
}

// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
//  2. Servidor HTTP estático de la raíz del proyecto (sin dependencias)
// ----------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

const servidorWeb = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('405 Método no permitido');
  }

  let ruta;
  try {
    ruta = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('400 URL mal formada');
  }
  if (ruta === '/') ruta = MODO.pagina;

  // path.resolve normaliza los '..': si el resultado se sale de la raíz, fuera.
  let archivo = path.resolve(ROOT, '.' + ruta);
  if (archivo !== ROOT && !archivo.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('403 Fuera del proyecto');
  }

  // Un directorio sirve su index (la v1 usa index-3d.html); sin extensión, .html.
  try {
    if (fs.existsSync(archivo) && fs.statSync(archivo).isDirectory()) {
      const cand = ['index.html', 'index-3d.html']
        .map((n) => path.join(archivo, n))
        .find((p) => fs.existsSync(p));
      if (cand) archivo = cand;
    } else if (!path.extname(archivo) && fs.existsSync(archivo + '.html')) {
      archivo += '.html';
    }
  } catch {}

  fs.readFile(archivo, (err, datos) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('404 Archivo no encontrado: ' + ruta);
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(archivo).toLowerCase()] || 'application/octet-stream',
      // Sin esto el navegador cachea el .js viejo y parece que los cambios no entran.
      'cache-control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : datos);
  });
});

function escucharWeb() {
  return new Promise((resolve, reject) => {
    servidorWeb.once('error', reject);
    servidorWeb.listen(PUERTO_WEB, () => resolve());
  });
}

// ----------------------------------------------------------------------------
//  3. Procesos hijos, con su salida etiquetada
// ----------------------------------------------------------------------------
const hijos = [];
let cerrando = false;

function tuberia(flujo, etiqueta, color, aError = false) {
  let resto = '';
  flujo.setEncoding('utf8');
  flujo.on('data', (trozo) => {
    const lineas = (resto + trozo).split(/\r?\n/);
    resto = lineas.pop(); // la última puede estar a medias
    for (const l of lineas) {
      const salida = `${color}[${etiqueta}]${C.fin} ${l}`;
      if (aError) console.error(salida); else console.log(salida);
    }
  });
  flujo.on('end', () => { if (resto) console.log(`${color}[${etiqueta}]${C.fin} ${resto}`); });
}

function lanzar(etiqueta, color, script, argumentos) {
  // process.execPath = el mismo node que corre esto (no depende del PATH).
  const proc = spawn(process.execPath, [script, ...argumentos], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  tuberia(proc.stdout, etiqueta, color);
  tuberia(proc.stderr, etiqueta, color, true);

  proc.on('error', (e) => error(`no se pudo arrancar ${script}: ${e.message}`));
  proc.on('exit', (code, sig) => {
    if (cerrando) return;
    aviso(`${etiqueta} terminó (${sig ? 'señal ' + sig : 'código ' + code}).`);
  });

  hijos.push({ etiqueta, proc });
  return proc;
}

// ----------------------------------------------------------------------------
//  4. IPs locales — es lo que hay que darle a los compañeros
// ----------------------------------------------------------------------------
// Radmin VPN reparte direcciones 26.x.x.x; es la que sirve entre máquinas que
// no comparten LAN física, así que se marca aparte.
const esRadmin = (ip) => ip.startsWith('26.');

function ipsLocales() {
  const lista = [];
  for (const [nombre, direcciones] of Object.entries(os.networkInterfaces())) {
    for (const d of direcciones || []) {
      if (d.family !== 'IPv4' && d.family !== 4) continue;
      if (d.internal) continue;
      lista.push({ nombre, ip: d.address, radmin: esRadmin(d.address) });
    }
  }
  // Radmin primero: es la que se va a copiar el 90% de las veces.
  return lista.sort((a, b) => Number(b.radmin) - Number(a.radmin));
}

// ----------------------------------------------------------------------------
//  4b. Aviso de cortafuegos — SOLO LECTURA, nunca toca la configuración.
//
//  Por qué existe: se diagnosticó que el anuncio y el sondeo llegan bien a la
//  IP de cada compañero (se comprobó a nivel de socket, sin error, con ruta
//  correcta por el adaptador de Radmin), pero ninguno responde. La explicación
//  más probable en Windows es el cortafuegos: Radmin VPN se clasifica como red
//  "Pública", y ahí Windows bloquea por defecto las conexiones ENTRANTES salvo
//  que exista una regla explícita para el programa — exactamente la regla que
//  esta misma máquina ya tenía creada (se comprobó con Get-NetFirewallRule) y
//  que un compañero con una instalación de Node más nueva puede no tener.
//
//  Esto se limita a AVISAR con el comando exacto para que el propio usuario
//  (o el compañero) lo corra si quiere: crear una regla de cortafuegos es un
//  cambio de seguridad del sistema, y eso lo tiene que decidir y ejecutar la
//  persona dueña de esa máquina, nunca este script por su cuenta.
// ----------------------------------------------------------------------------
function avisarFirewallWindows() {
  if (process.platform !== 'win32') return;
  try {
    const ps = spawn('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      "(Get-NetFirewallRule -Direction Inbound -Enabled True -Action Allow -ErrorAction SilentlyContinue | " +
      "Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue | " +
      "Where-Object { $_.Program -match 'node\\.exe$' } | Measure-Object).Count",
    ], { stdio: ['ignore', 'pipe', 'ignore'] });
    let salida = '';
    ps.stdout.on('data', (d) => { salida += d; });
    ps.on('error', () => {}); // sin PowerShell disponible: no se avisa nada, no es motivo de fallo
    ps.on('close', () => {
      const reglas = Number(String(salida).trim()) || 0;
      if (reglas > 0) return; // hay alguna regla; no se puede saber si es exactamente la correcta, pero no hay nada honesto que avisar de más
      aviso('⚠ no encuentro ninguna regla de cortafuegos que permita conexiones entrantes a Node.js.');
      aviso('  Si tus compañeros no te encuentran (ni por difusión ni por sondeo directo), suele ser esto:');
      aviso('  Windows bloquea por defecto lo entrante en redes "Públicas", y así clasifica a Radmin VPN.');
      aviso('  Este script NUNCA va a tocar tu cortafuegos por su cuenta. Si quieres arreglarlo, corre esto');
      aviso('  en PowerShell COMO ADMINISTRADOR una sola vez (y que tus compañeros hagan lo mismo):');
      aviso(`    New-NetFirewallRule -DisplayName "BladeFront (Node.js TCP)" -Direction Inbound -Program "${process.execPath}" -Protocol TCP -Action Allow -Profile Any`);
      aviso(`    New-NetFirewallRule -DisplayName "BladeFront (Node.js UDP)" -Direction Inbound -Program "${process.execPath}" -Protocol UDP -Action Allow -Profile Any`);
    });
  } catch {} // best-effort: cualquier fallo aquí no puede impedir que el juego arranque
}

// ----------------------------------------------------------------------------
//  5. Resumen
// ----------------------------------------------------------------------------
function resumen(udp) {
  const ANCHO = 74;
  const linea = (c = '─') => C.gris + c.repeat(ANCHO) + C.fin;
  const fila = (k, v) => console.log('  ' + C.gris + (k + ' ').padEnd(22, '·') + C.fin + ' ' + v);

  console.log('');
  console.log(linea('═'));
  console.log(`  ${C.negrita}⚔  BLADEFRONT — CAPTURA LA BANDERA${C.fin}   ${C.gris}${MODO.etiqueta}${C.fin}`);
  console.log(linea('═'));
  fila('Juego (navegador)', `${C.verde}${URL_JUEGO}${C.fin}`);
  fila('Servidor TCP', `puerto ${PUERTO_TCP}`);
  if (MODO.descubrimiento) {
    fila(
      'Descubrimiento UDP',
      udp.cambiado
        ? `puerto ${C.amarillo}${udp.puerto}${C.fin} ${C.gris}(el ${PUERTO_UDP_PEDIDO} estaba ocupado)${C.fin}`
        : `puerto ${udp.puerto}`
    );
  } else {
    fila('Descubrimiento UDP', `${C.gris}no aplica en la v1 (se escribe la IP a mano)${C.fin}`);
  }
  fila('Bridge WebSocket', `ws://localhost:${PUERTO_BRIDGE}`);
  if (MODO.descubrimiento) fila('Nombre anunciado', `"${NOMBRE}"`);

  console.log(linea());
  console.log(`  ${C.negrita}IPs de esta máquina${C.fin} ${C.gris}— pásale una de estas a tus compañeros:${C.fin}`);
  const ips = ipsLocales();
  if (ips.length === 0) {
    console.log(`    ${C.amarillo}(ninguna IPv4 externa: solo se puede jugar en esta máquina)${C.fin}`);
  } else {
    const ancho = Math.max(...ips.map((i) => i.ip.length));
    for (const i of ips) {
      const marca = i.radmin
        ? `${C.verde}◄ Radmin VPN — usa esta con tus compañeros${C.fin}`
        : `${C.gris}(${i.nombre})${C.fin}`;
      const ip = i.radmin ? `${C.negrita}${i.ip.padEnd(ancho)}${C.fin}` : i.ip.padEnd(ancho);
      console.log(`    ${ip}  ${marca}`);
    }
    if (!ips.some((i) => i.radmin)) {
      console.log(`    ${C.gris}(no se ve ninguna 26.x.x.x: ¿está Radmin VPN encendido?)${C.fin}`);
    }
  }
  console.log(linea());
  console.log(`  ${C.gris}Ctrl+C para cerrar el servidor, el bridge y la web.${C.fin}`);
  console.log(linea('═'));
  console.log('');
}

// ----------------------------------------------------------------------------
//  6. Cierre limpio
// ----------------------------------------------------------------------------
function cerrarTodo(codigo = 0) {
  if (cerrando) return;
  cerrando = true;
  log('cerrando servicios…');
  for (const { etiqueta, proc } of hijos) {
    if (proc.exitCode === null && !proc.killed) {
      try { proc.kill('SIGTERM'); } catch (e) { error(`no pude cerrar ${etiqueta}: ${e.message}`); }
    }
  }
  try { servidorWeb.close(); } catch {}
  // Margen para que los hijos cierren sus puertos; si no, salimos igual.
  const t = setTimeout(() => {
    for (const { proc } of hijos) { try { proc.kill('SIGKILL'); } catch {} }
    process.exit(codigo);
  }, 1500);
  t.unref();
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => cerrarTodo(0));

// ----------------------------------------------------------------------------
//  Arranque
// ----------------------------------------------------------------------------
let udp = { puerto: PUERTO_UDP_PEDIDO, cambiado: false, motivo: null };
const puertoTcpFinal = await elegirPuertoTcp(PUERTO_TCP);

try {
  await escucharWeb();
} catch (e) {
  error(
    e.code === 'EADDRINUSE'
      ? `el puerto ${PUERTO_WEB} ya está en uso: ¿tienes otro lanzador abierto? Ciérralo y vuelve a intentarlo.`
      : `no pude abrir el servidor web: ${e.message}`
  );
  process.exit(1);
}
log(`web sirviendo la raíz del proyecto en http://localhost:${PUERTO_WEB}`);
// En paralelo, no bloquea el arranque: solo lee, tarda menos de un segundo y
// el aviso puede llegar un poco después del cuadro de resumen.
avisarFirewallWindows();

if (V1) {
  // SIN --auto a propósito: con él la cuenta atrás arranca en cuanto entra el
  // primer jugador, y a partir de ahí el servidor rechaza a todos los demás con
  // GAME_ALREADY_STARTED. El anfitrión acababa jugando solo. Ahora la partida
  // espera y es él quien la empieza desde el navegador.
  lanzar('servidor', C.verde, MODO.servidor, ['--port', String(puertoTcpFinal)]);
  lanzar('bridge', C.magenta, MODO.bridge, [
    '--ws', String(PUERTO_BRIDGE),
    '--tcp-host', '127.0.0.1',
    '--tcp-port', String(puertoTcpFinal),
  ]);
} else {
  // SIN --auto a propósito: con él la cuenta atrás arranca en cuanto entra el
  // primer jugador, y desde ese momento el servidor rechaza a todos los demás
  // con GAME_ALREADY_STARTED. El anfitrión acababa jugando solo y nadie podía
  // unirse. Ahora la partida espera en el lobby y la empieza él desde el
  // navegador, cuando ya están todos dentro.
  lanzar('servidor', C.verde, MODO.servidor, [
    '--port', String(puertoTcpFinal),
    '--discovery-port', String(udp.puerto),
    '--name', NOMBRE,
  ]);
  // El bridge tiene que usar EL MISMO puerto de descubrimiento que el servidor:
  // es el que consulta la página para listar partidas.
  lanzar('bridge', C.magenta, MODO.bridge, [
    '--ws', String(PUERTO_BRIDGE),
    '--tcp-host', '127.0.0.1',
    '--tcp-port', String(puertoTcpFinal),
    '--discovery-port', String(udp.puerto),
  ]);
}

// Un respiro para que los hijos impriman sus líneas de arranque antes del cuadro.
setTimeout(() => {
  resumen(udp);
  if (SIN_NAVEGADOR) {
    log(`--sin-navegador: abre tú ${URL_JUEGO}`);
    return;
  }
  const cmd =
    process.platform === 'win32' ? `start "" "${URL_JUEGO}"` :
    process.platform === 'darwin' ? `open "${URL_JUEGO}"` :
    `xdg-open "${URL_JUEGO}"`;
  exec(cmd, (e) => { if (e) aviso(`no pude abrir el navegador solo; entra a mano en ${URL_JUEGO}`); });
}, 900);
