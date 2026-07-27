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
//
//  POR QUÉ HAY UNA TERCERA VÍA (difundirPorInterfaces):
//  un socket UDP sin atar sale por la interfaz que decida la tabla de rutas —
//  aquí la Wi-Fi — así que el DISCOVER_REQUEST a 255.255.255.255 nunca entraba
//  en la VPN. La solución es atar un socket a la dirección de CADA interfaz y
//  mandar a la difusión DIRIGIDA de esa interfaz (`ip | ~mascara`). Para el
//  adaptador de Radmin, con máscara 255.0.0.0, eso da 26.255.255.255: la
//  difusión de la red virtual entera, que alcanza a todos los compañeros sin
//  escanear ni una dirección. Es la vía que debe resolver el caso real, porque
//  los compañeros están repartidos por todo el 26.0.0.0/8 y no por un /24.
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

// Aritmética de direcciones. Viven aquí arriba porque las usan tanto el cálculo
// de la difusión dirigida (lado cliente) como la derivación de subredes.
const aNumero = (ip) => ip.split('.').reduce((n, o) => n * 256 + Number(o), 0) >>> 0;
const aTexto = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');

// --- lado servidor: responde a quien pregunte -------------------------------
// `describir()` lo provee el servidor de juego y devuelve los datos frescos
// (estado y jugadores conectados cambian a cada rato).
export function publicarServidor({
  puerto = PARAMS_DEFECTO.discoveryPort,
  describir,
  log = () => {},
  alFallar = (msg) => console.error(msg),
}) {
  const sockets = [];
  let atado = false;

  const crearRespondedor = (ip = undefined) => {
    const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    s.on('message', (datos, origen) => {
      let esJson = false;
      let reqVersion = "2.0";
      let msg = null;

      // 1. Decodificar JSON / Texto (para clientes Java/C#/Python de los compañeros)
      try {
        const texto = new TextDecoder('utf-8').decode(datos).trim();
        if (texto.includes('DISCOVER_REQUEST') || texto.includes('DISCOVER') || texto.startsWith('{')) {
          if (texto.startsWith('{')) {
            const obj = JSON.parse(texto);
            if (obj.protocolVersion) reqVersion = String(obj.protocolVersion);
          }
          esJson = true;
          msg = { type: TIPOS.DISCOVER_REQUEST, ver: VERSION };
        }
      } catch {}

      // 2. Decodificar Binario v3 si no fue JSON
      if (!msg) {
        try {
          msg = decodificar(datos);
        } catch {
          return;
        }
      }

      if (msg.type !== TIPOS.DISCOVER_REQUEST) return;

      const info = describir();

      // Enviar respuestas a origen.port, a 5001 y a 5000 en todos los formatos
      const enviarEnTodosFormatos = (targetHost, targetPort) => {
        try {
          const respBinaria = codificar(TIPOS.DISCOVER_RESPONSE, info);
          s.send(respBinaria, targetPort, targetHost, () => {});
        } catch {}

        try {
          const jsonObj = {
            type: "DISCOVER_RESPONSE",
            protocolVersion: reqVersion,
            gameId: typeof info.gameId === 'string' ? info.gameId : `GAME-${String(info.gameId || 1).padStart(3, '0')}`,
            serverName: info.serverName || "BladeFront",
            name: info.serverName || "BladeFront",
            tcpPort: Number(info.tcpPort) || 5000,
            port: Number(info.tcpPort) || 5000,
            state: (info.state === 1 || info.state === 'WAITING') ? "WAITING" : "RUNNING",
            status: (info.state === 1 || info.state === 'WAITING') ? "WAITING" : "RUNNING",
            playerCount: Number(info.playerCount) || 0,
            players: Number(info.playerCount) || 0,
            maximumPlayers: Number(info.maximumPlayers) || 100,
            maxPlayers: Number(info.maximumPlayers) || 100,
          };
          const respJson = new TextEncoder().encode(JSON.stringify(jsonObj) + "\n");
          s.send(respJson, targetPort, targetHost, () => {});
        } catch {}

        if (reqVersion !== "3.0") {
          try {
            const jsonObj3 = {
              type: "DISCOVER_RESPONSE",
              protocolVersion: "3.0",
              gameId: typeof info.gameId === 'string' ? info.gameId : `GAME-${String(info.gameId || 1).padStart(3, '0')}`,
              serverName: info.serverName || "BladeFront",
              name: info.serverName || "BladeFront",
              tcpPort: Number(info.tcpPort) || 5000,
              port: Number(info.tcpPort) || 5000,
              state: (info.state === 1 || info.state === 'WAITING') ? "WAITING" : "RUNNING",
              status: (info.state === 1 || info.state === 'WAITING') ? "WAITING" : "RUNNING",
              playerCount: Number(info.playerCount) || 0,
              players: Number(info.playerCount) || 0,
              maximumPlayers: Number(info.maximumPlayers) || 100,
              maxPlayers: Number(info.maximumPlayers) || 100,
            };
            const respJson3 = new TextEncoder().encode(JSON.stringify(jsonObj3) + "\n");
            s.send(respJson3, targetPort, targetHost, () => {});
          } catch {}
        }
      };

      enviarEnTodosFormatos(origen.address, origen.port);
      if (origen.port !== 5001) enviarEnTodosFormatos(origen.address, 5001);
      if (origen.port !== 5000) enviarEnTodosFormatos(origen.address, 5000);

      log(`descubrimiento UDP ← ${origen.address}:${origen.port} (${esJson ? 'JSON v' + reqVersion : 'Binario'})`);
    });
    return s;
  };

  const intentarAtarEspecificas = () => {
    let creados = 0;
    for (const it of interfacesLocales()) {
      if (it.interna) continue;
      try {
        const s = crearRespondedor(it.address);
        s.on('error', (err) => log(`error en socket especifico ${it.address}:${puerto}:`, err.message));
        s.bind(puerto, it.address, () => {
          try { s.setBroadcast(true); } catch {}
          atado = true;
          log(`descubrimiento UDP escuchando en ${it.address}:${puerto}`);
        });
        sockets.push(s);
        creados++;
      } catch (err) {
        log(`no se pudo atar ${it.address}:${puerto}:`, err.message);
      }
    }
    return creados > 0;
  };

  const principal = crearRespondedor();
  principal.on('error', (e) => {
    if (e.code === 'EADDRINUSE' || e.code === 'EACCES') {
      log(`puerto global ${puerto} ocupado (${e.code}), intentando atar por IP especifica...`);
      intentarAtarEspecificas();
    } else if (!atado) {
      alFallar(`⚠ Descubrimiento UDP caído (${e.code || e.message}): este servidor no se anunciará.`);
    }
  });

  principal.bind(puerto, () => {
    try { principal.setBroadcast(true); } catch {}
    atado = true;
    sockets.push(principal);
    log(`descubrimiento UDP activo escuchando en 0.0.0.0:${puerto}`);
  });

  // Intentar escuchar en UDP 5000 además de UDP 5001 por si clientes buscan en UDP 5000
  try {
    const secundario5000 = crearRespondedor();
    secundario5000.on('error', () => {});
    secundario5000.bind(5000, () => {
      try { secundario5000.setBroadcast(true); } catch {}
      sockets.push(secundario5000);
      log(`descubrimiento UDP secundario escuchando en 0.0.0.0:5000`);
    });
  } catch {}

  const anunciarActivamente = () => {
    try {
      const info = describir();
      const respBinaria = codificar(TIPOS.DISCOVER_RESPONSE, info);

      const jsonObj2 = {
        type: "DISCOVER_RESPONSE",
        protocolVersion: "2.0",
        gameId: typeof info.gameId === 'string' ? info.gameId : `GAME-${String(info.gameId || 1).padStart(3, '0')}`,
        serverName: info.serverName || "BladeFront",
        name: info.serverName || "BladeFront",
        tcpPort: Number(info.tcpPort) || 5000,
        port: Number(info.tcpPort) || 5000,
        state: (info.state === 1 || info.state === 'WAITING') ? "WAITING" : "RUNNING",
        status: (info.state === 1 || info.state === 'WAITING') ? "WAITING" : "RUNNING",
        playerCount: Number(info.playerCount) || 0,
        players: Number(info.playerCount) || 0,
        maximumPlayers: Number(info.maximumPlayers) || 100,
        maxPlayers: Number(info.maximumPlayers) || 100,
      };
      const respJson2 = new TextEncoder().encode(JSON.stringify(jsonObj2) + "\n");

      const jsonObj3 = {
        type: "DISCOVER_RESPONSE",
        protocolVersion: "3.0",
        gameId: typeof info.gameId === 'string' ? info.gameId : `GAME-${String(info.gameId || 1).padStart(3, '0')}`,
        serverName: info.serverName || "BladeFront",
        name: info.serverName || "BladeFront",
        tcpPort: Number(info.tcpPort) || 5000,
        port: Number(info.tcpPort) || 5000,
        state: (info.state === 1 || info.state === 'WAITING') ? "WAITING" : "RUNNING",
        status: (info.state === 1 || info.state === 'WAITING') ? "WAITING" : "RUNNING",
        playerCount: Number(info.playerCount) || 0,
        players: Number(info.playerCount) || 0,
        maximumPlayers: Number(info.maximumPlayers) || 100,
        maxPlayers: Number(info.maximumPlayers) || 100,
      };
      const respJson3 = new TextEncoder().encode(JSON.stringify(jsonObj3) + "\n");

      for (const s of sockets) {
        try {
          s.send(respBinaria, puerto, '255.255.255.255', () => {});
          s.send(respBinaria, puerto, '26.255.255.255', () => {});
          s.send(respJson2, puerto, '255.255.255.255', () => {});
          s.send(respJson2, puerto, '26.255.255.255', () => {});
          s.send(respJson3, puerto, '255.255.255.255', () => {});
          s.send(respJson3, puerto, '26.255.255.255', () => {});

          s.send(respBinaria, 5000, '255.255.255.255', () => {});
          s.send(respBinaria, 5000, '26.255.255.255', () => {});
          s.send(respJson2, 5000, '255.255.255.255', () => {});
          s.send(respJson2, 5000, '26.255.255.255', () => {});
          s.send(respJson3, 5000, '255.255.255.255', () => {});
          s.send(respJson3, 5000, '26.255.255.255', () => {});
        } catch {}
      }
    } catch {}
  };

  const timerAnuncio = setInterval(anunciarActivamente, 1000);

  return {
    cerrar() {
      clearInterval(timerAnuncio);
      for (const s of sockets) {
        try { s.close(); } catch {}
      }
    },
  };

  try {
    principal.bind(puerto, () => {
      atado = true;
      try { principal.setBroadcast(true); } catch {}
      log(`descubrimiento UDP escuchando en el puerto ${puerto}`);
      anunciarActivamente();
    });
    sockets.push(principal);
  } catch {
    intentarAtarEspecificas();
  }

  const rAnuncio = setInterval(anunciarActivamente, 3000);

  return {
    cerrar: () => {
      clearInterval(rAnuncio);
      for (const s of sockets) {
        try { s.close(); } catch {}
      }
    },
    anunciar: anunciarActivamente,
    get atado() { return atado; }
  };
}

