// ============================================================================
//  Descubrimiento de servidores por UDP broadcast (§19, §27).
//
//  Un cliente lanza DISCOVER_REQUEST al broadcast de la red; todo servidor que
//  esté esperando jugadores responde con DISCOVER_RESPONSE directo al emisor.
//
//  Los datagramas UDP van SIN prefijo de longitud (§23): el datagrama ya es el
//  mensaje completo, así que se usa codificar/decodificar y nunca enmarcar().
//
//  La IP del servidor NO viaja en el mensaje: se deduce del origen del
//  datagrama (§27), que es lo que evita anunciar direcciones equivocadas
//  cuando la máquina tiene varias interfaces.
//
//  Además del broadcast hay un SONDEO DIRIGIDO (sondearDirecciones): el mismo
//  DISCOVER_REQUEST, pero mandado uno a uno a una lista de IPs. Existe porque
//  sobre Radmin VPN el broadcast a 255.255.255.255 a menudo no atraviesa el
//  adaptador virtual, y los servidores de los compañeros quedan invisibles
//  aunque respondan perfectamente por TCP. Las dos vías se complementan.
// ============================================================================

import dgram from 'node:dgram';
import net from 'node:net';
import os from 'node:os';
import { TIPOS, VERSION, codificar, decodificar, PARAMS_DEFECTO } from './protocolo-v3.js';

// Tope de IPs por sondeo. Protege dos cosas: el tiempo de la petición y la red
// (nadie debería poder pedir "escanea un /8" y soltar 16 millones de
// datagramas). 512 cubre dos subredes /24 completas, que es el caso real.
export const LIMITE_SONDEO = 512;

// Radmin VPN reparte direcciones del 26.0.0.0/8. Se reconoce por el primer
// octeto porque es lo único estable: el nombre del adaptador cambia de idioma
// según la instalación.
export const esRangoRadmin = (ip) => net.isIPv4(ip) && ip.split('.')[0] === '26';

// --- lado servidor: responde a quien pregunte -------------------------------
// `describir()` lo provee el servidor de juego y devuelve los datos frescos
// (estado y jugadores conectados cambian a cada rato).
export function publicarServidor({
  puerto = PARAMS_DEFECTO.discoveryPort,
  describir,
  log = () => {},
  // Un fallo aquí deja al servidor INVISIBLE para toda la red aunque el juego
  // funcione, así que se avisa siempre, no solo en modo detallado.
  alFallar = (msg) => console.error(msg),
}) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  sock.on('message', (datos, origen) => {
    let msg;
    try {
      msg = decodificar(datos);
    } catch {
      return; // basura en el puerto de descubrimiento: se ignora en silencio
    }
    if (msg.type !== TIPOS.DISCOVER_REQUEST) return;
    if (msg.ver !== VERSION) return; // otra versión del protocolo: no es para nosotros

    const info = describir();
    const respuesta = codificar(TIPOS.DISCOVER_RESPONSE, info);
    sock.send(respuesta, origen.port, origen.address, (err) => {
      if (err) log('error respondiendo descubrimiento:', err.message);
    });
    log(`descubrimiento ← ${origen.address}:${origen.port}`);
  });

  let atado = false;
  sock.on('error', (e) => {
    // EADDRINUSE: lo tiene otro proceso. EACCES: Windows lo reserva para un
    // servicio del sistema. Para quien arranca el servidor es el mismo
    // problema y tiene la misma solución, así que se explica igual.
    if (e.code === 'EADDRINUSE' || e.code === 'EACCES') {
      alFallar(
        `⚠ No se pudo usar el puerto UDP ${puerto} (${e.code}): lo tiene otro ` +
        `proceso o el sistema lo reserva. Este servidor NO aparecerá en la ` +
        `búsqueda automática. Arráncalo con --discovery-port <otro> y que los ` +
        `clientes usen ese mismo, o que se conecten escribiendo la IP a mano.`
      );
    } else {
      alFallar(`⚠ Descubrimiento UDP caído (${e.code || e.message}): este servidor no se anunciará.`);
    }
  });
  sock.bind(puerto, () => {
    atado = true;
    sock.setBroadcast(true);
    log(`descubrimiento UDP escuchando en el puerto ${puerto}`);
  });

  return { cerrar: () => { try { sock.close(); } catch {} }, get atado() { return atado; } };
}

// --- lado cliente -----------------------------------------------------------

