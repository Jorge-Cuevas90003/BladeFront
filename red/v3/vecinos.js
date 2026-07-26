// ============================================================================
//  Vecinos de la red virtual — leer el mapeo que Radmin ya hizo.
//
//  El problema: Radmin VPN reparte direcciones por todo el 26.0.0.0/8, así que
//  no hay una subred pequeña que barrer, y la difusión no siempre atraviesa el
//  adaptador virtual. Pero la aplicación de Radmin SÍ sabe quién está conectado
//  y con qué IP — y resulta que el sistema operativo también.
//
//  Cuando dos equipos intercambian cualquier paquete por la red virtual, el
//  sistema apunta al otro en su tabla de vecinos (ARP) con su dirección física.
//  Radmin mantiene ese tráfico por su cuenta, así que la tabla acaba conteniendo
//  a los compañeros conectados sin que nosotros hagamos nada.
//
//  La clave para separar el grano de la paja es la dirección física: una entrada
//  con MAC de ceros es una consulta que quedó sin respuesta (alguien apagado, o
//  una IP que nosotros mismos sondeamos y no contestó). Una entrada con MAC de
//  verdad es un equipo que respondió: está vivo y se le puede preguntar.
//
//  Esto NO sustituye a la difusión ni al sondeo manual: es una tercera fuente
//  de candidatos que sale gratis y que suele acertar justo con los que están
//  jugando ahora mismo.
// ============================================================================

import { execFile } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';

const MAC_NULA = /^[0:.-]*$/;              // 00-00-00-00-00-00 y variantes
const MAC = /([0-9a-f]{2}(?:[:-][0-9a-f]{2}){5})/i;
const IPV4 = /(\d{1,3}(?:\.\d{1,3}){3})/;

// Direcciones de infraestructura de la propia VPN, no jugadores. Radmin usa
// la .0.1 de su rango como nodo de servicio: preguntarle es ruido garantizado.
const INFRAESTRUCTURA = new Set(['26.0.0.1']);

// Mapeo de nombres oficiales del canal de Radmin VPN (CC8_ProyectoCTF).
export const NOMBRES_RADMIN = {
  '26.202.164.209': 'C4RL',
  '26.10.214.186': 'DAVIDSG6',
  '26.149.22.221': 'DESKTOP-8C1TEUH',
  '26.78.151.72': 'Edgar',
  '26.135.3.121': 'Emmanuel',
  '26.230.5.15': 'Espana-PC',
  '26.169.238.102': 'FEDORA',
  '26.43.87.248': 'Gab_Laptop',
  '26.94.87.242': 'Gab_PC',
  '26.221.47.165': 'HERBERTPC',
  '26.106.185.242': 'JAVIERRODAS8B25',
  '26.138.165.249': 'Lester',
  '26.52.44.2': 'LITOS',
  '26.204.234.64': 'MARTIAN',
  '26.192.234.52': 'PC-EMY',
  '26.99.36.148': 'SALCHIPAPA-ARCH',
  '26.63.72.136': 'SAMANTHAR',
  '26.98.33.110': 'Vicco-Lap',
  '26.157.21.141': 'Victor_PC',
  '26.11.206.94': 'J (Tú)',
};

export function nombreDeRadmin(ip) {
  return NOMBRES_RADMIN[ip] || `Compañero Radmin (${ip})`;
}

const ejecutar = (cmd, args) => new Promise((resolve) => {
  execFile(cmd, args, { encoding: 'latin1', timeout: 4000, windowsHide: true }, (err, stdout) => {
    resolve(err ? '' : stdout);
  });
});

