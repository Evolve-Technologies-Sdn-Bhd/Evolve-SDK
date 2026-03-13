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

export interface ReaderTransport {
  connectReader: (options: { type: string; ip: string; port: number }) => Promise<any>;
  connectSerial: (options: { comPort: string; baudRate: number; protocol: string }) => Promise<any>;
  connectMqtt: (brokerUrl: string, topic: string, options?: MqttConnectionOptions) => Promise<any>;
  publishMqtt: (payload: any, topic?: string) => Promise<any>;
  disconnectReader: () => Promise<any>;
  startScan: () => void;
  stopScan: () => void;
  onTagRead: (callback: (tag: any) => void) => void;
  onStats: (callback: (stats: { total: number; unique: number }) => void) => (() => void) | undefined;
  onRawData: (callback: (packet: any) => void) => void;
  onDisconnected: (callback: (data: { type: string; error?: string }) => void) => void;
  onResetCounters: (callback: () => void) => void;
  resetCounters: () => Promise<any>;
}

export interface SdkService {
  connect: (ip: string, port: number) => Promise<any>;
  connectSerial: (comPort: string, baudRate: number, protocol?: string) => Promise<any>;
  connectMqtt: (brokerUrl: string, topic: string, options?: MqttConnectionOptions) => Promise<any>;
  publishMqtt: (payload: any, topic?: string) => Promise<any>;
  disconnect: () => Promise<any>;
  startScan: () => void;
  stopScan: () => void;
  onTagRead: (callback: (tag: any) => void) => void;
  onStats: (callback: (stats: { total: number; unique: number }) => void) => (() => void) | undefined;
  onRawData: (callback: (packet: any) => void) => void;
  onDisconnected: (callback: (data: { type: string; error?: string }) => void) => void;
  onResetCounters: (callback: () => void) => void;
  resetCounters: () => Promise<any>;
}

export function createSdkService(transport: ReaderTransport): SdkService {
  const resetListeners: (() => void)[] = [];

  return {
    /**
     * Connect to RFID reader via TCP/IP
     */
    connect: async (ip: string, port: number) => {
      return await transport.connectReader({ type: 'tcp', ip, port });
    },

    /**
     * Connect to RFID reader via Serial RS-232/COM
     */
    connectSerial: async (comPort: string, baudRate: number, protocol: string = 'AUTO') => {
      return await transport.connectSerial({ comPort, baudRate, protocol });
    },

    /**
     * Connect to MQTT broker for RFID tag data
     *
     * @param brokerUrl - MQTT broker URL (e.g., mqtt://broker.hivemq.com or mqtts://localhost:8883)
     * @param topic - MQTT topic to subscribe to
     * @param options - Optional connection parameters (username, password, clientId, etc.)
     */
    connectMqtt: async (brokerUrl: string, topic: string, options?: MqttConnectionOptions) => {
      return await transport.connectMqtt(brokerUrl, topic, options);
    },

    /**
     * Publish a message to MQTT broker
     *
     * @param payload - Data to publish (string, Buffer, or object)
     * @param topic - Optional topic to publish to (uses default if not provided)
     */
    publishMqtt: async (payload: any, topic?: string) => {
      return await transport.publishMqtt(payload, topic);
    },

    /**
     * Disconnect from current reader/broker
     */
    disconnect: async () => {
      return await transport.disconnectReader();
    },

    /**
     * Start emitting tag read events from the backend
     */
    startScan: () => {
      return transport.startScan();
    },

    /**
     * Stop emitting tag read events from the backend
     */
    stopScan: () => {
      return transport.stopScan();
    },

    /**
     * Register callback for tag read events
     *
     * @param callback - Function called when RFID tag is detected
     */
    onTagRead: (callback: (tag: any) => void) => {
      transport.onTagRead(callback);
    },

    /**
     * Register callback for cumulative stats updates
     *
     * @param callback - Function called when stats are updated with { total, unique }
     */
    onStats: (callback: (stats: { total: number; unique: number }) => void) => {
      return transport.onStats(callback);
    },

    /**
     * Register callback for raw data stream packets
     *
     * @param callback - Function called for each raw data packet { id, timestamp, direction, data }
     */
    onRawData: (callback: (packet: any) => void) => {
      transport.onRawData(callback);
    },

    /**
     * Register callback for disconnection events
     *
     * @param callback - Function called when reader is disconnected
     */
    onDisconnected: (callback: (data: { type: string; error?: string }) => void) => {
      transport.onDisconnected(callback);
    },

    /**
     * Register callback for counter reset events
     *
     * @param callback - Function called when counters are reset
     */
    onResetCounters: (callback: () => void) => {
      resetListeners.push(callback);
    },

    /**
     * Reset cumulative counters in the SDK (total count and unique tag set)
     * This resets the in-memory session statistics without clearing historical data
     */
    resetCounters: async () => {
      const result = await transport.resetCounters();
      // Notify all listeners
      resetListeners.forEach(cb => cb());
      return result;
    }
  };
}

export const sdkService = createSdkService((window as any).electronAPI as ReaderTransport);