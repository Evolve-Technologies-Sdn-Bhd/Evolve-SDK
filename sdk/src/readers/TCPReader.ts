import net from 'net';
import { BaseReader } from './BaseReader';
import { TagData } from '../events/RfidEvents';

export class TcpReader extends BaseReader {
  private client?: net.Socket;
  private host: string;
  private port: number;

  constructor(host: string, port: number, emitter: any) {
    super(emitter);
    this.host = host;
    this.port = port;
  }

  async connect() {
    return new Promise<void>((resolve, reject) => {
      this.client = new net.Socket();

      this.client.connect(this.port, this.host, () => {
        this.emit('connected');
        resolve();
      });

      // The 'data' parameter is typed as Buffer | string by Node.js
      this.client.on('data', (data: Buffer | string) => {
        // Convert to Buffer if it's a string, otherwise use as is
        const bufferData = Buffer.isBuffer(data) ? data : Buffer.from(data);

        const tag: TagData = {
          id: bufferData.toString('hex'),
          timestamp: Date.now(),
          raw: bufferData 
        };
        
        this.emit('tagRead', tag);
      });

      this.client.on('error', (err) => {
        this.emit('error', err);
        reject(err); // Added reject to handle connection failures
      });

      this.client.on('close', () => this.emit('disconnected'));
    });
  }

  async disconnect() {
    if (this.client) {
      this.client.destroy();
      this.client = undefined;
    }
  }

  startScan() {
    // For TCP, tags are pushed automatically, nothing extra needed
  }

  stopScan() {
    // Could add logic to pause listening if needed
  }
}
