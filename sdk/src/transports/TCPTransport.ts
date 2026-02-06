import net from 'net';
import { ITransport, TransportOptions } from './ITransport';

export class TCPTransport implements ITransport {
  private host: string;
  private port: number;
  private socket?: net.Socket;
  private connected = false;

  private dataCallback: ((data: Buffer) => void) | null = null;
  private errorCallback: ((err: Error) => void) | null = null;

  constructor(host: string, port: number, private options?: TransportOptions) {
    this.host = host;
    this.port = port;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();

      this.socket.on('connect', () => {
        this.connected = true;
        resolve();
      });

      this.socket.on('data', (data) => {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        this.dataCallback?.(buffer);
      });

      this.socket.on('error', (err) => {
        this.errorCallback?.(err);
        reject(err);
      });

      this.socket.on('close', () => {
        this.connected = false;
      });

      this.socket.connect(this.port, this.host);
    });
  }

  disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.socket) return resolve();

      this.socket.once('close', () => {
        this.connected = false;
        resolve();
      });

      this.socket.end();
      this.socket.destroy();
    });
  }

  send(data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) return reject(new Error('TCP not connected'));
      this.socket.write(data, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  onData(callback: (data: Buffer) => void): void {
    this.dataCallback = callback;
  }

  onError(callback: (err: Error) => void): void {
    this.errorCallback = callback;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
