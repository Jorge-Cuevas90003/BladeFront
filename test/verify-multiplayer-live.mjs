import net from 'node:net';
import { TIPOS, enmarcar, AcumuladorTCP } from '../red/v3/protocolo-v3.js';

console.log('====================================================');
console.log('  SIMULACIÓN EN VIVO: 2 JUGADORES EN RED TCP 5000');
console.log('====================================================');

const c1 = net.connect(5000, '127.0.0.1');
const c2 = net.connect(5000, '127.0.0.1');

let p1Joined = false;
let p2Joined = false;

c1.on('connect', () => {
  console.log('✓ Jugador #1 (Host) conectado TCP a puerto 5000');
  c1.write(enmarcar(TIPOS.JOIN, { name: 'Caballero Host' }));
});

c2.on('connect', () => {
  console.log('✓ Jugador #2 (Invitado) conectado TCP a puerto 5000');
  c2.write(enmarcar(TIPOS.JOIN, { name: 'Caballero Invitado' }));
});

const acc1 = new AcumuladorTCP((msg) => {
  if (msg.type === TIPOS.JOIN_ACCEPTED) {
    p1Joined = true;
    console.log(`  -> Jugador #1 (Host) aceptado con ID: ${msg.playerId}`);
  } else if (msg.type === TIPOS.LOBBY_STATE) {
    console.log(`  -> Estado de la Sala: ${msg.players.length} jugador(es) en la lista`);
    if (msg.players.length === 2 && p1Joined && p2Joined) {
      console.log('\n🚀 ¡Ambos jugadores están dentro! El Host da la orden de INICIAR PARTIDA...');
      c1.write(enmarcar(TIPOS.START_GAME, {}));
    }
  } else if (msg.type === TIPOS.GAME_COUNTDOWN) {
    console.log(`⏱ Conteo regresivo en vivo: ${msg.secondsRemaining}...`);
  } else if (msg.type === TIPOS.GAME_STARTED) {
    console.log('\n⚔ ¡PARTIDA INICIADA CON ÉXITO! Ambos caballeros están en la arena 3D.');
    setTimeout(() => {
      c1.destroy();
      c2.destroy();
      console.log('====================================================');
      console.log('✓ PRUEBA MULTIJUGADOR EN VIVO COMPLETADA 100% OK.');
      process.exit(0);
    }, 500);
  }
});
c1.on('data', (d) => acc1.alimentar(d));

const acc2 = new AcumuladorTCP((msg) => {
  if (msg.type === TIPOS.JOIN_ACCEPTED) {
    p2Joined = true;
    console.log(`  -> Jugador #2 (Invitado) aceptado con ID: ${msg.playerId}`);
  }
});
c2.on('data', (d) => acc2.alimentar(d));
