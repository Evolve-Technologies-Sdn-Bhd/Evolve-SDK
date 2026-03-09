// src/events/RfidEvents.ts
import { EventEmitter } from 'events';
import { RfidSdkError, RfidSdkErrorObject, serializeError } from '../errors/RfidSdkError';

export interface TagData {
  id: string;
  epc?: string; // EPC identifier (6-7 bytes, extracted cleanly)
  timestamp: number;
  raw: Buffer;
  rssi?: number;
  id_full?: string; // Full payload data (for display)
}

export interface RawPacket {
  id: number;
  timestamp: string;
  direction: 'RX' | 'TX';
  data: string;
}

export type RfidEvents = 'connected' | 'disconnected' | 'tagRead' | 'error' | 'rawData';

export class RfidEventEmitter extends EventEmitter {
  emitTag(tag: TagData) {
    this.emit('tagRead', tag);
  }

  emitRawData(packet: RawPacket) {
    this.emit('rawData', packet);
  }

  emitConnected() {
    this.emit('connected');
  }

  emitDisconnected() {
    this.emit('disconnected');
  }

  /**
   * Emit error with automatic formatting to RfidSdkError
   * Accepts both Error and RfidSdkError instances
   * Safely handles cases where no error listener is registered
   * 
   * NOTE: Error logging is handled by the listener in sdkbridge.js
   * to avoid duplicate console outputs. This method only emits.
   */
  emitError(err: Error | RfidSdkError): void {
    let errorObject: RfidSdkErrorObject;

    if (err instanceof RfidSdkError) {
      errorObject = err.toJSON();
    } else {
      // Wrap native errors
      errorObject = serializeError(err);
    }

    // Safety check: only emit if there are listeners to prevent uncaught exception
    if (this.listenerCount('error') > 0) {
      this.emit('error', errorObject);
    }
  }
}
