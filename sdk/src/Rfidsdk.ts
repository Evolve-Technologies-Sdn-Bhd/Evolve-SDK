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

export class RfidSdk {
  private emitter = new RfidEventEmitter();
  private reader?: ReaderManager;

  // 🔥 SESSION CUMULATIVE STATS (IN-MEMORY ONLY)
  private totalCount = 0;
  private uniqueTags = new Set<string>();

  // --- EVENT HANDLING ---
  on(event: string, callback: (...args: any[]) => void) {
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

  async connectMqtt(brokerUrl: string, topic: string, options?: any) {
    this.reader = new MqttReader(brokerUrl, topic, this.emitter, options);
    await this.reader.connect();
    return true;
  }

  async disconnect() {
    await this.reader?.disconnect();
    this.reader = undefined;
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
    if (!this.reader) return;

    this.reader.on('tagRead', (rawTagData: any) => {
      // ✅ Update in-memory session counters
      this.totalCount++;

      if (rawTagData?.epc) {
        this.uniqueTags.add(rawTagData.epc);
      }

      // ✅ Emit raw data to consumers (no formatting)
      this.emit('tag', rawTagData);

      // ✅ Emit stats update event (optional but recommended)
      this.emit('stats', this.getCumulativeStats());
    });

    this.reader.startScan();
  }

  /**
   * Stop scanning for RFID tags
   */
  stop() {
    if (!this.reader) return;
    this.reader.stopScan();
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
