export enum ReaderState {
  IDLE = 'idle',
  //SCANNING = 'scanning',
  CONNECTED = 'connected',
  CONNECTING = 'connecting',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
}

export interface ReaderInfo {
    id: string;
    model: string;
    transport: 'tcp' | 'serial';
    address: string;
    port?: number;
}