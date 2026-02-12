// src/RfidSdk.ts
import { RfidEventEmitter } from './events/RfidEvents';
import { BaseReader } from './readers/BaseReader';
import { TcpReader } from './readers/TCPReader';
import { formatPayload } from './payloads/PayloadFormatter';

export class RfidSdk {
  private emitter = new RfidEventEmitter();
  private reader?: BaseReader;
  private events: Record<string, Function> = {};

  // --- EVENT HANDLING ---
  on(event: string, callback: (...args: any[]) => void) {
    // allow GUI or other consumers to listen to SDK events
    this.emitter.on(event, callback);
  }

  private emit(event: string, data?: any) {
    this.emitter.emit(event, data);
  }

  // --- CONNECT / DISCONNECT ---
  async connectTcp(host: string, port: number) {
    this.reader = new TcpReader(host, port, this.emitter);
    await this.reader.connect();
    return true;
  }

  async disconnect() {
    await this.reader?.disconnect();
    this.reader = undefined;
  }

  // --- CONFIGURE READER ---
  async configure(settings: Record<string, any>) {
    // implement configuration for reader (if needed)
    if (this.reader && typeof (this.reader as any).configure === 'function') {
      await (this.reader as any).configure(settings);
    }
  }

  // --- START / STOP SCAN ---
    start() {
      if (!this.reader) return;

      this.reader.on('tagRead', (tag: any) => {
        const formatted = formatPayload(tag);
        this.emit('tag', formatted);
      });

      if (typeof (this.reader as any).startScan === 'function') {
        (this.reader as any).startScan();
      }
    }


  stop() {
    if (!this.reader) return;

    // If reader supports stopScan(), call it
    if (typeof (this.reader as any).stopScan === 'function') {
      (this.reader as any).stopScan();
    }
  }
}
