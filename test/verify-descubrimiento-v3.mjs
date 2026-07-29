// ============================================================================
//  Prueba del descubrimiento de servidores por UDP (§19, §27).
//  Correr:  node test/verify-descubrimiento-v3.mjs
//
//  Se apunta a 127.0.0.1 en vez de al broadcast de la red: la prueba debe
//  verificar el protocolo, no la topología de la LAN de quien la corra.
// ============================================================================

import dgram from 'node:dgram';
import {
  publicarServidor, buscarServidores, sondearDirecciones,
  direccionesDeSubred, interfacesLocales, direccionesRadminLocales,
  combinarHallazgos, esRangoRadmin, LIMITE_SONDEO,
  direccionDeDifusion, difusionesLocales, difundirPorInterfaces, colapsarPropias,
} from '../red/v3/descubrimiento.js';
import { TIPOS, VERSION, ESTADO_PARTIDA, codificar, decodificar } from '../red/v3/protocolo-v3.js';

const PUERTO = 15601;
let ok = 0, fail = 0;
const check = (cond, msg) => {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ FALLA: ${msg}`); }
};
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

let jugadores = 3;
let estado = ESTADO_PARTIDA.WAITING;

const publicador = publicarServidor({
  puerto: PUERTO,
  describir: () => ({
    gameId: 7,
    serverName: 'Arena BladeFront',
    tcpPort: 5000,
    state: estado,
    playerCount: jugadores,
    maximumPlayers: 100,
  }),
});

const terminar = (codigo) => {
  publicador.cerrar();
  console.log(`\n${'='.repeat(52)}`);
  console.log(`Resultado: ${ok} OK, ${fail} FALLAS`);
  process.exit(codigo);
};

try {
  await dormir(400); // que alcance a atarse al puerto

  // ── 1. Un servidor se anuncia y aparece en la búsqueda ────────────────────
  console.log('\n== 1. Anuncio y búsqueda (§19) ==');
  const hallados = await buscarServidores({ puerto: PUERTO, direccion: '127.0.0.1', esperaMs: 700 });
  check(hallados.length === 1, `se encuentra 1 servidor (fueron ${hallados.length})`);

  const s = hallados[0];
  check(s?.serverName === 'Arena BladeFront', `con su nombre ("${s?.serverName}")`);
  check(s?.tcpPort === 5000, 'con el puerto TCP donde conectarse');
  check(s?.gameId === 7, 'con el gameId');
  check(s?.playerCount === 3 && s?.maximumPlayers === 100, 'con el conteo de jugadores');
  check(s?.state === ESTADO_PARTIDA.WAITING, 'y el estado de la partida');

  // §27: la IP sale del ORIGEN del datagrama, no del contenido del mensaje.
  check(s?.host === '127.0.0.1', `la IP se deduce del datagrama (${s?.host})`);
  const campos = Object.keys(s);
  check(!campos.includes('ip') && !campos.includes('address'),
    'y el mensaje no transporta ninguna IP propia');

  // ── 2. Los datos son frescos en cada respuesta ────────────────────────────
  console.log('\n== 2. Los datos se recalculan por consulta ==');
  jugadores = 12;
  estado = ESTADO_PARTIDA.RUNNING;
  const otra = await buscarServidores({ puerto: PUERTO, direccion: '127.0.0.1', esperaMs: 700 });
  check(otra.length === 0, 'un servidor RUNNING no responde al descubrimiento (§19)');
  estado = ESTADO_PARTIDA.WAITING;
  const actualizada = await buscarServidores({ puerto: PUERTO, direccion: '127.0.0.1', esperaMs: 700 });
  check(actualizada[0]?.playerCount === 12, `al volver a WAITING refleja el conteo (${actualizada[0]?.playerCount})`);

  // ── 3. Los datagramas van SIN prefijo de longitud (§23) ───────────────────
  console.log('\n== 3. UDP sin prefijo de longitud (§23) ==');
  {
    const sock = dgram.createSocket('udp4');
    const respuesta = await new Promise((resolve) => {
      sock.on('message', (d) => resolve(d));
      sock.bind(() => {
        // Se manda el payload crudo (2 bytes: "01 03"), sin enmarcar.
        const req = codificar(TIPOS.DISCOVER_REQUEST, {});
        sock.send(req, PUERTO, '127.0.0.1');
      });
      setTimeout(() => resolve(null), 900);
    });
    sock.close();

    check(!!respuesta, 'responde a un DISCOVER_REQUEST crudo de 2 bytes');
    check(respuesta?.[0] === TIPOS.DISCOVER_RESPONSE,
      `el primer byte ya es el tipo, sin longitud delante (0x${respuesta?.[0]?.toString(16)})`);
    check(respuesta?.[1] === VERSION, 'y el segundo la versión');
    const m = decodificar(respuesta);
    check(m.serverName === 'Arena BladeFront', 'y se decodifica entero sin desenmarcar');
  }

  // ── 4. Basura y versiones ajenas no rompen nada ───────────────────────────
  console.log('\n== 4. Robustez del puerto de descubrimiento ==');
  {
    const sock = dgram.createSocket('udp4');
    await new Promise((r) => sock.bind(r));

    // Bytes sin sentido.
    sock.send(Buffer.from([0x99, 0x99, 0x99]), PUERTO, '127.0.0.1');
    // Un DISCOVER_REQUEST de otra versión del protocolo.
    const otroVer = codificar(TIPOS.DISCOVER_REQUEST, {});
    otroVer[1] = 0x09;
    sock.send(otroVer, PUERTO, '127.0.0.1');
    await dormir(300);

    // Si algo de lo anterior hubiera tumbado el socket, esto ya no respondería.
    const sigueVivo = await buscarServidores({ puerto: PUERTO, direccion: '127.0.0.1', esperaMs: 700 });
    check(sigueVivo.length === 1, 'tras recibir basura y otra versión, sigue respondiendo');
    sock.close();
  }

  // ── 5. Sondeo DIRIGIDO: el plan B para Radmin VPN ─────────────────────────
  // Sobre Radmin el broadcast a menudo no atraviesa el adaptador virtual, así
  // que hay que poder preguntar IP por IP.
  console.log('\n== 5. Sondeo dirigido a una lista de IPs ==');
  {
    const hallados = await sondearDirecciones({
      direcciones: ['127.0.0.1'], puerto: PUERTO, esperaMs: 700,
    });
    check(hallados.length === 1, `sondeando 127.0.0.1 aparece el servidor (${hallados.length})`);
    check(hallados[0]?.serverName === 'Arena BladeFront', 'con los mismos datos que por broadcast');
    check(hallados[0]?.tcpPort === 5000, 'y el puerto TCP al que conectarse');
    check(hallados[0]?.host === '127.0.0.1', 'la IP sigue saliendo del origen del datagrama (§27)');

    // Sin este campo la interfaz no puede explicar de dónde salió cada partida.
    check(hallados[0]?.via === 'directo', `marcado como hallado por sondeo ("${hallados[0]?.via}")`);
    const porBroadcast = await buscarServidores({ puerto: PUERTO, direccion: '127.0.0.1', esperaMs: 700 });
    check(porBroadcast[0]?.via === 'broadcast', `y la otra vía se marca distinto ("${porBroadcast[0]?.via}")`);
  }

  // ── 6. Una IP que no responde simplemente no aparece ──────────────────────
  console.log('\n== 6. Direcciones mudas y basura ==');
  {
    // 169.254.x es link-local: no hay nadie ahí, y según la máquina el envío
    // fallará o se perderá. En los dos casos el resultado debe ser el mismo.
    const hallados = await sondearDirecciones({
      direcciones: ['169.254.240.7', '127.0.0.1', '169.254.240.8'],
      puerto: PUERTO, esperaMs: 700,
    });
    check(hallados.length === 1, `de 3 direcciones solo aparece la que contesta (${hallados.length})`);
    check(hallados[0]?.host === '127.0.0.1', 'y es la correcta');

    // Que una IP esté mal escrita no puede abortar el sondeo entero.
    const conBasura = await sondearDirecciones({
      direcciones: ['no-es-una-ip', '999.1.1.1', '', '127.0.0.1'],
      puerto: PUERTO, esperaMs: 700,
    });
    check(conBasura.length === 1, 'las entradas que no son IPv4 se descartan sin romper nada');

    const vacio = await sondearDirecciones({ direcciones: [], puerto: PUERTO, esperaMs: 700 });
    check(Array.isArray(vacio) && vacio.length === 0, 'una lista vacía devuelve [] sin tocar la red');
  }

  // ── 7. Direcciones de una subred ──────────────────────────────────────────
  console.log('\n== 7. Cálculo de las direcciones de una subred ==');
  {
    const d = direccionesDeSubred('26.11.206.94', '255.255.255.0');
    check(d.length === 254, `un /24 da 254 direcciones (${d.length})`);
    check(d[0] === '26.11.206.1', `empieza en .1 (${d[0]})`);
    check(d.at(-1) === '26.11.206.254', `termina en .254 (${d.at(-1)})`);
    // Sondear la de red o la de difusión no aportaría nada: nadie las tiene.
    check(!d.includes('26.11.206.0'), 'no incluye la dirección de red');
    check(!d.includes('26.11.206.255'), 'no incluye la de difusión');
    check(!d.includes('26.11.207.1'), 'no se sale de la subred');

    // La IP de partida no tiene por qué ser la primera de su subred.
    const otra = direccionesDeSubred('26.11.206.1', '255.255.255.0');
    check(otra.length === 254 && otra[0] === '26.11.206.1', 'da igual qué IP de la subred se pase');

    const cuatro = direccionesDeSubred('192.168.5.6', '255.255.255.252');
    check(cuatro.length === 2 && cuatro[0] === '192.168.5.5' && cuatro[1] === '192.168.5.6',
      `un /30 deja solo 2 hosts (${cuatro.join(', ')})`);
    check(direccionesDeSubred('10.0.0.1', '255.255.255.255').length === 0,
      'un /32 no tiene hosts que sondear');

    // El tope existe para que nadie pida un barrido imposible: el /8 que
    // anuncia Radmin serían 16 millones de direcciones.
    let lanzo = false;
    try { direccionesDeSubred('26.11.206.94', '255.255.0.0'); } catch { lanzo = true; }
    check(lanzo, 'una subred mayor que el tope se rechaza en vez de generarse');
    let lanzoIp = false;
    try { direccionesDeSubred('carro', '255.255.255.0'); } catch { lanzoIp = true; }
    check(lanzoIp, 'y una IP inválida también');
  }

  // ── 8. Interfaces locales y detección de Radmin ───────────────────────────
  console.log('\n== 8. Interfaces locales (26.x.x.x = Radmin) ==');
  {
    const ifaces = interfacesLocales();
    check(ifaces.length > 0, `se listan las IPv4 locales (${ifaces.length})`);
    check(ifaces.every((i) => typeof i.address === 'string' && typeof i.netmask === 'string'),
      'todas traen dirección y máscara');
    check(ifaces.every((i) => !i.address.includes(':')), 'y ninguna es IPv6');

    const loop = ifaces.find((i) => i.address === '127.0.0.1');
    check(!!loop && loop.interna === true, 'el loopback aparece marcado como interno');
    check(loop?.radmin === false, 'y no se confunde con Radmin');

    check(esRangoRadmin('26.11.206.94') === true, '26.11.206.94 se reconoce como Radmin');
    check(esRangoRadmin('192.168.1.20') === false, 'y 192.168.1.20 no');
    check(esRangoRadmin('126.1.1.1') === false, 'ni 126.1.1.1 (no basta con que empiece por 26)');

    // En una máquina sin Radmin esto es [], y el escaneo automático no hará
    // nada — que es lo correcto, no un error.
    const auto = direccionesRadminLocales();
    check(Array.isArray(auto), `las candidatas del escaneo automático salen de ahí (${auto.length})`);
    check(auto.length <= LIMITE_SONDEO, `y nunca pasan del tope (${auto.length} ≤ ${LIMITE_SONDEO})`);
    check(auto.every((d) => esRangoRadmin(d)), 'todas dentro del rango 26.x.x.x');
    if (auto.length) {
      // Radmin anuncia máscara /8: si se tomara al pie de la letra saldrían 16
      // millones de direcciones, así que se estrecha a /24.
      check(auto.length === 254, `de la interfaz Radmin salen 254 candidatas, no el /8 entero (${auto.length})`);
    } else {
      console.log('  · (sin interfaz Radmin en esta máquina: el /24 no se pudo comprobar aquí)');
    }
  }

  // ── 9. Combinar las dos vías sin duplicar ─────────────────────────────────
  console.log('\n== 9. Fusión de broadcast y sondeo dirigido ==');
  {
    // El caso real: el mismo servidor contesta al broadcast Y al sondeo.
    const porBroadcast = await buscarServidores({ puerto: PUERTO, direccion: '127.0.0.1', esperaMs: 700 });
    const porSondeo = await sondearDirecciones({ direcciones: ['127.0.0.1'], puerto: PUERTO, esperaMs: 700 });
    check(porBroadcast.length === 1 && porSondeo.length === 1, 'las dos vías encuentran el servidor por separado');

    const juntos = combinarHallazgos(porBroadcast, porSondeo);
    check(juntos.length === 1, `combinados siguen siendo 1, no 2 (${juntos.length})`);
    check(juntos[0]?.via === 'broadcast', 'y gana el broadcast, que es la vía que ya funcionaba');

    // Dos partidas distintas en el mismo host se distinguen por el puerto TCP.
    const mismoHostOtroPuerto = [{ ...porSondeo[0], tcpPort: 5001 }];
    check(combinarHallazgos(porBroadcast, mismoHostOtroPuerto).length === 2,
      'pero dos puertos TCP en el mismo host son dos servidores');
    check(combinarHallazgos([], []).length === 0, 'combinar listas vacías no inventa nada');
  }

  // ── 10. Rendimiento del barrido de un /24 ─────────────────────────────────
  console.log('\n== 10. Un /24 entero en una sola espera ==');
  {
    // 254 datagramas por UN socket y UN temporizador: el barrido debe costar
    // lo que la espera, no 254 esperas encadenadas.
    const barrido = direccionesDeSubred('127.0.0.1', '255.255.255.0');
    check(barrido.length === 254, `se preparan 254 direcciones (${barrido.length})`);

    const t0 = performance.now();
    const hallados = await sondearDirecciones({ direcciones: barrido, puerto: PUERTO, esperaMs: 1000 });
    const ms = performance.now() - t0;

    console.log(`  · 254 IPs sondeadas en ${ms.toFixed(0)} ms (espera configurada: 1000 ms)`);
    check(ms < 1400, `el barrido cuesta la espera y poco más (${ms.toFixed(0)} ms < 1400)`);
    check(hallados.some((s) => s.host === '127.0.0.1'), 'y aun así encuentra el servidor entre las 254');

    // El tope por petición no es decorativo: con 520 candidatas delante, la que
    // responde queda fuera del corte y no se sondea.
    const relleno = Array.from({ length: 520 }, (_, i) => `169.254.${Math.floor(i / 254)}.${(i % 254) + 1}`);
    const recortado = await sondearDirecciones({
      direcciones: [...relleno, '127.0.0.1'], puerto: PUERTO, esperaMs: 700,
    });
    check(recortado.length === 0, `lo que pasa de ${LIMITE_SONDEO} direcciones no se sondea (${recortado.length})`);
  }

  // ── 11. Dirección de difusión dirigida de una interfaz ────────────────────
  // Es el cálculo del que depende todo lo demás: `ip | ~mascara`.
  console.log('\n== 11. Cálculo de la difusión dirigida ==');
  {
    check(direccionDeDifusion('26.11.206.94', '255.0.0.0') === '26.255.255.255',
      `Radmin /8 difunde a 26.255.255.255 (${direccionDeDifusion('26.11.206.94', '255.0.0.0')})`);
    // Ese /8 es justo el punto: los compañeros están en 26.43.87.248,
    // 26.202.164.209, 26.94.87.242… ninguno cae en el /24 de esta máquina, pero
    // los 20 comparten la misma difusión.
    for (const ip of ['26.43.87.248', '26.202.164.209', '26.94.87.242', '26.157.21.141']) {
      check(direccionDeDifusion(ip, '255.0.0.0') === '26.255.255.255',
        `${ip} comparte esa misma difusión`);
    }
    check(direccionDeDifusion('192.168.1.20', '255.255.255.0') === '192.168.1.255',
      'una Wi-Fi /24 difunde a su .255');
    check(direccionDeDifusion('192.168.5.6', '255.255.255.252') === '192.168.5.7',
      `y un /30 a su última (${direccionDeDifusion('192.168.5.6', '255.255.255.252')})`);

    let lanzo = false;
    try { direccionDeDifusion('carro', '255.0.0.0'); } catch { lanzo = true; }
    check(lanzo, 'una IP inválida se rechaza en vez de devolver basura');
  }

  // ── 12. Difusiones derivadas de las interfaces de ESTA máquina ────────────
  console.log('\n== 12. Difusiones de las interfaces locales ==');
  {
    const difs = difusionesLocales();
    check(Array.isArray(difs) && difs.length > 0, `se derivan difusiones reales (${difs.length})`);
    for (const d of difs) console.log(`  · ${d.nombre}: ${d.local}/${d.mascara} → ${d.difusion}`);
    check(difs.every((d) => d.difusion.split('.').length === 4), 'todas son IPv4 con sus 4 octetos');
    // El loopback solo encontraría servidores de esta misma máquina: fuera del
    // camino normal, dentro cuando se pide (las pruebas lo necesitan).
    check(difs.every((d) => !d.interna), 'el loopback no entra por defecto');
    check(difusionesLocales({ incluirInternas: true }).some((d) => d.local === '127.0.0.1'),
      'pero sí cuando se pide incluir las internas');

    const radmin = difs.filter((d) => d.radmin);
    if (radmin.length) {
      check(radmin.every((d) => d.difusion === '26.255.255.255'),
        `la interfaz Radmin difunde a toda la VPN, no a su /24 (${radmin.map((d) => d.difusion).join(', ')})`);
    } else {
      console.log('  · (sin interfaz Radmin en esta máquina: 26.255.255.255 no se pudo comprobar aquí)');
    }
  }

  // ── 13. Difusión dirigida POR INTERFAZ ────────────────────────────────────
  // La vía principal: un socket atado a CADA interfaz. Aquí se inyecta la lista
  // de interfaces para que la prueba no dependa de la red de quien la corra.
  console.log('\n== 13. Difusión dirigida por interfaz ==');
  {
    const loopback = { nombre: 'loopback-prueba', local: '127.0.0.1', mascara: '255.0.0.0', difusion: '127.255.255.255' };

    const r = await difundirPorInterfaces({ puerto: PUERTO, esperaMs: 800, interfaces: [loopback] });
    check(r.servidores?.length === 1, `difundiendo a 127.255.255.255 aparece el servidor (${r.servidores?.length})`);
    check(r.servidores[0]?.serverName === 'Arena BladeFront', 'con los mismos datos que por las otras vías');
    check(r.servidores[0]?.host === '127.0.0.1', 'la IP sigue saliendo del origen del datagrama (§27)');

    // `via` no cambia de valores: la interfaz ya sabe leer 'broadcast'/'directo'.
    check(r.servidores[0]?.via === 'broadcast', `sigue etiquetado 'broadcast' (${r.servidores[0]?.via})`);
    // Lo nuevo se AÑADE: por dónde salió exactamente.
    check(r.servidores[0]?.interfaz === 'loopback-prueba', `y se añade la interfaz (${r.servidores[0]?.interfaz})`);
    check(r.servidores[0]?.difusion === '127.255.255.255', `y la difusión usada (${r.servidores[0]?.difusion})`);

    // Sin esto la interfaz no puede distinguir "no hay nadie" de "no miré ahí".
    check(r.difusiones?.length === 1, `se informa por dónde se difundió (${r.difusiones?.length})`);
    check(r.difusiones[0]?.destinos?.includes('127.255.255.255'), 'con la dirección de difusión dirigida');
    check(r.difusiones[0]?.ok === true, 'y marcada como cursada');
  }

  // ── 14. Una interfaz caída no tumba a las demás ───────────────────────────
  // El caso real: VMware desaparece o la Wi-Fi no admite difusión, y la de
  // Radmin — la única que importa — tiene que seguir preguntando igual.
  console.log('\n== 14. Aislamiento de fallos entre interfaces ==');
  {
    const loopback = { nombre: 'loopback-prueba', local: '127.0.0.1', mascara: '255.0.0.0', difusion: '127.255.255.255' };
    // 10.99.99.99 no existe en esta máquina: atar ahí da EADDRNOTAVAIL.
    const fantasma = { nombre: 'adaptador-fantasma', local: '10.99.99.99', mascara: '255.255.255.0', difusion: '10.99.99.255' };

    const t0 = performance.now();
    const r = await difundirPorInterfaces({ puerto: PUERTO, esperaMs: 800, interfaces: [fantasma, loopback] });
    const ms = performance.now() - t0;

    check(r.servidores?.length === 1, `con una interfaz rota delante, la buena sigue encontrando (${r.servidores?.length})`);
    check(r.avisos?.length >= 1, `y el fallo se anota en vez de perderse ("${r.avisos?.[0]}")`);
    check(r.avisos?.some((a) => a.includes('adaptador-fantasma')), 'diciendo qué interfaz falló');
    check(r.difusiones?.find((d) => d.nombre === 'adaptador-fantasma')?.ok === false,
      'la interfaz rota queda marcada como NO cursada');
    check(r.difusiones?.find((d) => d.nombre === 'loopback-prueba')?.ok === true,
      'y la buena como cursada');

    // Todas las interfaces se preguntan a la vez: 5 interfaces cuestan una espera.
    console.log(`  · 2 interfaces difundidas en ${ms.toFixed(0)} ms (espera configurada: 800 ms)`);
    check(ms < 1300, `las interfaces se preguntan en paralelo, no en fila (${ms.toFixed(0)} ms < 1300)`);

    // Sin interfaces no se inventa nada, pero tampoco se calla el motivo.
    const vacio = await difundirPorInterfaces({ puerto: PUERTO, esperaMs: 200, interfaces: [] });
    check(vacio.servidores.length === 0 && vacio.avisos.length > 0,
      'sin ninguna interfaz devuelve lista vacía y explica por qué');
  }

  // ── 15. Una lista pegada de Radmin, como la del grupo real ────────────────
  // 20 IPs repartidas por todo el /8 (captura real) + la que sí responde. Es la
  // red de seguridad si la difusión tampoco atraviesa el adaptador.
  console.log('\n== 15. Lista pegada de ~20 IPs de Radmin ==');
  {
    const delGrupo = [
      '26.11.206.94', '26.202.164.209', '26.10.214.186', '26.149.22.221',
      '26.78.151.72', '26.135.3.121', '26.230.5.15', '26.169.238.102',
      '26.43.87.248', '26.94.87.242', '26.221.47.165', '26.106.185.242',
      '26.138.165.249', '26.52.44.2', '26.204.234.64', '26.192.234.52',
      '26.99.36.148', '26.63.72.136', '26.98.33.110', '26.157.21.141',
    ];
    check(delGrupo.length === 20 && delGrupo.every(esRangoRadmin), 'las 20 IPs reales son del rango Radmin');
    // Ninguna cae en el /24 de esta máquina: por eso el barrido del /24 no las
    // encontraba nunca.
    const enMi24 = delGrupo.filter((d) => d.startsWith('26.11.206.') && d !== '26.11.206.94');
    check(enMi24.length === 0, 'y ninguna comparte el /24 de esta máquina — el barrido /24 no podía verlas');

    const t0 = performance.now();
    const hallados = await sondearDirecciones({
      direcciones: [...delGrupo, '127.0.0.1'], puerto: PUERTO, esperaMs: 900,
    });
    const ms = performance.now() - t0;
    console.log(`  · 21 IPs sondeadas en ${ms.toFixed(0)} ms (espera configurada: 900 ms)`);
    check(ms < 1300, `21 IPs cuestan UNA espera, no 21 (${ms.toFixed(0)} ms < 1300)`);

    // Solo responde quien existe. En esta máquina eso son DOS direcciones del
    // mismo servidor: el loopback y su propia IP de Radmin, porque el publicador
    // escucha en 0.0.0.0 y el sondeo a 26.11.206.94 le llega igual. Las otras 19
    // no existen aquí y no aparecen. Que la propia IP de Radmin conteste prueba
    // que el sondeo unicast SÍ atraviesa el adaptador virtual.
    const locales = new Set(interfacesLocales().map((i) => i.address));
    console.log(`  · respondieron: ${hallados.map((s) => s.host).join(', ')}`);
    check(hallados.every((s) => locales.has(s.host)),
      `solo responden direcciones de esta máquina (${hallados.length}), las 19 ajenas no`);
    check(hallados.some((s) => s.host === '127.0.0.1'), 'el loopback entre ellas');
    check(hallados.every((s) => s.tcpPort === 5000 && s.via === 'directo'),
      'todas con los datos del servidor y marcadas como halladas por sondeo');
    check(21 <= LIMITE_SONDEO, `una lista pegada de 20-30 IPs cabe de sobra en el tope (${LIMITE_SONDEO})`);
  }

  // ── 16. El servidor propio no se ve cuatro veces ──────────────────────────
  // Efecto secundario de difundir por CADA interfaz: una partida alojada en
  // esta misma máquina contesta por todas, y como la IP sale del origen del
  // datagrama (§27) aparece una vez por interfaz. Son la misma partida.
  console.log('\n== 16. Colapso del servidor propio (multi-interfaz) ==');
  {
    const locales = ['127.0.0.1', '26.11.206.94', '192.168.1.20', '192.168.223.1'];
    const base = { tcpPort: 5000, gameId: 1, serverName: 'Arena BladeFront', via: 'broadcast' };
    const repetido = locales.map((host) => ({ ...base, host }));

    const uno = colapsarPropias(repetido, locales);
    check(uno.length === 1, `4 direcciones propias son 1 sola partida (${uno.length})`);
    check(uno[0].host === '26.11.206.94',
      `y se queda la de Radmin, que es la que sirve a los demás (${uno[0].host})`);

    // Lo que NO puede pasar: fundir a dos compañeros distintos.
    const ajenos = [
      { ...base, host: '26.43.87.248' },
      { ...base, host: '26.202.164.209' },
      { ...base, host: '127.0.0.1' },
    ];
    const mezcla = colapsarPropias(ajenos, locales);
    check(mezcla.length === 3, `dos compañeros con el mismo puerto siguen siendo dos (${mezcla.length})`);
    check(mezcla.some((s) => s.host === '26.43.87.248') && mezcla.some((s) => s.host === '26.202.164.209'),
      'ninguno de los dos desaparece');

    // Dos partidas propias en puertos distintos tampoco se funden.
    const dosPuertos = colapsarPropias(
      [{ ...base, host: '127.0.0.1' }, { ...base, host: '26.11.206.94', tcpPort: 5055 }], locales,
    );
    check(dosPuertos.length === 2, `dos puertos TCP propios son dos partidas (${dosPuertos.length})`);

    // Y contra la máquina de verdad, difundiendo por TODAS sus interfaces.
    const r = await difundirPorInterfaces({ puerto: PUERTO, esperaMs: 800, incluirInternas: true });
    console.log(`  · difundiendo por ${r.difusiones.length} interfaces reales → ${r.servidores.length} servidor(es): ${r.servidores.map((s) => `${s.host} (${s.interfaz})`).join(', ')}`);
    check(r.servidores.length === 1,
      `el servidor propio sale UNA vez pese a ${r.difusiones.length} interfaces (${r.servidores.length})`);
  }

  // ── El servidor no se responde a sí mismo ─────────────────────────────────
  //
  // El propio broadcast de anunciarActivamente() le llega de vuelta a su
  // mismo socket (medido, sobre todo por interfaces con difusión real). Un
  // DISCOVER_RESPONSE contiene la palabra "DISCOVER", así que sin excluirlo a
  // propósito el filtro de compatibilidad (pensado para tolerar clientes de
  // otros equipos) lo confundía con una pregunta nueva: el servidor se
  // contestaba a sí mismo, esa respuesta volvía a entrar, y así. Medido antes
  // de la corrección: ~670 mensajes por segundo sin que nadie preguntara nada.
  console.log('\n== El servidor no entra en bucle respondiéndose a sí mismo ==');
  {
    let mensajes = 0;
    const solitario = publicarServidor({
      puerto: 15602,
      describir: () => ({
        gameId: 9, serverName: 'Prueba de bucle', tcpPort: 5009,
        state: ESTADO_PARTIDA.WAITING, playerCount: 0, maximumPlayers: 100,
      }),
      log: () => { mensajes++; },
    });
    await dormir(2500);   // deja correr varias ráfagas de anunciarActivamente() (1/s)
    solitario.cerrar();
    // Ritmo normal esperado: unas pocas líneas de log por ráfaga (una por
    // destino/formato), no cientos. El bucle sin arreglar daba miles en este
    // mismo lapso.
    check(mensajes < 50, `sin bucle de auto-respuesta (${mensajes} mensajes en 2.5 s, antes eran miles)`);
  }

  terminar(fail ? 1 : 0);
} catch (e) {
  console.error('\nExcepción en la prueba:', e);
  fail++;
  terminar(1);
}
