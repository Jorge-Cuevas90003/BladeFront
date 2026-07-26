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
import {
  buscarServidores, difundirPorInterfaces, sondearDirecciones,
  direccionesRadminLocales, combinarHallazgos, colapsarPropias, LIMITE_SONDEO,
} from './descubrimiento.js';
import { PARAMS_DEFECTO } from './protocolo-v3.js';
import { vecinosVivos, prefijosRadminLocales, conServidorEscuchando, nombreDeRadmin } from './vecinos.js';

export function crearBridge({
  puertoWs = 8146,
  tcpHost = '127.0.0.1',
  tcpPort = PARAMS_DEFECTO.serverPort,
  puertoUdp = PARAMS_DEFECTO.discoveryPort,
  // Puertos EXTRA en los que preguntar al buscar partidas. Ver la nota larga
  // en la ruta /servidores: preguntar no es lo mismo que anunciarse.
  puertosExtra = [],
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
    //
    //   /servidores                       → difusión dirigida por CADA interfaz
    //   /servidores?ips=26.43.87.248,...  → + sondeo directo de esas IPs
    //   /servidores?escanear=subred       → + barrido del /24 propio (ver abajo)
    //   /servidores?direccion=X           → en vez de la difusión por interfaz,
    //                                       difunde solo a X (pruebas y manual)
    //
    // La vía por defecto es la difusión dirigida POR INTERFAZ, no un broadcast a
    // 255.255.255.255 desde un socket suelto: ese salía por la Wi-Fi y nunca
    // entraba en la VPN. Atando un socket a cada interfaz, la de Radmin difunde
    // a 26.255.255.255 y alcanza a todo el 26.0.0.0/8 de una vez.
    //
    // `escanear=1` (lo que manda la interfaz vieja) YA NO barre el /24: los
    // compañeros están repartidos por todo el /8, así que ese barrido no
    // encontraba a nadie y encima daba a entender que ya se había buscado. Se
    // acepta el parámetro para no romper a nadie, pero solo `escanear=subred`
    // pide el barrido de verdad.
    if (url.pathname === '/servidores') {
      const espera = Math.min(3000, Number(url.searchParams.get('espera')) || 800);
      const avisos = [];

      // EN QUÉ PUERTOS SE PREGUNTA. No es lo mismo que el puerto en el que se
      // anuncia el servidor propio, y confundirlos costó no ver a nadie: si el
      // 5001 local está ocupado, el servidor de esta máquina se mueve al 5101,
      // pero los compañeros siguen escuchando en el 5001 que fija la spec.
      // Preguntando solo en el 5101 se grita donde no hay nadie.
      //
      // Por eso se pregunta SIEMPRE en el estándar, más el propio por si algún
      // compañero tuvo que moverse igual. Cuesta lo mismo: los datagramas salen
      // del mismo socket y la espera es una sola.
      const puertoPedido = Number(url.searchParams.get('puerto'));
      const puertos = puertoPedido
        ? [puertoPedido]
        : [...new Set([PARAMS_DEFECTO.discoveryPort, puertoUdp, ...puertosExtra])];

      // Qué se miró DE VERDAD. Va en la respuesta porque el usuario tiene que
      // poder distinguir "no hay nadie" de "no miré ahí".
      const exploracion = { vias: [], difusiones: [], sondeadas: 0, puertos };

      // Cada vía se resuelve por su cuenta y con su propio catch: que una falle
      // (interfaz caída, broadcast sin permisos) no puede dejar sin respuesta a
      // la otra. Se devuelve lo que sí se encontró y el motivo en `avisos`.
      const aparte = (etiqueta, promesa) => promesa.catch((e) => {
        avisos.push(`${etiqueta}: ${e.message}`);
        log(`descubrimiento — ${etiqueta} falló: ${e.message}`);
        return [];
      });

      try {
        // Una `direccion` explícita significa "pregunta ahí y solo ahí": es el
        // modo manual y el de las pruebas, que apuntan a 127.0.0.1 para no
        // depender de la LAN de quien las corra.
        const dirFija = url.searchParams.get('direccion');
        let porDifusion;
        if (dirFija) {
          exploracion.vias.push('difusion-dirigida-manual');
          exploracion.difusiones.push({ nombre: '(manual)', difusion: dirFija, destinos: [dirFija] });
          // Un puerto por consulta, pero todos en paralelo: la espera es una.
          porDifusion = aparte('broadcast', Promise.all(
            puertos.map((pt) => buscarServidores({ puerto: pt, direccion: dirFija, esperaMs: espera }))
          ).then((listas) => listas.flat()));
        } else {
          exploracion.vias.push('difusion-por-interfaz');
          porDifusion = aparte('difusión por interfaz', Promise.all(
            puertos.map((pt) => difundirPorInterfaces({ puerto: pt, esperaMs: espera, log }))
          ).then((rondas) => {
            const servidores = [];
            // Las difusiones se reportan una vez por interfaz, con los puertos
            // preguntados: repetir la misma interfaz por cada puerto solo haría
            // ruido en la interfaz de usuario.
            const porNombre = new Map();
            for (const r of rondas) {
              servidores.push(...r.servidores);
              avisos.push(...r.avisos);
              for (const d of r.difusiones) {
                const previa = porNombre.get(d.nombre);
                if (previa) { previa.ok = previa.ok && d.ok; if (d.error) previa.error = d.error; }
                else porNombre.set(d.nombre, { ...d, puertos });
              }
            }
            exploracion.difusiones.push(...porNombre.values());
            return servidores;
          }));
        }

        // Las candidatas de ambos parámetros se juntan en UNA sola lista para
        // que el recorte a LIMITE_SONDEO valga por petición, no por parámetro.
        // Las IPs pegadas por el usuario van PRIMERO: son las que él eligió a
        // mano, y si el barrido de subred llenara el cupo antes, se quedarían
        // fuera sin que nadie se lo dijera.
        const candidatas = [];
        let ipsVecinas = [];

        // VECINOS DE LA RED VIRTUAL. Radmin ya sabe quién está conectado, y el
        // sistema operativo se entera solo: cualquier paquete intercambiado deja
        // al otro equipo apuntado en la tabla de vecinos con su dirección
        // física. Los que tienen dirección física de verdad están vivos.
        //
        // Es la vía que mejor funciona sobre la VPN, porque no depende de que
        // el adaptador virtual reenvíe difusiones ni de barrer un /8 imposible:
        // pregunta exactamente a quien el sistema ya vio responder.
        if (url.searchParams.get('vecinos') !== '0') {
          try {
            const vecinos = await vecinosVivos({ prefijos: prefijosRadminLocales() });
            ipsVecinas = vecinos.map((v) => v.ip);
            if (vecinos.length) {
              candidatas.push(...ipsVecinas);
              exploracion.vias.push('vecinos-de-la-vpn');
              exploracion.vecinos = vecinos.length;
            } else {
              exploracion.vecinos = 0;
            }
          } catch (e) {
            avisos.push(`vecinos: ${e.message}`);
          }
        }

        const ips = url.searchParams.get('ips');
        if (ips) {
          // Se acepta lo que salga de pegar una lista de Radmin: comas, saltos
          // de línea, espacios y punto y coma.
          const pegadas = ips.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
          candidatas.push(...pegadas);
          exploracion.vias.push('sondeo-ips');
        }

        const escanear = url.searchParams.get('escanear');
        if (escanear === 'subred') {
          try {
            const auto = direccionesRadminLocales({ limite: LIMITE_SONDEO });
            if (auto.length === 0) avisos.push('no hay ninguna interfaz local en el rango 26.x.x.x (Radmin)');
            candidatas.push(...auto);
            exploracion.vias.push('sondeo-subred-propia');
          } catch (e) {
            avisos.push(`escaneo de subred: ${e.message}`);
          }
        } else if (escanear) {
          // Honestidad: la UI vieja manda escanear=1 y antes eso barría un /24
          // que nunca contuvo a nadie. Se dice que no se hizo, en vez de fingir.
          // Corto a propósito: la interfaz vieja muestra avisos[0] tal cual, y
          // esta rama se da en TODAS sus consultas. El detalle va en `exploracion`.
          avisos.push('se difundió por cada interfaz (26.0.0.0/8 incluido); el barrido del /24 propio ya no se hace solo');
        }

        // sondearDirecciones ya filtra las no-IPv4 y recorta al tope, así que
        // aquí no hace falta validar nada más.
        exploracion.sondeadas = Math.min(new Set(candidatas).size, LIMITE_SONDEO);
        const porSondeo = candidatas.length
          ? aparte('sondeo dirigido', Promise.all(
              puertos.map((pt) => sondearDirecciones({
                direcciones: candidatas, puerto: pt, esperaMs: espera, limite: LIMITE_SONDEO, log,
              }))
            ).then((listas) => listas.flat()))
          : Promise.resolve([]);

        // En paralelo: las esperas son la misma, no se suman — da igual que sean
        // 5 interfaces y 30 IPs pegadas.
        const [b, d] = await Promise.all([porDifusion, porSondeo]);
        // Difusión primero: gana su `via`. Y colapsando al final, porque una
        // partida alojada aquí mismo responde por cada interfaz y por cada vía:
        // el jugador vería su propio servidor repetido cuatro veces.
        const servidores = colapsarPropias(combinarHallazgos(b, d));

        // SERVIDORES QUE NO SE ANUNCIAN.
        //
        // El descubrimiento de §19 supone que todos los equipos lo implementan,
        // y en la red del curso se comprobó que no es así: un compañero tenía su
        // servidor aceptando conexiones TCP y no contestaba a ningún
        // DISCOVER_REQUEST. Con solo UDP, ese servidor es invisible aunque esté
        // a un paso y se pueda jugar contra él perfectamente.
        //
        // Así que a los vecinos que NO respondieron se les mira el puerto del
        // juego. Se abre el socket y se cierra: ni un byte del protocolo, para
        // no meter a nadie en la partida de otro. De ellos solo se sabe la
        // dirección — ni nombre ni jugadores — y así se marcan.
        // Se miran los vecinos Y las direcciones que el usuario pegó: si
        // escribe la IP de un compañero a mano es porque quiere jugar con él, y
        // sería absurdo no encontrarlo solo porque su servidor no se anuncia.
        if (url.searchParams.get('tcp') !== '0' && candidatas.length) {
          const yaVistos = new Set(servidores.map((s) => s.host));
          const mudos = [...new Set(candidatas)].filter((ip) => !yaVistos.has(ip));
          if (mudos.length) {
            try {
              const puertosASondear = [...new Set([tcpPort, 5005, 5000, 5002])];
              const encontradosHosts = new Set();
              for (const pt of puertosASondear) {
                const pend = mudos.filter((h) => !encontradosHosts.has(h));
                if (!pend.length) break;
                const abiertos = await conServidorEscuchando(pend, pt, 700);
                for (const host of abiertos) {
                  encontradosHosts.add(host);
                  servidores.push({
                    host, tcpPort: pt, gameId: 0, serverName: nombreDeRadmin(host),
                    state: 0, playerCount: 0, maximumPlayers: 0,
                    via: 'tcp', anuncia: false,
                  });
                }
              }
              const cerrados = mudos.filter((h) => !encontradosHosts.has(h));
              for (const host of cerrados) {
                servidores.push({
                  host, tcpPort, gameId: 0, serverName: nombreDeRadmin(host),
                  state: 'SIN_SERVICIO', playerCount: 0, maximumPlayers: 0,
                  via: 'sin-servicio', anuncia: false, sinServicio: true,
                });
              }
              if (encontradosHosts.size) exploracion.vias.push('puerto-tcp');
              exploracion.tcpProbados = mudos.length;
            } catch (e) {
              avisos.push(`sondeo del puerto de juego: ${e.message}`);
            }
          }
        }

        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(
          avisos.length ? { servidores, avisos, exploracion } : { servidores, exploracion }
        ));
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
    // Mismo motivo que en el servidor: si el equipo que aloja la partida se
    // cae de golpe, sin keepalive este socket quedaría abierto y el navegador
    // esperaría estados que ya no van a llegar, sin enterarse de nada.
    tcp.setKeepAlive(true, 10000);
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
    // Puertos adicionales en los que buscar, separados por comas. Sirve si el
    // grupo acordó uno distinto del estándar.
    puertosExtra: (val('puertos-busqueda', '') || '').split(',').map(Number).filter(Boolean),
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
