import net from 'node:net';
import { crearServidor } from '../red/v3/servidor-v3.js';
import {
  TIPOS, AcumuladorTCP, enmarcar,
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
ok(host?.hostId === 0 && host?.puedesEmpezar === false,
  'ningún cliente se convierte en anfitrión del servidor');

const intento = mensajes.length;
socket.write(enmarcar(TIPOS.HOST_START, { playerId: aceptado.playerId }));
ok(!!await esperar(TIPOS.ERROR, intento), 'un cliente no puede iniciar la partida');

const inicioLocal = mensajes.length;
const respuesta = await fetch('http://127.0.0.1:18147/empezar', { method: 'POST' });
ok(respuesta.ok, 'la consola local del servidor puede iniciar');
ok(!!await esperar(TIPOS.GAME_STARTED, inicioLocal), 'el cliente recibe GAME_STARTED');

socket.destroy();
await servidor.cerrar();
console.log(`Resultado: ${fallas ? `${fallas} FALLAS` : '6 OK, 0 FALLAS'}`);
if (fallas) process.exitCode = 1;
