// src/RfidSdk.ts

/**
 * Main RFID SDK Entry Point
 *
 * DESIGN PRINCIPLE: Pure Transport Abstraction
 * - SDK emits RAW data only (no formatting)
 * - GUI/Consumers handle all data formatting
 * - Works with Serial, TCP, MQTT identically
 *
 * Event Flow:
 * Transport → Reader → EventBus → SDK
 *               ├─ Update Session Stats (in-memory)
 *               └─ Emit RAW tag → GUI
 */

import { RfidEventEmitter } from './events/EventBus';
import { ReaderManager } from './readers/ReaderManager';
import { TcpReader } from './transports/TCPTransport';
import { MqttReader } from './transports/MQTTTransport';
import { SerialReader } from './transports/SerialTransport';

export class RfidSdk {
  private emitter = new RfidEventEmitter();
  private reader?: ReaderManager;

  // 🔥 SESSION CUMULATIVE STATS (IN-MEMORY ONLY)
  private totalCount = 0;
  private uniqueTags = new Set<string>();

  // Store tag listener to prevent duplicates
  private tagReadListener?: (rawTagData: any) => void;

  // --- EVENT HANDLING ---
  on(event: string, callback: (...args: any[]) => void) {
    this.emitter.on(event, callback);
  }

  /**
   * Remove listener for an event (compat shim for external callers)
   */
  removeListener(event: string, callback: (...args: any[]) => void) {
    this.emitter.removeListener(event, callback);
  }

  /**
   * Alias for removeListener
   */
  off(event: string, callback: (...args: any[]) => void) {
    this.removeListener(event, callback);
  }

  private emit(event: string, data?: any) {
    this.emitter.emit(event, data);
  }

  // --- CONNECT / DISCONNECT ---
  async connectTcp(host: string, port: number) {
    try {
      // Disconnect any existing reader before connecting a new one
      if (this.reader) {
        await this.disconnect();
      }

      this.reader = new TcpReader(host, port, this.emitter);
      await this.reader.connect();
      console.log(`[RfidSdk] TCP Reader connected at ${host}:${port}`);
      return true;
    } catch (err) {
      // Clean up reader instance on connection failure
      if (this.reader) {
        try {
          await this.reader.disconnect();
        } catch (cleanupErr) {
          console.error('[RfidSdk] Error during cleanup:', cleanupErr);
        }
        this.reader = undefined;
      }
      throw err;
    }
  }

  async connectSerial(path: string, baudRate: number, protocol: 'UF3-S' | 'F5001' | 'A0' = 'A0') {
    const reader = new SerialReader(path, baudRate, this.emitter);
    this.reader = reader;
    
    // Configure protocol before connecting
    await reader.configure({ protocol });
    
    await this.reader.connect();
    console.log(`[RfidSdk] Serial Reader connected at ${path} (Protocol: ${protocol})`);
  }

  async connectMqtt(brokerUrl: string, topic: string, options?: any) {
    try {
      // Disconnect any existing reader before connecting a new one
      if (this.reader) {
        await this.disconnect();
      }
      
      this.reader = new MqttReader(brokerUrl, topic, this.emitter, options);
      await this.reader.connect();
      return true;
    } catch (err) {
      // Clean up reader instance on connection failure
      if (this.reader) {
        try {
          await this.reader.disconnect();
        } catch (cleanupErr) {
          console.error('[RfidSdk] Error during cleanup:', cleanupErr);
        }
        this.reader = undefined;
      }
      // Re-throw the original error so it propagates to the caller
      throw err;
    }
  }

  async disconnect() {
    try {
      // Clean up listener before disconnect
      if (this.tagReadListener && this.reader) {
        console.log('[RfidSdk] Cleaning up tag listener on disconnect');
        this.reader.removeListener('tagRead', this.tagReadListener);
        this.tagReadListener = undefined;
      }
      
      await this.reader?.disconnect();
    } finally {
      this.reader = undefined;
    }
  }

  // --- CONFIGURE READER ---
  async configure(settings: Record<string, any>) {
    await this.reader?.configure(settings);
  }

  // --- START / STOP SCAN ---
  /**
   * Start scanning for RFID tags
   *
   * Emits RAW tag data: { epc, rssi, timestamp }
   * Also updates in-memory session statistics
   */
  start() {
    if (!this.reader) {
      console.warn('[RfidSdk] No reader connected, cannot start scan');
      return;
    }

    console.log('[RfidSdk] Starting scan');

    // Remove old listener if it exists to prevent duplicates
    if (this.tagReadListener) {
      console.log('[RfidSdk] Removing previous tag listener');
      this.reader.removeListener('tagRead', this.tagReadListener);
    }

    // Create the new listener
    this.tagReadListener = (rawTagData: any) => {
      // ✅ Update in-memory session counters
      this.totalCount++;

      // 🔧 NORMALIZED UNIQUE IDENTIFICATION
      // Both A0 and BB protocols extract exactly ~7 bytes of EPC
      // This ensures same physical tag = same identifier across protocols
      const uniqueIdentifier = rawTagData?.epc || rawTagData?.id;
      
      if (uniqueIdentifier) {
        const isNewTag = !this.uniqueTags.has(uniqueIdentifier);
        this.uniqueTags.add(uniqueIdentifier);
        
        console.log(`[RfidSdk] Tag read: ID=${uniqueIdentifier}, Protocol=${rawTagData._protocol || 'unknown'}, NEW=${isNewTag}, Total=${this.totalCount}, Unique=${this.uniqueTags.size}`);
      } else {
        console.warn(`[RfidSdk] ⚠️ Tag received but no EPC/ID field - cannot add to unique set`, rawTagData);
      }

      // ✅ Emit raw data to consumers (no formatting)
      this.emit('tag', rawTagData);

      // ✅ Emit stats update event (optional but recommended)
      const stats = this.getCumulativeStats();
      console.log('[RfidSdk] Emitting stats event:', stats);
      this.emit('stats', stats);
    };

    // Register the new listener
    this.reader.on('tagRead', this.tagReadListener);

    this.reader.startScan();
  }

  /**
   * Stop scanning for RFID tags
   */
  stop() {
    if (!this.reader) return;
    
    // Remove listener when stopping
    if (this.tagReadListener) {
      console.log('[RfidSdk] Removing tag listener on stop');
      this.reader.removeListener('tagRead', this.tagReadListener);
      this.tagReadListener = undefined;
    }
    
    this.reader.stopScan();
  }

  /**
   * Alias for start() - more intuitive naming
   */
  startScan() {
    this.start();
  }

  /**
   * Alias for stop() - more intuitive naming
   */
  stopScan() {
    this.stop();
  }

  // --- SESSION STATS API ---

  /**
   * Get current session cumulative statistics
   * (Used by GUI live counter)
   */
  getCumulativeStats() {
    return {
      total: this.totalCount,
      unique: this.uniqueTags.size,
    };
  }

  /**
   * Reset session cumulative statistics
   * Does NOT affect historical database
   */
  resetCumulativeStats() {
    this.totalCount = 0;
    this.uniqueTags.clear();

    // Notify GUI that stats were reset
    this.emit('stats', this.getCumulativeStats());
  }

  // --- OPTIONAL PUBLISH ---
  async publish(tag: any, topic?: string) {
    if (!this.reader) throw new Error('No reader connected');
    const pub = (this.reader as any).publish;
    if (typeof pub !== 'function')
      throw new Error('Connected reader does not support publish');

    return await pub.call(this.reader, tag, topic);
  }
}