// --- lado cliente -----------------------------------------------------------

// Traduce un DISCOVER_RESPONSE a la entrada que consume la interfaz. Lo usan
// las dos vías de búsqueda, así que el JSON sale idéntico venga de donde venga
// (salvo `via`, que es justo lo que las distingue).
// `extra` añade el detalle de POR DÓNDE llegó (interfaz y difusión usadas) sin
// tocar `via`, que la interfaz ya interpreta como 'broadcast' | 'directo'.
const entradaHallada = (origen, msg, via, extra = null) => ({
  host: origen.address,          // §27: la IP sale del datagrama
  tcpPort: msg.tcpPort,
  gameId: msg.gameId,
  serverName: msg.serverName,
  state: msg.state,
  playerCount: msg.playerCount,
  maximumPlayers: msg.maximumPlayers,
  via,                           // 'broadcast' | 'directo' — la UI lo muestra
  ...(extra || {}),
});

// La clave de identidad de un servidor. Dos respuestas con el mismo host y
// puerto TCP son la misma partida aunque hayan llegado por vías distintas.
export const claveServidor = (s) => `${s.host}:${s.tcpPort}`;

// Pregunta a UNA dirección de difusión concreta y junta las respuestas.
// Devuelve una promesa con los servidores hallados tras `esperaMs`. Cada
// entrada trae la IP tomada del origen del datagrama, no del contenido.
//
// Sin `direccion` explícita sale por la interfaz que elija la tabla de rutas,
// que es justo el problema que resuelve difundirPorInterfaces. Se conserva para
// cuando se sabe a qué dirección hay que preguntar (`?direccion=` del bridge y
// las pruebas, que apuntan a 127.0.0.1 para no depender de la LAN de nadie).
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

