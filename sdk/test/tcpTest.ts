import { Buffer } from 'buffer';
import { TCPTransport } from '../transports/TCPTransport';

async function testTCP() {
  const tcp = new TCPTransport('192.168.1.100', 4001); // Replace with your reader IP & port

  tcp.onData((data) => console.log('TCP data:', data.toString('hex')));
  tcp.onError((err) => console.error('TCP error:', err));

  try {
    await tcp.connect();
    console.log('Connected!', tcp.isConnected());

    // Send test data (optional, depends on reader protocol)
    await tcp.send(Buffer.from([0x01, 0x02, 0x03]));
    console.log('Data sent');

    await tcp.disconnect();
    console.log('Disconnected');
  } catch (err) {
    console.error('Connection failed:', err);
  }
}

testTCP();
