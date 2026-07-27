import dgram from 'node:dgram';
import net from 'node:net';
import os from 'node:os';

console.log('====================================================');
console.log('  PRUEBA REAL EN VIVO DE DISCOVERY UDP BROADCAST');
console.log('====================================================');

const client = dgram.createSocket({ type: 'udp4', reuseAddr: true });
const respuestas = [];

client.on('message', (msg, rinfo) => {
  const texto = msg.toString('utf-8');
  console.log(`\n[✓ UDP RESPUESTA RECIBIDA] desde ${rinfo.address}:${rinfo.port} (${msg.length} bytes)`);
  console.log(`   Contenido: ${texto.trim()}`);
  respuestas.push({ address: rinfo.address, port: rinfo.port, data: texto });
});

client.on('error', (err) => {
  console.error('Error en socket cliente UDP:', err.message);
});

client.bind(0, () => {
  client.setBroadcast(true);

  const reqJson = JSON.stringify({ type: 'DISCOVER_REQUEST', protocolVersion: '2.0' }) + '\n';
  const reqBuf = Buffer.from(reqJson, 'utf-8');

  console.log('\n1. Enviando DISCOVER_REQUEST por Broadcast UDP a 255.255.255.255:5001...');
  client.send(reqBuf, 5001, '255.255.255.255', (err) => {
    if (err) console.error('  ⚠ Error enviando a 255.255.255.255:', err.message);
    else console.log('  ✓ Datagrama enviado exitosamente a 255.255.255.255:5001');
  });

  console.log('2. Enviando DISCOVER_REQUEST por Broadcast a Radmin VPN 26.255.255.255:5001...');
  client.send(reqBuf, 5001, '26.255.255.255', (err) => {
    if (err) console.error('  ⚠ Error enviando a 26.255.255.255:', err.message);
    else console.log('  ✓ Datagrama enviado exitosamente a 26.255.255.255:5001');
  });

  console.log('3. Enviando DISCOVER_REQUEST directo a IP de Radmin VPN 26.11.206.94:5001...');
  client.send(reqBuf, 5001, '26.11.206.94', (err) => {
    if (err) console.error('  ⚠ Error enviando a 26.11.206.94:', err.message);
    else console.log('  ✓ Datagrama enviado exitosamente a 26.11.206.94:5001');
  });

  setTimeout(() => {
    client.close();
    console.log('\n====================================================');
    console.log(`RESULTADO: ${respuestas.length} respuesta(s) UDP recibida(s).`);
    if (respuestas.length > 0) {
      console.log('✓ EL SERVIDOR DE DESCUBRIMIENTO UDP FUNCIONA PERFECTAMENTE Y RESPONDE EN VIVO.');
      process.exit(0);
    } else {
      console.error('❌ NO SE RECIBIÓ RESPUESTA UDP.');
      process.exit(1);
    }
  }, 2000);
});
