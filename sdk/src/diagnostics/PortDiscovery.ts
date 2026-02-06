import { SerialTransport } from '../transports/SerialTransport';
import { TCPTransport } from '../transports/TCPTransport';
import { ReaderInfo } from '../types/reader';

/**
 * Port Discovery Utility
 * Helps discover and list available serial and TCP ports
 */
export class PortDiscovery {
  /**
   * List all available serial ports
   */
  static async listSerialPorts(): Promise<Array<{ path: string; manufacturer?: string }>> {
    try {
      return await SerialTransport.listPorts();
    } catch (err) {
      console.error('Error listing serial ports:', err);
      return [];
    }
  }

  /**
   * Scan for TCP readers on a network range
   * @param startIP - Starting IP address (e.g., "192.168.1.1")
   * @param endIP - Ending IP address (e.g., "192.168.1.255")
   * @param port - Port to scan (default 8088 for UF3-S)
   * @param timeout - Connection timeout in ms (default 1000)
   */
  static async scanTCPNetwork(
    startIP: string,
    endIP: string,
    port: number = 8088,
    timeout: number = 1000
  ): Promise<ReaderInfo[]> {
    const foundReaders: ReaderInfo[] = [];
    const ips = this.generateIPRange(startIP, endIP);

    const scanPromises = ips.map((ip) =>
      this.testTCPConnection(ip, port, timeout)
        .then((success) => {
          if (success) {
            foundReaders.push({
              id: `tcp-${ip}-${port}`,
              model: 'UF3-S',
              transport: 'tcp',
              address: ip,
              port,
            });
          }
        })
        .catch(() => {
          // Silent fail, continue scanning
        })
    );

    await Promise.all(scanPromises);
    return foundReaders;
  }

  /**
   * Test TCP connection to a specific address
   */
  private static testTCPConnection(
    host: string,
    port: number,
    timeout: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeout);

      const transport = new TCPTransport(host, port);
      transport
        .connect()
        .then(() => {
          clearTimeout(timer);
          transport.disconnect();
          resolve(true);
        })
        .catch(() => {
          clearTimeout(timer);
          resolve(false);
        });
    });
  }

  /**
   * Generate array of IP addresses from range
   */
  private static generateIPRange(startIP: string, endIP: string): string[] {
    const ips: string[] = [];
    const [start1, start2, start3, start4] = startIP.split('.').map(Number);
    const [end1, end2, end3, end4] = endIP.split('.').map(Number);

    for (let i = start4; i <= end4; i++) {
      ips.push(`${start1}.${start2}.${start3}.${i}`);
    }

    return ips;
  }

  /**
   * Get suggested reader configuration from discovered port
   */
  static createReaderInfo(
    path: string,
    model: string = 'UF3-S',
    transport: 'serial' | 'tcp' = 'serial'
  ): ReaderInfo {
    return {
      id: `${transport}-${path}`,
      model,
      transport,
      address: path,
      ...(transport === 'tcp' && { port: 8088 }),
    };
  }
}
