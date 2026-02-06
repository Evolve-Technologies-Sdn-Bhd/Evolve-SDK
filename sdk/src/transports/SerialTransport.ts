import { ITransport, TransportOptions } from './ITransport';
import { SerialPort } from 'serialport';

export interface SerialTransportOptions extends TransportOptions {
  dataBits?: 8 | 7 | 6 | 5;
  stopBits?: 1 | 2;
  parity?: 'none' | 'even' | 'odd';
}

/**
 * Serial Port Transport Implementation
 * Handles communication with RFID readers via RS-232/RS-485 serial connections
 */
export class SerialTransport implements ITransport {
  private port: SerialPort;
  private dataCallback: ((data: Buffer) => void) | null = null;
  private errorCallback: ((err: Error) => void) | null = null;
  private connected = false;

  constructor(
    path: string,
    private baudRate = 115200,
    private options?: SerialTransportOptions
  ) {
    this.port = new SerialPort({
      path,
      baudRate,
      dataBits: options?.dataBits ?? 8,
      stopBits: options?.stopBits ?? 1,
      parity: options?.parity ?? 'none',
      autoOpen: false,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.port.on('data', (data: Buffer) => {
      this.dataCallback?.(data);
    });

    this.port.on('error', (err: Error) => {
      this.connected = false;
      this.errorCallback?.(err);
    });

    this.port.on('close', () => {
      this.connected = false;
    });

    this.port.on('open', () => {
      this.connected = true;
    });
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connected) return resolve();

      this.port.open((err) => {
        if (err) {
          this.connected = false;
          return reject(new Error(`Failed to open serial port: ${err.message}`));
        }
        this.connected = true;
        resolve();
      });
    });
  }

  disconnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.connected) return resolve();

      this.port.close((err) => {
        if (err) {
          return reject(new Error(`Failed to close serial port: ${err.message}`));
        }
        this.connected = false;
        resolve();
      });
    });
  }

  send(data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.port.isOpen) {
        return reject(new Error('Serial port not open'));
      }

      this.port.write(data, (err) => {
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
    return this.connected && this.port.isOpen;
  }

  /**
   * Get list of available serial ports
   * Useful for discovering connected RFID readers
   */
  static async listPorts(): Promise<Array<{ path: string; manufacturer?: string }>> {
    try {
      return await SerialPort.list();
    } catch (err) {
      throw new Error(`Failed to list serial ports: ${(err as Error).message}`);
    }
  }
}