// --- difusión DIRIGIDA POR INTERFAZ ------------------------------------------
//
//  La vía principal. Ver la cabecera del archivo: un socket sin atar sale por
//  la interfaz por defecto y jamás entra en la VPN, así que aquí se ata UNO POR
//  INTERFAZ y cada uno difunde por la suya.

// Dirección de difusión dirigida de una interfaz: `ip | ~mascara`.
// 26.11.206.94 con 255.0.0.0 → 26.255.255.255 (la red virtual de Radmin entera).
export function direccionDeDifusion(ip, mascara) {
  if (!net.isIPv4(ip)) throw new TypeError(`IPv4 inválida: ${ip}`);
  if (!net.isIPv4(mascara)) throw new TypeError(`máscara IPv4 inválida: ${mascara}`);
  return aTexto(((aNumero(ip) | (~aNumero(mascara) >>> 0)) >>> 0));
}

// Las interfaces por las que tiene sentido difundir, ya con su difusión
// calculada. El loopback se deja fuera salvo que se pida: difundir por ahí solo
// encuentra servidores de la propia máquina (útil en las pruebas, ruido en uso
// real). Una /32 tampoco sirve: su "difusión" es ella misma.
export function difusionesLocales({ incluirInternas = false } = {}) {
  const salida = [];
  for (const it of interfacesLocales()) {
    if (it.interna && !incluirInternas) continue;
    if (!it.netmask || it.netmask === '255.255.255.255') continue;
    let difusion;
    try {
      difusion = direccionDeDifusion(it.address, it.netmask);
    } catch {
      continue; // interfaz con datos raros: no vale la pena tumbar el resto
    }
    salida.push({
      nombre: it.nombre, local: it.address, mascara: it.netmask,
      difusion, interna: it.interna, radmin: it.radmin,
    });
  }
  return salida;
}

