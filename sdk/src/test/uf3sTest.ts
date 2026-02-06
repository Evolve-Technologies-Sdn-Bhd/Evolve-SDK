import { TCPTransport } from '../transports/TCPTransport';
import { UF3SReader } from '../readers/UF3SReader';
import { SDKEvent } from '../types/event';

async function testUF3S() {
  const transport = new TCPTransport('192.168.1.100', 4001); // Replace with your reader IP
  const reader = new UF3SReader(
    { id: 'uf3s-001', model: 'UF3-S', transport: 'tcp', address: '192.168.1.100', port: 4001 },
    transport
  );

  const bus = reader.getEventBus();
  bus.on(SDKEvent.TAG_DETECTED, (tag) => console.log('TAG DETECTED:', tag));
  bus.on(SDKEvent.ERROR, (err) => console.error('Reader error:', err));

  await reader.connect();
  console.log('Reader connected!');

  // Keep running for demo
  setTimeout(async () => {
    await reader.disconnect();
    console.log('Reader disconnected');
  }, 30000); // 30 seconds
}

testUF3S();