// Traduce un DISCOVER_RESPONSE a la entrada que consume la interfaz. Lo usan
// las dos vías de búsqueda, así que el JSON sale idéntico venga de donde venga
// (salvo `via`, que es justo lo que las distingue).
const entradaHallada = (origen, msg, via) => ({
  host: origen.address,          // §27: la IP sale del datagrama
  tcpPort: msg.tcpPort,
  gameId: msg.gameId,
  serverName: msg.serverName,
  state: msg.state,
  playerCount: msg.playerCount,
  maximumPlayers: msg.maximumPlayers,
  via,                           // 'broadcast' | 'directo' — la UI lo muestra
});

// La clave de identidad de un servidor. Dos respuestas con el mismo host y
// puerto TCP son la misma partida aunque hayan llegado por vías distintas.
export const claveServidor = (s) => `${s.host}:${s.tcpPort}`;

// pregunta al broadcast y junta las respuestas.
// Devuelve una promesa con los servidores hallados tras `esperaMs`. Cada
// entrada trae la IP tomada del origen del datagrama, no del contenido.
export function buscarServidores({
  puerto = PARAMS_DEFECTO.discoveryPort,
  direccion = '255.255.255.255',
  esperaMs = 1000,
  via = 'broadcast',
} = {}) {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const hallados = new Map(); // "ip:puertoTcp" -> info

    sock.on('message', (datos, origen) => {
      let msg;
      try {
        msg = decodificar(datos);
      } catch {
        return;
      }
      if (msg.type !== TIPOS.DISCOVER_RESPONSE || msg.ver !== VERSION) return;
      const e = entradaHallada(origen, msg, via);
      hallados.set(claveServidor(e), e);
    });

    sock.on('error', (e) => { try { sock.close(); } catch {} reject(e); });

    sock.bind(() => {
      sock.setBroadcast(true);
      sock.send(codificar(TIPOS.DISCOVER_REQUEST, {}), puerto, direccion, (err) => {
        if (err) { try { sock.close(); } catch {} return reject(err); }
      });
      setTimeout(() => {
        try { sock.close(); } catch {}
        resolve([...hallados.values()]);
      }, esperaMs);
    });
  });
}

// --- sondeo DIRIGIDO a una lista de IPs -------------------------------------
//
//  Mismo DISCOVER_REQUEST, pero unicast a cada candidata. Es el plan B cuando
//  el broadcast no atraviesa el adaptador de Radmin VPN.
//
//  UN solo socket y UN solo temporizador para las N direcciones. Abrir un
//  socket por IP significaría 254 descriptores y 254 esperas: con el socket
//  compartido, los 254 datagramas salen de golpe y la espera es una sola, así
//  que barrer un /24 entero cuesta lo mismo que preguntar a una sola máquina.
export function sondearDirecciones({
  direcciones = [],
  puerto = PARAMS_DEFECTO.discoveryPort,
  esperaMs = 1000,
  limite = LIMITE_SONDEO,
  log = () => {},
} = {}) {
  // Se filtra, deduplica y recorta ANTES de abrir nada: una lista con basura o
  // desmedida no llega siquiera a tocar la red.
  const objetivos = [...new Set(direcciones.filter((d) => net.isIPv4(d)))].slice(0, limite);

  return new Promise((resolve, reject) => {
    if (objetivos.length === 0) return resolve([]);

    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const hallados = new Map();
    let atado = false, terminado = false, reloj = null, fallos = 0;

    const acabar = () => {
      if (terminado) return;
      terminado = true;
      clearTimeout(reloj);
      try { sock.close(); } catch {}
      if (fallos) log(`sondeo: ${fallos}/${objetivos.length} direcciones no admitieron el envío`);
      resolve([...hallados.values()]);
    };

    sock.on('message', (datos, origen) => {
      let msg;
      try {
        msg = decodificar(datos);
      } catch {
        return;
      }
      if (msg.type !== TIPOS.DISCOVER_RESPONSE || msg.ver !== VERSION) return;
      const e = entradaHallada(origen, msg, 'directo');
      hallados.set(claveServidor(e), e);
    });

    sock.on('error', (e) => {
      // Antes de atarse no hay sondeo posible: eso sí es un fallo de verdad.
      if (!atado) {
        terminado = true;
        clearTimeout(reloj);
        try { sock.close(); } catch {}
        return reject(e);
      }
      // Ya atados, un error del socket suele ser el ICMP "puerto inalcanzable"
      // de UNA de las candidatas apagadas. Barrer una subred implica que la
      // mayoría no existan, así que se anota y se sigue: el temporizador
      // resolverá con lo que sí haya respondido.
      fallos++;
      log(`sondeo: error de socket ignorado (${e.code || e.message})`);
    });

    sock.bind(() => {
      atado = true;
      const req = codificar(TIPOS.DISCOVER_REQUEST, {});
      for (const ip of objetivos) {
        sock.send(req, puerto, ip, (err) => { if (err) fallos++; });
      }
      reloj = setTimeout(acabar, esperaMs);
    });
  });
}

