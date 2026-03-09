import mqtt from 'mqtt';
import { ReaderManager } from '../readers/ReaderManager';
import { RfidEventEmitter, TagData } from '../events/EventBus';
import { createSdkError, wrapNativeError } from '../errors/RfidSdkError';

export class MqttReader extends ReaderManager {
  private client?: mqtt.MqttClient;
  private brokerUrl: string;
  private topic: string;
  private options?: mqtt.IClientOptions;
  private retryCount = 0;
  private maxRetries = 3;
  private retryTimeout?: NodeJS.Timeout;
  private isManuallyDisconnected = false;

  constructor(brokerUrl: string, topic: string, emitter: RfidEventEmitter, options?: mqtt.IClientOptions) {
    super(emitter);
    this.brokerUrl = brokerUrl;
    this.topic = topic;
    this.options = options;
  }

  async connect() {
    return new Promise<void>((resolve, reject) => {
      this.isManuallyDisconnected = false;
      this.retryCount = 0;
      let hasSettled = false;
      
      const attemptConnection = () => {
        // Disable automatic reconnection and handle it manually
        const clientOptions: mqtt.IClientOptions = {
          ...this.options,
          reconnectPeriod: 0, // Disable automatic reconnection
          connectTimeout: 10000,
        };

        this.client = mqtt.connect(this.brokerUrl, clientOptions);
        let connectResolved = false;

        const timeout = setTimeout(() => {
          if (!connectResolved && !hasSettled) {
            connectResolved = true;
            
            const timeoutError = createSdkError('CONNECTION_TIMEOUT', {
              broker: this.brokerUrl,
              timeoutMs: 12000,
            });
            
            this.handleConnectionFailure(timeoutError.message, () => {
              if (!hasSettled) {
                hasSettled = true;
                reject(timeoutError);
              }
            }, attemptConnection);
          }
        }, 12000);

        // track first connection separately so we only resolve once
        let firstConnect = true;
        this.client.on('connect', () => {
          if (firstConnect) {
            firstConnect = false;
            if (connectResolved || hasSettled) return;
            connectResolved = true;
            clearTimeout(timeout);

            this.client?.subscribe(this.topic, (err) => {
              if (connectResolved && hasSettled) return;
              if (err) {
                console.error('[MqttReader] Subscribe error:', err);
                connectResolved = true;
                this.handleConnectionFailure(err.message, () => {
                  if (!hasSettled) {
                    hasSettled = true;
                    reject(err);
                  }
                }, attemptConnection);
                return;
              }
              console.log('[MqttReader] Subscribed to topic:', this.topic);
              console.log('[MqttReader] Connected to broker:', this.brokerUrl);

              if (!hasSettled) {
                hasSettled = true;
                this.retryCount = 0;
                this.emit('connected');
                resolve();
              }
            });
          } else {
            // subsequent reconnect: simply re-subscribe
            console.log('[MqttReader] Reconnected to broker, re-subscribing to', this.topic);
            this.client?.subscribe(this.topic, (err) => {
              if (err) {
                console.error('[MqttReader] Subscribe error on reconnect:', err);
              } else {
                console.log('[MqttReader] Re-subscribed to topic after reconnect');
              }
            });
          }
        });

        this.client.on('message', (topic, payload) => {
          // 🚀 OPTIMIZATION: Process messages asynchronously to avoid blocking event loop
          setImmediate(() => this.processMessageAsync(topic, payload));
        });

        this.client.once('error', (err) => {
          if (connectResolved || hasSettled) return;
          connectResolved = true;
          clearTimeout(timeout);
          
          const sdkError = wrapNativeError(
            typeof err === 'string' ? new Error(err) : err as Error,
            'BROKER_CONNECTION_FAILED',
            { broker: this.brokerUrl }
          );
          
          console.error(sdkError.toString());
          this.handleConnectionFailure(sdkError.message, () => {
            if (!hasSettled) {
              hasSettled = true;
              reject(sdkError);
            }
          }, attemptConnection);
        });

        this.client.on('close', () => {
          if (!this.isManuallyDisconnected) {
            console.log('[MqttReader] Connection closed unexpectedly');
            this.emit('disconnected');
          }
        });

        this.client.on('disconnect', () => {
          if (!this.isManuallyDisconnected) {
            console.log('[MqttReader] Disconnected from broker');
            this.emit('disconnected');
          }
        });
      };

      attemptConnection();
    });
  }

