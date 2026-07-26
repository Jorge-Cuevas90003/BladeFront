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
import os from 'node:os';

const MAC_NULA = /^[0:.-]*$/;              // 00-00-00-00-00-00 y variantes
const MAC = /([0-9a-f]{2}(?:[:-][0-9a-f]{2}){5})/i;
const IPV4 = /(\d{1,3}(?:\.\d{1,3}){3})/;

// Direcciones de infraestructura de la propia VPN, no jugadores. Radmin usa
// la .0.1 de su rango como nodo de servicio: preguntarle es ruido garantizado.
const INFRAESTRUCTURA = new Set(['26.0.0.1']);

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
