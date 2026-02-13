import mqtt from 'mqtt';
import { BaseReader } from '../readers/BaseReader';
import { TagData } from '../events/RfidEvents';

export class MqttReader extends BaseReader {
  private client?: mqtt.MqttClient;
  private brokerUrl: string;
  private topic: string;
  private options?: mqtt.IClientOptions;

  constructor(brokerUrl: string, topic: string, emitter: any, options?: mqtt.IClientOptions) {
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
