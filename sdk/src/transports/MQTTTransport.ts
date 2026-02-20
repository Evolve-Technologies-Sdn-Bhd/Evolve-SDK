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
          const tag: TagData = {
            id: buffer.toString('hex'),
            timestamp: Date.now(),
            raw: buffer,
          };

          this.emitTag(tag);
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
