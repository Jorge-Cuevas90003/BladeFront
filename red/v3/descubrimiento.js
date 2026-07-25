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
// ============================================================================

import dgram from 'node:dgram';
import { TIPOS, VERSION, codificar, decodificar, PARAMS_DEFECTO } from './protocolo-v3.js';

// --- lado servidor: responde a quien pregunte -------------------------------
// `describir()` lo provee el servidor de juego y devuelve los datos frescos
// (estado y jugadores conectados cambian a cada rato).
export function publicarServidor({ puerto = PARAMS_DEFECTO.discoveryPort, describir, log = () => {} }) {
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

  sock.on('error', (e) => log('socket de descubrimiento:', e.message));
  sock.bind(puerto, () => {
    sock.setBroadcast(true);
    log(`descubrimiento UDP escuchando en el puerto ${puerto}`);
  });

  return { cerrar: () => sock.close() };
}

// --- lado cliente: pregunta y junta las respuestas --------------------------
// Devuelve una promesa con los servidores hallados tras `esperaMs`. Cada
// entrada trae la IP tomada del origen del datagrama, no del contenido.
export function buscarServidores({
  puerto = PARAMS_DEFECTO.discoveryPort,
  direccion = '255.255.255.255',
  esperaMs = 1000,
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
      hallados.set(`${origen.address}:${msg.tcpPort}`, {
        host: origen.address,          // §27: la IP sale del datagrama
        tcpPort: msg.tcpPort,
        gameId: msg.gameId,
        serverName: msg.serverName,
        state: msg.state,
        playerCount: msg.playerCount,
        maximumPlayers: msg.maximumPlayers,
      });
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