// Un servidor alojado en ESTA máquina contesta por todas sus interfaces a la
// vez, y como la IP sale del origen del datagrama (§27) aparece una vez por
// interfaz: 127.0.0.1, 26.11.206.94, 192.168.1.20… son la misma partida. Solo se
// colapsan las direcciones PROPIAS, nunca las de dos máquinas distintas, y se
// conserva la que sirve a los demás — la de Radmin, que es por donde entra el
// grupo — porque es la que el jugador tendrá que compartir.
export function colapsarPropias(servidores, locales = null) {
  const mias = new Set(locales || interfacesLocales().map((i) => i.address));
  const salida = [];
  const propias = new Map(); // puerto TCP -> entrada elegida
  for (const s of servidores) {
    if (!mias.has(s.host)) { salida.push(s); continue; }
    const previa = propias.get(s.tcpPort);
    // Radmin gana; entre iguales gana la primera, que ya trae su `via`.
    if (!previa || (!esRangoRadmin(previa.host) && esRangoRadmin(s.host))) {
      propias.set(s.tcpPort, s);
    }
  }
  return [...salida, ...propias.values()];
}

// Difunde el DISCOVER_REQUEST por CADA interfaz y junta lo que conteste.
//
// Devuelve { servidores, difusiones, avisos }: no basta con la lista de
// servidores, la interfaz tiene que poder decir POR DÓNDE se miró de verdad
// para que el usuario distinga "no hay nadie" de "no miré ahí".
//
// Todas las interfaces se preguntan A LA VEZ y cada una con su propio socket y
// su propio catch: que la Wi-Fi no admita difusión, o que una VMware haya
// desaparecido entre el listado y el bind (EADDRNOTAVAIL), no puede impedir que
// la de Radmin — la única que importa aquí — haga su trabajo. La espera total
// es la de UNA interfaz, no la suma.
export function difundirPorInterfaces({
  puerto = PARAMS_DEFECTO.discoveryPort,
  esperaMs = 1000,
  incluirInternas = false,
  interfaces = null,   // inyectable: las pruebas necesitan fijar cuáles se usan
  log = () => {},
} = {}) {
  const objetivos = interfaces || difusionesLocales({ incluirInternas });
  const hallados = new Map();
  const avisos = [];
  const difusiones = [];

  const porInterfaz = (it) => new Promise((resolve) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    // Además de la dirigida se prueba la difusión limitada: algunos drivers de
    // adaptador virtual descartan la dirigida pero sí cursan 255.255.255.255
    // cuando el socket ya está atado a la interfaz. Los duplicados los absorbe
    // el Map, así que probar las dos solo puede sumar.
    const destinos = [it.difusion, '255.255.255.255'];
    const registro = { ...it, destinos, ok: false };
    difusiones.push(registro);

    let terminado = false;
    const acabar = (error) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(reloj);
      try { sock.close(); } catch {}
      if (error) {
        registro.error = error;
        avisos.push(`difusión por ${it.nombre} (${it.local} → ${it.difusion}): ${error}`);
        log(`difusión por ${it.nombre} falló: ${error}`);
      }
      resolve();
    };

    sock.on('message', (datos, origen) => {
      let msg;
      try {
        msg = decodificar(datos);
      } catch {
        return;
      }
      if (msg.type !== TIPOS.DISCOVER_RESPONSE || msg.ver !== VERSION) return;
      const e = entradaHallada(origen, msg, 'broadcast', {
        interfaz: it.nombre, difusion: it.difusion,
      });
      // Primera vía que lo vio, gana: así `interfaz`/`difusion` señalan por
      // dónde llegó realmente y no por dónde llegó la última copia.
      if (!hallados.has(claveServidor(e))) hallados.set(claveServidor(e), e);
    });

    // Nunca se rechaza: el fallo de una interfaz es un aviso, no el fin de la
    // búsqueda. EADDRNOTAVAIL (la dirección ya no existe) y EACCES (sin permiso
    // de difusión) son los dos casos reales y se tratan igual.
    sock.on('error', (e) => acabar(e.code || e.message));

    let reloj = null;
    try {
      sock.bind(0, it.local, () => {
        try {
          sock.setBroadcast(true);
        } catch (e) {
          return acabar(e.code || e.message);
        }
        const req = codificar(TIPOS.DISCOVER_REQUEST, {});
        let enviados = 0, ultimoError = null;
        for (const destino of destinos) {
          sock.send(req, puerto, destino, (err) => {
            if (err) ultimoError = err.code || err.message;
            else enviados++;
          });
        }
        reloj = setTimeout(() => {
          registro.ok = enviados > 0;
          acabar(enviados > 0 ? null : (ultimoError || 'ningún envío salió'));
        }, esperaMs);
      });
    } catch (e) {
      acabar(e.code || e.message);
    }
  });

  if (objetivos.length === 0) {
    return Promise.resolve({
      servidores: [], difusiones: [],
      avisos: ['no hay ninguna interfaz IPv4 por la que difundir'],
    });
  }

  return Promise.all(objetivos.map(porInterfaz))
    .then(() => ({ servidores: colapsarPropias([...hallados.values()]), difusiones, avisos }));
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
// letra, "su subred" son 16 millones de direcciones, así que se estrecha a un
// /24 antes de derivar candidatas. OR de dos máscaras contiguas = la más
// estrecha de las dos.
export const MASCARA_MINIMA_ESCANEO = '255.255.255.0';
const estrechar = (a, b) => aTexto(((aNumero(a) | aNumero(b)) >>> 0));

// OJO — ESTO YA NO ES UNA VÍA DE BÚSQUEDA AUTOMÁTICA.
// Una captura real de Radmin mostró que los ~20 compañeros del grupo tienen IPs
// repartidas por TODO el 26.0.0.0/8 (26.43.87.248, 26.202.164.209, 26.94.87.242…),
// no dentro del /24 de nadie. Barrer el /24 propio recorre 254 direcciones vacías
// y devuelve solo la máquina local: no encuentra nada Y hace creer que ya se
// buscó en la VPN, que es el peor de los dos mundos. Se conserva como recurso
// EXPLÍCITO (`?escanear=subred`) para el caso raro de un grupo pequeño que sí
// comparte /24; la vía automática es difundirPorInterfaces.
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
