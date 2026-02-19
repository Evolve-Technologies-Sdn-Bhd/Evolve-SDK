import mqtt from 'mqtt';
import { ReaderManager } from '../readers/ReaderManager';
import { RfidEventEmitter, TagData } from '../events/EventBus';

export class MqttReader extends ReaderManager {
  private client?: mqtt.MqttClient;
  private brokerUrl: string;
  private topic: string;
  private options?: mqtt.IClientOptions;

  constructor(brokerUrl: string, topic: string, emitter: RfidEventEmitter, options?: mqtt.IClientOptions) {
    super(emitter);
    this.brokerUrl = brokerUrl;
    this.topic = topic;
    this.options = options;
  }

  async connect() {
    return new Promise<void>((resolve, reject) => {
      this.client = mqtt.connect(this.brokerUrl, this.options as any);

      this.client.on('connect', () => {
        this.emit('connected');
        this.client?.subscribe(this.topic, (err) => {
          if (err) return reject(err);
          resolve();
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

      this.client.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      this.client.on('close', () => this.emit('disconnected'));
    });
  }

  async disconnect() {
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
