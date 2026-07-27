import dgram from 'node:dgram';

console.log('Testing binding to 26.11.206.94:5001...');

const server = dgram.createSocket({ type: 'udp4', reuseAddr: true });
server.on('message', (msg, rinfo) => {
  console.log(`✓ SERVIDOR RECIBIÓ UDP DESDE ${rinfo.address}:${rinfo.port}: ${msg.toString().trim()}`);
  server.send(Buffer.from('{"type":"DISCOVER_RESPONSE","serverName":"BladeFront"}\n'), rinfo.port, rinfo.address);
});

server.bind(5001, '26.11.206.94', () => {
  console.log('✓ SERVIDOR ESCUCHANDO EN 26.11.206.94:5001!');

  // Ahora crear un cliente y enviar a 26.255.255.255 y 26.11.206.94
  const client = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  client.on('message', (msg, rinfo) => {
    console.log(`✓ CLIENTE RECIBIÓ RESPUESTA DESDE ${rinfo.address}:${rinfo.port}: ${msg.toString().trim()}`);
    process.exit(0);
  });

  client.bind(0, () => {
    client.setBroadcast(true);
    const req = Buffer.from('{"type":"DISCOVER_REQUEST"}\n');
    console.log('Enviando a 26.11.206.94:5001...');
    client.send(req, 5001, '26.11.206.94');
    console.log('Enviando a 26.255.255.255:5001...');
    client.send(req, 5001, '26.255.255.255');
  });
});

setTimeout(() => {
  console.log('Timeout. Exiting.');
  process.exit(1);
}, 3000);
