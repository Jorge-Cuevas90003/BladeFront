import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { crearServidor } from '../red/v3/servidor-v3.js';
import {
  TIPOS, ESTADO_BANDERA, AcumuladorTCP, enmarcar,
} from '../red/v3/protocolo-v3.js';

let fallas = 0;
const ok = (condicion, texto) => {
  console.log(`${condicion ? '✓' : '✗'} ${texto}`);
  if (!condicion) fallas++;
};

const servidor = crearServidor({
  puerto: 0,
  udp: false,
  servidorEstricto: true,
  monitorPort: 18147,
  params: { countdownSeconds: 1 },
});
const puerto = await servidor.escuchar();
const socket = net.connect(puerto, '127.0.0.1');
const mensajes = [];
const acc = new AcumuladorTCP((m) => mensajes.push(m));
socket.on('data', (d) => acc.alimentar(d));
await new Promise((resolve, reject) => {
  socket.once('connect', resolve);
  socket.once('error', reject);
});

const esperar = async (tipo, desde = 0, limite = 2500) => {
  const fin = Date.now() + limite;
  while (Date.now() < fin) {
    const hallado = mensajes.slice(desde).find((m) => m.type === tipo);
    if (hallado) return hallado;
    await new Promise((r) => setTimeout(r, 10));
  }
  return null;
};

socket.write(enmarcar(TIPOS.JOIN, { name: 'Cliente' }));
const aceptado = await esperar(TIPOS.JOIN_ACCEPTED);
ok(!!aceptado, 'el cliente entra como jugador');
ok(servidor.juego.jugadoresActivos().length === 1, 'el servidor no agrega un jugador propio');

const marca = mensajes.length;
socket.write(enmarcar(TIPOS.HOST_QUERY, { playerId: aceptado.playerId }));
const host = await esperar(TIPOS.HOST_INFO, marca);
ok(host?.hostId === aceptado.playerId && host?.puedesEmpezar === false,
  'el cliente puede ser anfitrión jugable, pero no controla el inicio');

const intento = mensajes.length;
socket.write(enmarcar(TIPOS.HOST_START, { playerId: aceptado.playerId }));
const rechazoInicio = await esperar(TIPOS.ERROR, intento);
ok(rechazoInicio?.description === 'solo la vista del servidor puede empezar la partida',
  'el servidor rechaza el intento de inicio enviado por un cliente');

const antesDelInicio = mensajes.length;
const respuesta = await fetch('http://127.0.0.1:18147/empezar', { method: 'POST' });
ok(respuesta.ok, 'la vista del servidor inicia la partida');
ok(!!await esperar(TIPOS.GAME_STARTED, antesDelInicio),
  'el cliente recibe GAME_STARTED después del inicio administrativo');

const jugador = servidor.juego.jugadores.get(aceptado.playerId);
jugador.hasFlag = true;
jugador.x = servidor.juego.p.circleRadius + servidor.juego.p.playerRadius + 2;
jugador.y = 0;
servidor.juego.bandera = {
  x: jugador.x, y: jugador.y,
  status: ESTADO_BANDERA.CARRIED,
  carrierId: jugador.playerId,
};
ok(!!await esperar(TIPOS.GAME_OVER, mensajes.length, 1500),
  'la partida termina y publica GAME_OVER');
const estadoMonitor = await (await fetch('http://127.0.0.1:18147/estado')).json();
ok(estadoMonitor.winner?.playerId === aceptado.playerId
  && estadoMonitor.winner?.name === 'Cliente',
  'la vista del servidor recibe el nombre y el id del ganador');

const htmlServidor = await readFile(
  new URL('../assets/captura-v3/servidor.html', import.meta.url), 'utf8',
);
const visorServidor = await readFile(
  new URL('../assets/captura-v3/js/visor-servidor-3d.js', import.meta.url), 'utf8',
);
const visorCliente = await readFile(
  new URL('../assets/captura-v3/js/visor-v3.js', import.meta.url), 'utf8',
);
const htmlCliente = await readFile(
  new URL('../assets/captura-v3/index.html', import.meta.url), 'utf8',
);
ok(htmlServidor.includes('visor-servidor-3d.js')
  && !visorServidor.includes('new ClienteV3')
  && !visorServidor.includes('.mandarDireccion(')
  && !visorServidor.includes('.interactuar('),
  'el monitor 3D es de solo lectura y no contiene controles de juego');
ok(!visorCliente.includes('Mi Propio Servidor (Host Local)'),
  'el cliente ya no muestra la opción de servidor local');
ok(!htmlCliente.includes('id="salaEmpezar"')
  && !visorCliente.includes('cliente.pedirInicio()'),
  'el cliente no muestra ni ejecuta controles para iniciar la partida');
ok(!visorCliente.includes('ANFITRIÓN')
  && !visorCliente.includes('Anfitrión conectado:'),
  'la sala del cliente no presenta a ningún jugador como anfitrión');

socket.destroy();
await servidor.cerrar();
console.log(`Resultado: ${fallas ? `${fallas} FALLAS` : '12 OK, 0 FALLAS'}`);
if (fallas) process.exitCode = 1;
