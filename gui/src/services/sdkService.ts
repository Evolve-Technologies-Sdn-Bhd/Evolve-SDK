// gui/src/services/sdkService.ts

/**
 * SDK Service - Bridge between GUI and Electron/SDK backend
 * 
 * Provides methods for connecting to various RFID readers (TCP, MQTT, Serial)
 * and listening for tag data events.
 */

export interface MqttConnectionOptions {
  username?: string;
  password?: string;
  clientId?: string;
  keepalive?: number;
  reconnectPeriod?: number;
  connectTimeout?: number;
  rejectUnauthorized?: boolean;
  protocol?: 'mqtt' | 'mqtts' | 'tcp' | 'tls' | 'ws' | 'wss';
  [key: string]: any;
}

export const sdkService = {
  /**
   * Connect to RFID reader via TCP/IP
   */
  connect: async (ip: string, port: number) => {
    // @ts-ignore
    return await window.electronAPI.connectReader({ type: 'tcp', ip, port });
  },

  /**
   * Connect to RFID reader via Serial RS-232/COM
   */
  connectSerial: async (comPort: string, baudRate: number) => {
    // @ts-ignore
    return await window.electronAPI.connectSerial({ comPort, baudRate });
  },

  /**
   * Connect to MQTT broker for RFID tag data
   * 
   * @param brokerUrl - MQTT broker URL (e.g., mqtt://broker.hivemq.com or mqtts://localhost:8883)
   * @param topic - MQTT topic to subscribe to
   * @param options - Optional connection parameters (username, password, clientId, etc.)
   */
  connectMqtt: async (brokerUrl: string, topic: string, options?: MqttConnectionOptions) => {
    // @ts-ignore
    return await window.electronAPI.connectMqtt(brokerUrl, topic, options);
  },

  /**
   * Publish a message to MQTT broker
   * 
   * @param payload - Data to publish (string, Buffer, or object)
   * @param topic - Optional topic to publish to (uses default if not provided)
   */
  publishMqtt: async (payload: any, topic?: string) => {
    // @ts-ignore
    return await window.electronAPI.publishMqtt(payload, topic);
  },

  /**
   * Disconnect from current reader/broker
   */
  disconnect: async () => {
    // @ts-ignore
    return await window.electronAPI.disconnectReader();
  },

  /**
   * Start emitting tag read events from the backend
   */
  startScan: () => {
    // @ts-ignore
    return window.electronAPI.startScan();
  },

  /**
   * Stop emitting tag read events from the backend
   */
  stopScan: () => {
    // @ts-ignore
    return window.electronAPI.stopScan();
  },

  /**
   * Register callback for tag read events
   * 
   * @param callback - Function called when RFID tag is detected
   */
  onTagRead: (callback: (tag: any) => void) => {
    // @ts-ignore
    window.electronAPI.onTagRead(callback);
  },

  /**
   * Register callback for cumulative stats updates
   * 
   * @param callback - Function called when stats are updated with { total, unique }
   */
  onStats: (callback: (stats: { total: number; unique: number }) => void) => {
    // @ts-ignore
    window.electronAPI.onStats(callback);
  }
};