// ---------------------------------------------------------------------------
//  Extrae vecinos vivos de la salida de `arp -a` o de `ip neigh`.
//
//  Los dos formatos ponen la IP y la MAC en la misma línea, que es lo único
//  que hace falta: no merece la pena un analizador distinto por sistema.
//
//  Va exportada y separada de la lectura del sistema a propósito: es la parte
//  que se puede probar de verdad. Una prueba que leyera la tabla real daría un
//  resultado distinto en cada máquina y en cada momento.
// ---------------------------------------------------------------------------
export function parsearTablaVecinos(texto, { prefijos = ['26.'], incluirInfraestructura = false } = {}) {
  const pares = new Map();
  for (const linea of String(texto ?? '').split(/\r?\n/)) {
    const mIp = linea.match(IPV4);
    const mMac = linea.match(MAC);
    if (!mIp || !mMac) continue;
    const ip = mIp[1];
    const mac = mMac[1].toLowerCase().replace(/:/g, '-');
    // MAC a ceros: la consulta quedó sin respuesta. O el equipo está apagado,
    // o es una IP que sondeamos nosotros y no existe.
    if (MAC_NULA.test(mac.replace(/[0-]/g, ''))) continue;
    if (!prefijos.some((p) => ip.startsWith(p))) continue;
    if (ip.endsWith('.255') || ip.endsWith('.0')) continue;        // difusión y red
    if (!incluirInfraestructura && INFRAESTRUCTURA.has(ip)) continue;
    pares.set(ip, { ip, mac });
  }
  return [...pares.values()];
}

// ---------------------------------------------------------------------------
//  Devuelve los vecinos VIVOS cuya IP empieza por alguno de los prefijos.
//  Nunca lanza: si el sistema no tiene la herramienta o falla, se devuelve una
//  lista vacía y el descubrimiento sigue con sus otras vías.
// ---------------------------------------------------------------------------
export async function vecinosVivos({ prefijos = ['26.'], incluirInfraestructura = false } = {}) {
  const salidas = [];
  salidas.push(await ejecutar('arp', ['-a']));
  // En Linux `arp` puede no estar instalado; `ip neigh` sí suele estarlo.
  if (os.platform() === 'linux') salidas.push(await ejecutar('ip', ['neigh']));

  const vistos = new Map();
  for (const salida of salidas) {
    for (const v of parsearTablaVecinos(salida, { prefijos, incluirInfraestructura })) {
      if (esPropia(v.ip)) continue;   // uno mismo no cuenta
      vistos.set(v.ip, v);
    }
  }
  return [...vistos.values()];
}

// Las IPv4 de esta máquina, para no sondearse a sí misma.
function esPropia(ip) {
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const i of lista ?? []) {
      if (i.family === 'IPv4' && i.address === ip) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
//  ¿Hay alguien escuchando en el puerto del juego?
//
//  El descubrimiento por UDP (§19) supone que todos los equipos lo implementan.
//  En la práctica no es así: se comprobó en la red del curso que un compañero
//  tenía su servidor perfectamente levantado y aceptando conexiones TCP, pero
//  no contestaba a ningún DISCOVER_REQUEST. Con solo UDP, ese servidor es
//  invisible aunque esté a un paso.
//
//  Abrir el TCP y cerrarlo enseguida responde a la única pregunta que importa
//  para poder jugar: ¿hay algo escuchando ahí? No se manda ni un byte del
//  protocolo, así que no se mete a nadie en la partida de otro.
// ---------------------------------------------------------------------------
export function puertoAbierto(host, puerto, esperaMs = 900) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    let hecho = false;
    const fin = (abierto) => {
      if (hecho) return;
      hecho = true;
      s.destroy();
      resolve(abierto);
    };
    s.setTimeout(esperaMs);
    s.once('connect', () => fin(true));
    s.once('timeout', () => fin(false));   // filtrado o apagado
    s.once('error', () => fin(false));     // rechazado: nadie escucha
    s.connect(puerto, host);
  });
}

// Cuáles de esos equipos tienen el puerto del juego abierto. Todos a la vez:
// la espera es una sola.
export async function conServidorEscuchando(ips, puerto, esperaMs = 900) {
  const res = await Promise.all(ips.map((ip) => puertoAbierto(ip, puerto, esperaMs)));
  return ips.filter((_, i) => res[i]);
}

// Prefijos de las interfaces locales que parecen de Radmin, para no limitar la
// búsqueda al 26 si alguna instalación usara otro rango.
export function prefijosRadminLocales() {
  const p = new Set(['26.']);
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const i of lista ?? []) {
      if (i.family === 'IPv4' && !i.internal && i.address.startsWith('26.')) {
        p.add(i.address.split('.')[0] + '.');
      }
    }
  }
  return [...p];
}