// --- de dónde salen las direcciones candidatas ------------------------------

const aNumero = (ip) => ip.split('.').reduce((n, o) => n * 256 + Number(o), 0) >>> 0;
const aTexto = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');

// Todas las direcciones de host de la subred de `ip` con `mascara`, es decir el
// rango sin la de red ni la de difusión: 26.11.206.94/255.255.255.0 da
// 26.11.206.1 … 26.11.206.254. Sondear la de red o la de difusión no aportaría
// nada (ninguna máquina las tiene) y la de difusión repetiría el broadcast que
// ya se hace aparte.
export function direccionesDeSubred(ip, mascara, { maxHosts = LIMITE_SONDEO } = {}) {
  if (!net.isIPv4(ip)) throw new TypeError(`IPv4 inválida: ${ip}`);
  if (!net.isIPv4(mascara)) throw new TypeError(`máscara IPv4 inválida: ${mascara}`);

  const m = aNumero(mascara);
  const red = (aNumero(ip) & m) >>> 0;
  const difusion = (red | (~m >>> 0)) >>> 0;

  // /31 y /32 no dejan hueco entre red y difusión: no hay nada que sondear.
  if (difusion - red < 2) return [];

  const total = difusion - red - 1;
  if (total > maxHosts) {
    throw new RangeError(`la subred ${ip}/${mascara} tiene ${total} direcciones y el tope es ${maxHosts}`);
  }

  const salida = [];
  for (let n = red + 1; n < difusion; n++) salida.push(aTexto(n));
  return salida;
}

// IPv4 locales con su máscara, marcando las que huelen a Radmin VPN.
// `os.networkInterfaces()` mezcla IPv6 y adaptadores apagados; aquí queda solo
// lo que sirve para derivar un rango que sondear.
export function interfacesLocales() {
  const salida = [];
  for (const [nombre, entradas] of Object.entries(os.networkInterfaces())) {
    for (const e of entradas || []) {
      // Node moderno da 'IPv4'; se acepta el 4 numérico de versiones viejas.
      if (e.family !== 'IPv4' && e.family !== 4) continue;
      salida.push({
        nombre,
        address: e.address,
        netmask: e.netmask,
        cidr: e.cidr ?? null,
        interna: !!e.internal,
        radmin: esRangoRadmin(e.address),
      });
    }
  }
  return salida;
}

// El adaptador de Radmin anuncia máscara /8 (255.0.0.0): tomada al pie de la
// letra, "su subred" son 16 millones de direcciones. Como en la práctica todos
// los compañeros caen en el mismo /24, se estrecha la máscara antes de derivar
// candidatas. OR de dos máscaras contiguas = la más estrecha de las dos.
export const MASCARA_MINIMA_ESCANEO = '255.255.255.0';
const estrechar = (a, b) => aTexto(((aNumero(a) | aNumero(b)) >>> 0));

// Candidatas para `?escanear=1`: las subredes de todas las interfaces locales
// que parezcan Radmin. Sin ninguna, devuelve lista vacía y el sondeo no hace
// nada — que es lo correcto en una máquina sin la VPN levantada.
export function direccionesRadminLocales({ limite = LIMITE_SONDEO } = {}) {
  const vistas = new Set();
  for (const it of interfacesLocales()) {
    if (!it.radmin || it.interna) continue;
    const mascara = estrechar(it.netmask || MASCARA_MINIMA_ESCANEO, MASCARA_MINIMA_ESCANEO);
    for (const d of direccionesDeSubred(it.address, mascara, { maxHosts: limite })) {
      vistas.add(d);
      if (vistas.size >= limite) return [...vistas];
    }
  }
  return [...vistas];
}

// --- fusión de vías ---------------------------------------------------------
// Combina listas de hallazgos sin duplicar por host:tcpPort. Gana la primera
// lista en la que aparezca cada servidor: el bridge pasa el broadcast delante,
// así que una partida vista por las dos vías se etiqueta 'broadcast' (es la que
// prueba que la red funciona sin trucos).
export function combinarHallazgos(...listas) {
  const fusion = new Map();
  for (const lista of listas) {
    for (const s of lista || []) {
      const clave = claveServidor(s);
      if (!fusion.has(clave)) fusion.set(clave, s);
    }
  }
  return [...fusion.values()];
}