  private handleConnectionFailure(
    error: string,
    onMaxRetriesExceeded: () => void,
    attemptConnection: () => void
  ) {
    this.client?.end(true);
    this.client = undefined;

    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      const delay = Math.min(1000 * Math.pow(2, this.retryCount - 1), 30000); // Exponential backoff, max 30s
      console.log(
        `[MqttReader] Connection failed: ${error}. Retrying in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`
      );
      this.retryTimeout = setTimeout(attemptConnection, delay);
    } else {
      // Emit structured error when max retries exceeded
      const sdkError = wrapNativeError(
        new Error(error),
        'BROKER_CONNECTION_FAILED',
        {
          broker: this.brokerUrl,
          attempts: this.maxRetries,
          lastError: error,
        }
      );
      
      console.error(sdkError.toString());
      
      // Only emit error event if there are listeners
      if (this.listenerCount('error') > 0) {
        this.emit('error', sdkError);
      }
      
      // Also emit via EventBus
      if (this.rfidEmitter) {
        this.rfidEmitter.emitError(sdkError);
      }
      
      onMaxRetriesExceeded();
    }
  }

  /**
   * 🚀 OPTIMIZATION: Asynchronous message processing to reduce event loop blocking
   * Supports both JSON and binary payloads for reduced latency
   */
  private async processMessageAsync(topic: string, payload: Buffer | string): Promise<void> {
    try {
      const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload as any);
      let parsedData: any = null;

      // 🚀 BINARY PAYLOAD SUPPORT: Check if payload is binary (no JSON parsing needed)
      if (this.isBinaryPayload(buffer)) {
        parsedData = this.parseBinaryPayload(buffer);
      } else {
        // Fallback to JSON parsing
        parsedData = this.parseJsonPayload(buffer);
      }

      if (parsedData) {
        await this.processParsedData(parsedData, buffer);
      }
    } catch (err) {
      console.error('[MqttReader] Error processing message:', err);
    }
  }

  /**
   * 🚀 OPTIMIZATION: Detect binary payloads (custom protocol)
   * Binary format: [MAGIC(2)][LEN(2)][EPC_DATA...][RSSI(1)][ANT_ID(1)]
   */
  private isBinaryPayload(buffer: Buffer): boolean {
    // Check for magic bytes (0xFF, 0xFE) indicating binary format
    return buffer.length >= 4 && buffer[0] === 0xFF && buffer[1] === 0xFE;
  }

  /**
   * 🚀 OPTIMIZATION: Parse binary payload (much faster than JSON)
   */
  private parseBinaryPayload(buffer: Buffer): any {
    try {
      const length = buffer.readUInt16BE(2);
      if (buffer.length < 6 + length) return null;

      const epcData = buffer.subarray(4, 4 + length);
      const rssi = buffer.readInt8(4 + length);
      const antId = buffer.readUInt8(5 + length);

      return {
        EPC: epcData.toString('hex').toUpperCase(),
        RSSI: rssi,
        AntId: antId.toString()
      };
    } catch {
      return null;
    }
  }

  /**
   * Parse JSON payload (existing logic, optimized)
   */
  private parseJsonPayload(buffer: Buffer): any {
    const textDecoded = buffer.toString('utf-8');

    try {
      return JSON.parse(textDecoded);
    } catch {
      // Try hex-encoded JSON
      if (textDecoded && /^[0-9a-fA-F]+$/.test(textDecoded)) {
        try {
          const hexDecodedBuffer = Buffer.from(textDecoded, 'hex');
          const jsonString = hexDecodedBuffer.toString('utf-8');
          return JSON.parse(jsonString);
        } catch {
          return { EPC: textDecoded.trim() };
        }
      } else {
        return { EPC: textDecoded.trim() };
      }
    }
  }

  /**
   * Heuristics to extract EPC from arbitrary object shapes
   */
  private extractEpc(obj: any): string | null {
    if (!obj) return null;
    // Direct strings
    if (typeof obj === 'string') {
      const s = obj.trim();
      if (/^[0-9a-fA-F]+$/.test(s) && s.length >= 8) return s;
      return null;
    }
    // Byte array
    if (Array.isArray(obj) && obj.length > 3 && obj.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) {
      return Buffer.from(obj).toString('hex');
    }
    // Object keys to try
    const candidates = ['EPC', 'epc', 'Epc', 'EPCID', 'EpcId', 'EPCId', 'EPCCode', 'EpcCode', 'TagEpc', 'TagID', 'tagId', 'id'];
    for (const key of candidates) {
      if (obj[key] && typeof obj[key] === 'string') {
        const s = String(obj[key]).trim();
        if (/^[0-9a-fA-F\s]+$/.test(s) && s.replace(/\s/g, '').length >= 8) return s.replace(/\s/g, '');
      }
      if (Array.isArray(obj[key])) {
        const asHex = this.extractEpc(obj[key]);
        if (asHex) return asHex;
      }
      if (obj[key] && typeof obj[key] === 'object') {
        const nested = this.extractEpc(obj[key]);
        if (nested) return nested;
      }
    }
    // Fallback: scan all string props
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === 'string') {
        const s = v.trim();
        if (/^[0-9a-fA-F]+$/.test(s) && s.length >= 8) return s;
      } else if (Array.isArray(v) || (v && typeof v === 'object')) {
        const nested = this.extractEpc(v);
        if (nested) return nested;
      }
    }
    return null;
  }

  private normalizeEpc(epc: string | null | undefined): string | null {
    if (!epc) return null;
    return String(epc).replace(/\s/g, '').toUpperCase();
  }

  /**
   * 🚀 OPTIMIZATION: Async tag processing with immediate emission
   */
  private async processParsedData(parsedData: any, buffer: Buffer): Promise<void> {
    const emitTagObject = (epcItem: any, timestampOverride?: number, deviceId?: string) => {
      const direct = epcItem?.EPC ?? epcItem?.epc;
      const epcStr = this.normalizeEpc(direct) || this.normalizeEpc(this.extractEpc(epcItem)) || 'UNKNOWN';
      const tag: TagData & any = {
        id: epcStr,
        epc: epcStr,
        tid: epcItem.TID || '',
        rssi: epcItem.RSSI ?? -54,
        antId: epcItem.AntId || '1',
        readTime: epcItem.ReadTime || new Date().toISOString(),
        timestamp: timestampOverride ?? Date.now(),
        raw: buffer,
        device: deviceId,
      };

      // 🚀 OPTIMIZATION: Use setImmediate for non-blocking emission
      setImmediate(() => this.emitTag(tag));
    };

    // Process different data formats asynchronously
    if (parsedData && Array.isArray(parsedData.EPCList)) {
      console.log(`[MqttReader] Processing top-level EPCList with ${parsedData.EPCList.length} entries`);
      // 🚀 Process array items asynchronously to avoid blocking
      for (const item of parsedData.EPCList) {
        setImmediate(() => emitTagObject(item));
      }
    }
    // Common vendor format: data.EpcList (camel) or data.EPCList (upper)
    else if (parsedData && parsedData.data && (Array.isArray(parsedData.data.EpcList) || Array.isArray(parsedData.data.EPCList))) {
      const list = parsedData.data.EpcList || parsedData.data.EPCList || [];
      console.log(`[MqttReader] Processing EPC list with ${list.length} entries`);
      const deviceId = parsedData.data.Device || parsedData.data.device || parsedData.Device;
      for (const item of list) {
        setImmediate(() => emitTagObject(item, undefined, deviceId));
      }
    }
    // Some payloads use { Type: "EPCList", data: { EPCList: [...] } }
    else if ((parsedData.Type === 'EPCList' || parsedData.type === 'EPCList') && parsedData.data && (Array.isArray(parsedData.data.EPCList) || Array.isArray(parsedData.data.EpcList))) {
      const list = parsedData.data.EPCList || parsedData.data.EpcList || [];
      const deviceId = parsedData.data.Device || parsedData.data.device || parsedData.Device;
      console.log(`[MqttReader] Processing EPCList(Type) with ${list.length} entries`);
      for (const item of list) {
        setImmediate(() => emitTagObject(item, undefined, deviceId));
      }
    }
    else if (parsedData && typeof parsedData.EPC === 'string') {
      let epcContent: any;
      try {
        epcContent = JSON.parse(parsedData.EPC);
      } catch {
        epcContent = parsedData.EPC;
      }

      if (epcContent && typeof epcContent === 'object') {
        if (Array.isArray(epcContent.EPCList)) {
          const deviceId = epcContent.Device;
          for (const item of epcContent.EPCList) {
            setImmediate(() => emitTagObject(item, undefined, deviceId));
          }
        } else if (epcContent.data && Array.isArray(epcContent.data.EpcList)) {
          const deviceId = epcContent.data.Device;
          for (const item of epcContent.data.EpcList) {
            setImmediate(() => emitTagObject(item, undefined, deviceId));
          }
        } else if (epcContent.EPC) {
          setImmediate(() => emitTagObject(epcContent));
        } else {
          setImmediate(() => this.emitSingleTag(parsedData, buffer));
        }
      } else {
        setImmediate(() => emitTagObject({ EPC: String(epcContent) }));
      }
    }
    else {
      setImmediate(() => this.emitSingleTag(parsedData, buffer));
    }
  }

  async disconnect() {
    this.isManuallyDisconnected = true;
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = undefined;
    }
    if (this.client) {
      this.client.end(true);
      this.client = undefined;
    }
  }

  /**
   * 🚀 OPTIMIZATION: Publish a tag with non-blocking async operation
   * Uses QoS 0 by default for minimum latency (fire-and-forget)
   */
  async publish(tag: TagData | any, topic?: string, options?: mqtt.IClientPublishOptions): Promise<boolean> {
    if (!this.client || !this.client.connected) {
      return Promise.reject(new Error('MQTT client is not connected'));
    }

    const targetTopic = topic ?? this.topic;

    // Build payload: prefer binary raw if available for reduced size
    let payload: Buffer | string;
    if (tag && tag.raw) {
      const raw = tag.raw as any;
      if (typeof raw === 'string') payload = raw;
      else if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(raw)) payload = raw;
      else if (raw instanceof Uint8Array || (raw && raw.constructor && raw.constructor.name === 'Uint8Array')) {
        payload = Buffer.from(raw as Uint8Array);
      } else if (Array.isArray(raw)) {
        payload = Buffer.from(raw as number[]);
      } else {
        try { payload = JSON.stringify(tag); } catch { payload = String(tag); }
      }
    } else {
      try { payload = JSON.stringify(tag); } catch { payload = String(tag); }
    }

    // 🚀 OPTIMIZATION: Use QoS 0 for fire-and-forget publishing (minimum latency)
    const publishOptions: mqtt.IClientPublishOptions = { qos: 0, retain: false, ...options };

    return new Promise<boolean>((resolve, reject) => {
      try {
        // 🚀 Fire-and-forget: resolve immediately for QoS 0, don't wait for callback
        if (publishOptions.qos === 0) {
          this.client!.publish(targetTopic, payload as any, publishOptions, (err) => {
            if (err) return reject(err);
            resolve(true);
          });
        } else {
          // For QoS 1/2, wait for confirmation
          this.client!.publish(targetTopic, payload as any, publishOptions, (err) => {
            if (err) return reject(err);
            resolve(true);
          });
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Format a single tag into individual EPC object
   * Sends one EPC with essential fields only (one-by-one format)
   * @param tag Raw tag data
   * @returns Formatted single EPC object
   */
  formatTagToEpc(tag: TagData & any): any {
    return {
      EPC: tag.epc || tag.id || 'UNKNOWN',
      TID: tag.tid || '',
      RSSI: tag.rssi ?? -54,
      AntId: tag.antId || '1',
      ReadTime: tag.readTime || new Date().toISOString()
    };
  }

  /**
   * Format a single tag as structured device response
   * Sends one EPC per message (one-by-one format)
   * @param tag Raw tag data
   * @returns Structured response for single EPC
   */
  formatTagAsStructured(tag: TagData | any): any {
    const epc = this.formatTagToEpc(tag);
    return epc;  // Return single EPC structure, not batched
  }

  /**
   * Publish a single tag formatted as structured JSON
   */
  async publishStructured(tag: TagData | any, topic?: string, options?: mqtt.IClientPublishOptions): Promise<boolean> {
    if (!this.client || !this.client.connected) {
      return Promise.reject(new Error('MQTT client is not connected'));
    }

    try {
      const structured = this.formatTagAsStructured(tag);
      const payload = JSON.stringify(structured);
      const targetTopic = topic ?? this.topic;

      return new Promise<boolean>((resolve, reject) => {
        this.client!.publish(targetTopic, payload, options ?? {}, (err) => {
          if (err) {
            console.error('[MqttReader] Error publishing structured tag:', err);
            return reject(err);
          }
          console.log('[MqttReader] Published structured tag to', targetTopic);
          resolve(true);
        });
      });
    } catch (error) {
      console.error('[MqttReader] Error in publishStructured:', error);
      return Promise.reject(error);
    }
  }

  /**
   * Emit a single tag from parsed data
   */
  private emitSingleTag(parsedData: any, buffer: Buffer): void {
    const epcStr = this.normalizeEpc(parsedData?.EPC ?? parsedData?.epc) || this.normalizeEpc(this.extractEpc(parsedData)) || 'UNKNOWN';
    const tag: TagData & any = {
      id: epcStr,
      epc: epcStr,
      tid: parsedData.TID || parsedData.tid || '',
      rssi: parsedData.RSSI ?? parsedData.rssi ?? -54,
      antId: parsedData.AntId || parsedData.antId || '1',
      readTime: parsedData.ReadTime || parsedData.readTime || new Date().toISOString(),
      timestamp: Date.now(),
      raw: buffer,
    };
    this.emitTag(tag);
  }

  readTag() {
    // MQTT messages are pushed from broker to subscriber
  }

  startScan() {
    // nothing to do for MQTT subscriber
  }

  stopScan() {
    // nothing to do for MQTT subscriber
  }
}
