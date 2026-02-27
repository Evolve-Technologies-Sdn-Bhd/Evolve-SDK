import mqtt from 'mqtt';
import { ReaderManager } from '../readers/ReaderManager';
import { RfidEventEmitter, TagData } from '../events/EventBus';

export class MqttReader extends ReaderManager {
  private client?: mqtt.MqttClient;
  private brokerUrl: string;
  private topic: string;
  private options?: mqtt.IClientOptions;
  private retryCount = 0;
  private maxRetries = 5;
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
            this.handleConnectionFailure('Connection timeout', () => {
              if (!hasSettled) {
                hasSettled = true;
                reject(new Error('Connection timeout'));
              }
            }, attemptConnection);
          }
        }, 12000);

        this.client.once('connect', () => {
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
        });

        this.client.on('message', (topic, payload) => {
          const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload as any);
          
          try {
            const textDecoded = buffer.toString('utf-8');
            let parsedData: any = null;
            
            // Parse the JSON payload
            try {
              parsedData = JSON.parse(textDecoded);
            } catch {
              // If JSON parsing fails, try treating as hex-encoded JSON
              if (textDecoded && /^[0-9a-fA-F]+$/.test(textDecoded)) {
                try {
                  const hexDecodedBuffer = Buffer.from(textDecoded, 'hex');
                  const jsonString = hexDecodedBuffer.toString('utf-8');
                  parsedData = JSON.parse(jsonString);
                } catch {
                  // Not valid JSON, wrap as plain text
                  parsedData = { message: textDecoded.trim() };
                }
              } else {
                // Plain text, wrap as object
                parsedData = { message: textDecoded.trim() };
              }
            }

            // Handle EPCList array format - emit each EPC separately (one-by-one)
            if (parsedData && parsedData.data && Array.isArray(parsedData.data.EpcList)) {
              console.log(`[MqttReader] Processing EPCList with ${parsedData.data.EpcList.length} entries`);
              
              // Emit each EPC individually
              parsedData.data.EpcList.forEach((epcItem: any, index: number) => {
                const tag: TagData & any = {
                  id: epcItem.EPC || 'UNKNOWN',
                  epc: epcItem.EPC || 'UNKNOWN',
                  tid: epcItem.TID || '',
                  rssi: epcItem.RSSI ?? -54,
                  antId: epcItem.AntId || '1',
                  readTime: epcItem.ReadTime || new Date().toISOString(),
                  timestamp: Date.now(),
                  raw: buffer,
                };
                
                console.log(`[MqttReader] Emitting EPC ${index + 1}/${parsedData.data.EpcList.length}: ${tag.epc}`);
                this.emitTag(tag);
              });
            }
            // Handle nested EPC field that contains stringified JSON with EPCList
            else if (parsedData && typeof parsedData.EPC === 'string') {
              try {
                const epcData = JSON.parse(parsedData.EPC);
                if (epcData.data && Array.isArray(epcData.data.EpcList)) {
                  console.log(`[MqttReader] Processing nested EPCList with ${epcData.data.EpcList.length} entries`);
                  
                  // Emit each EPC individually
                  epcData.data.EpcList.forEach((epcItem: any, index: number) => {
                    const tag: TagData & any = {
                      id: epcItem.EPC || 'UNKNOWN',
                      epc: epcItem.EPC || 'UNKNOWN',
                      tid: epcItem.TID || '',
                      rssi: epcItem.RSSI ?? -54,
                      antId: epcItem.AntId || '1',
                      readTime: epcItem.ReadTime || new Date().toISOString(),
                      timestamp: parsedData.Timestamp ? new Date(parsedData.Timestamp).getTime() : Date.now(),
                      raw: buffer,
                    };
                    
                    console.log(`[MqttReader] Emitting EPC ${index + 1}/${epcData.data.EpcList.length}: ${tag.epc}`);
                    this.emitTag(tag);
                  });
                } else {
                  // Fallback: emit as single tag
                  this.emitSingleTag(parsedData, buffer);
                }
              } catch (e) {
                console.warn('[MqttReader] Could not parse nested EPC field:', e);
                this.emitSingleTag(parsedData, buffer);
              }
            }
            // Handle single EPC format
            else {
              this.emitSingleTag(parsedData, buffer);
            }
          } catch (err) {
            console.error('[MqttReader] Error processing message:', err);
          }
        });

        this.client.once('error', (err) => {
          if (connectResolved || hasSettled) return;
          connectResolved = true;
          clearTimeout(timeout);
          console.error('[MqttReader] Connection error:', err);
          this.handleConnectionFailure(err.message, () => {
            if (!hasSettled) {
              hasSettled = true;
              reject(err);
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
      console.error(
        `[MqttReader] Failed to connect after ${this.maxRetries} attempts. Giving up.`
      );
      // Only emit error event if there are listeners (EventEmitter throws if no listeners exist)
      if (this.listenerCount('error') > 0) {
        this.emit('error', new Error(`Connection failed after ${this.maxRetries} attempts: ${error}`));
      }
      onMaxRetriesExceeded();
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
   * Publish a tag (or arbitrary payload) to the MQTT broker.
   * If `tag.raw` is present it will be sent as binary; otherwise the tag object
   * will be JSON-stringified.
   */
  async publish(tag: TagData | any, topic?: string, options?: mqtt.IClientPublishOptions): Promise<boolean> {
    if (!this.client || !this.client.connected) {
      return Promise.reject(new Error('MQTT client is not connected'));
    }

    const targetTopic = topic ?? this.topic;

    // Build payload: prefer binary raw if available
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

    return new Promise<boolean>((resolve, reject) => {
      try {
        this.client!.publish(targetTopic, payload as any, options ?? {}, (err) => {
          if (err) return reject(err);
          resolve(true);
        });
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
  private emitSingleTag(parsedData: any, buffer: Buffer) {
    let id = 'UNKNOWN';
    
    // Try to extract EPC from various locations
    if (parsedData.data && parsedData.data.EPC) {
      id = parsedData.data.EPC;
    } else if (parsedData.EPC) {
      id = parsedData.EPC;
    } else if (parsedData.id) {
      id = parsedData.id;
    }

    const tag: TagData & any = {
      id: id,
      epc: id,
      tid: parsedData.TID || parsedData.tid || '',
      rssi: parsedData.RSSI ?? parsedData.rssi ?? -54,
      antId: parsedData.AntId || parsedData.antId || '1',
      readTime: parsedData.ReadTime || parsedData.readTime || new Date().toISOString(),
      timestamp: parsedData.Timestamp ? new Date(parsedData.Timestamp).getTime() : Date.now(),
      raw: buffer,
    };

    console.log('[MqttReader] Emitting single tag:', tag.epc);
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
