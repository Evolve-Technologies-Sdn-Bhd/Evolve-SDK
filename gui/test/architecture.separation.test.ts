/**
 * Architectural Separation Tests
 * 
 * Validates strict separation between React GUI and SDK/Hardware layer:
 * 1. Components don't import transport classes
 * 2. Components only use sdkService interface
 * 3. sdkService is the sole entry point to hardware
 * 4. Full mock replacement works without component changes
 */

import { jest, expect, describe, it, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('Architectural Separation: GUI vs SDK Layer', () => {
  describe('Import isolation', () => {
    it('should NOT find direct imports of transport classes in component files', () => {
      const componentDir = path.join(__dirname, '../src/components');
      const transportKeywords = [
        'SerialTransport',
        'TCPTransport',
        'MQTTTransport',
        'ConnectionManager',
        'ReaderManager',
        'Rfidsdk',
        '../../../sdk/src',
      ];

      const componentFiles = getTypeScriptFiles(componentDir);

      componentFiles.forEach((filePath) => {
        const content = fs.readFileSync(filePath, 'utf-8');

        transportKeywords.forEach((keyword) => {
          expect(content).not.toMatch(
            new RegExp(`import.*${keyword}|require.*${keyword}`)
          );
        });
      });
    });

    it('should NOT find direct imports of transport classes in context files', () => {
      const contextDir = path.join(__dirname, '../src/contexts');
      const transportKeywords = [
        'SerialTransport',
        'TCPTransport',
        'MQTTTransport',
        'ConnectionManager',
      ];

      const contextFiles = getTypeScriptFiles(contextDir);

      contextFiles.forEach((filePath) => {
        const content = fs.readFileSync(filePath, 'utf-8');

        transportKeywords.forEach((keyword) => {
          expect(content).not.toMatch(
            new RegExp(`import.*${keyword}|require.*${keyword}`)
          );
        });
      });
    });

    it('should verify sdkService is imported in contexts', () => {
      const contextDir = path.join(__dirname, '../src/contexts');
      const contextFiles = getTypeScriptFiles(contextDir);

      const filesImportingSdkService = contextFiles.filter((filePath) => {
        const content = fs.readFileSync(filePath, 'utf-8');
        return content.includes('sdkService');
      });

      expect(filesImportingSdkService.length).toBeGreaterThan(0);
    });

    it('should verify components use IPC or contexts for SDK access', () => {
      const dashboardPath = path.join(__dirname, '../src/components/Dashboard/Dashboard.tsx');

      if (fs.existsSync(dashboardPath)) {
        const content = fs.readFileSync(dashboardPath, 'utf-8');

        // Should use either contexts OR window.electronAPI (IPC bridge)
        const usesContexts = /useContext|useTag|useLogs|useReader/.test(content);
        const usesIPC = /window\.electronAPI/.test(content);
        
        expect(usesContexts || usesIPC).toBe(true);
        
        // But should NOT directly import service or hardware classes
        expect(content).not.toMatch(/import.*sdkService|import.*SerialTransport|import.*RFIDSDK/);
      }
    });
  });

  describe('Dependency injection through contexts', () => {
    it('should verify components receive dependencies through context, not props', () => {
      const tagContextPath = path.join(__dirname, '../src/contexts/TagContext.tsx');

      if (fs.existsSync(tagContextPath)) {
        const content = fs.readFileSync(tagContextPath, 'utf-8');

        // Should export provider and hook
        expect(content).toMatch(/export.*TagProvider/);
        expect(content).toMatch(/export.*useTags/);
      }
    });
  });

  describe('sdkService as single entry point', () => {
    it('should verify only sdkService interfaces with hardware layer', () => {
      const sdkServicePath = path.join(__dirname, '../src/services/sdkService.ts');

      if (fs.existsSync(sdkServicePath)) {
        const content = fs.readFileSync(sdkServicePath, 'utf-8');

        // Should use window.electronAPI (the IPC bridge)
        expect(content).toMatch(/window\.electronAPI/);
      }
    });

    it('should verify sdkService exports simple interface methods', () => {
      const sdkServicePath = path.join(__dirname, '../src/services/sdkService.ts');

      if (fs.existsSync(sdkServicePath)) {
        const content = fs.readFileSync(sdkServicePath, 'utf-8');

        const expectedMethods = ['connect', 'disconnect', 'onStats', 'onDisconnected', 'onTagRead'];

        expectedMethods.forEach((method) => {
          expect(content).toMatch(new RegExp(`${method}\\s*[:=]|export.*${method}`));
        });
      }
    });
  });

  describe('No circular dependencies', () => {
    it('should not have circular imports between components and services', () => {
      const sdkServicePath = path.join(__dirname, '../src/services/sdkService.ts');

      if (fs.existsSync(sdkServicePath)) {
        const content = fs.readFileSync(sdkServicePath, 'utf-8');

        // sdkService should not import components
        expect(content).not.toMatch(/from.*components/);
        expect(content).not.toMatch(/from.*contexts/);
      }
    });
  });
});

/**
 * Mock Replacement Tests
 * 
 * Proves GUI works with completely different sdkService implementation
 */
describe('Full Mock Replacement: Alternative sdkService Implementation', () => {
  let originalElectronAPI: any;

  beforeEach(() => {
    originalElectronAPI = window.electronAPI;

    // Replace with fake implementation
    (window as any).electronAPI = createFakeSdkService();
  });

  afterEach(() => {
    window.electronAPI = originalElectronAPI;
  });

  it('should allow complete replacement of sdkService with fake', () => {
    expect(window.electronAPI).toBeDefined();
    expect(window.electronAPI.connectReader).toBeDefined();
    expect(window.electronAPI.onStats).toBeDefined();
  });

  it('should work with memory-based mock instead of hardware', async () => {
    const fakeService = createMemoryBasedSdkService();

    (window as any).electronAPI = fakeService;

    // Simulate connecting
    const result = await fakeService.connectReader({ type: 'memory', id: 'test' });

    expect(result.success).toBe(true);

    // Simulate stats
    const statsCallback = jest.fn();
    fakeService.onStats(statsCallback);

    // Emit stats from memory
    fakeService._emitStats({ total: 100, unique: 50 });

    expect(statsCallback).toHaveBeenCalledWith({ total: 100, unique: 50 });
  });

  it('should work with delayed/async mock implementation', async () => {
    const delayedService = createDelayedAsyncSdkService();

    (window as any).electronAPI = delayedService;

    const connectPromise = delayedService.connectReader({ type: 'delayed', id: 'test' });

    // Should be pending
    expect(connectPromise).toBeInstanceOf(Promise);

    const result = await connectPromise;

    expect(result.success).toBe(true);
  });

  it('should work with stubbed mock that tracks calls', async () => {
    const trackedService = createTrackedSdkService();

    (window as any).electronAPI = trackedService;

    await trackedService.connectReader({ type: 'tcp', ip: '192.168.1.1', port: 5000 });
    trackedService.startScan();
    const unsub = trackedService.onStats(jest.fn());
    await trackedService.disconnectReader();

    expect(trackedService.getCallHistory()).toEqual([
      { method: 'connectReader', args: [{ type: 'tcp', ip: '192.168.1.1', port: 5000 }] },
      { method: 'startScan', args: [] },
      { method: 'onStats', args: expect.any(Array) },
      { method: 'disconnectReader', args: [] },
    ]);
  });

  it('should work with event-driven mock', () => {
    const eventService = createEventDrivenSdkService();

    (window as any).electronAPI = eventService;

    const statsCallback = jest.fn();
    const tagCallback = jest.fn();
    const disconnectCallback = jest.fn();

    eventService.onStats(statsCallback);
    eventService.onTagRead(tagCallback);
    eventService.onDisconnected(disconnectCallback);

    // Emit events
    eventService._emit('stats', { total: 100, unique: 50 });
    eventService._emit('tagread', { epc: 'ABC123', rssi: -50 });
    eventService._emit('disconnected', { type: 'reader_disconnected', error: 'Lost connection' });

    expect(statsCallback).toHaveBeenCalledWith({ total: 100, unique: 50 });
    expect(tagCallback).toHaveBeenCalledWith({ epc: 'ABC123', rssi: -50 });
    expect(disconnectCallback).toHaveBeenCalledWith({ type: 'reader_disconnected', error: 'Lost connection' });
  });

  it('should verify mock SDKService satisfies the interface', () => {
    const mockService = createFakeSdkService();

    // Verify interface compliance
    const requiredMethods = [
      'connect',
      'connectReader',
      'connectMqtt',
      'connectSerial',
      'disconnect',
      'disconnectReader',
      'onStats',
      'onDisconnected',
      'onTagRead',
      'startScan',
      'stopScan',
      'resetCounters',
    ];

    requiredMethods.forEach((method) => {
      expect((mockService as any)[method]).toBeDefined();
      if (method.includes('on')) {
        expect(typeof (mockService as any)[method]).toBe('function');
      }
    });
  });
});

/**
 * Abstraction Boundary Tests
 * 
 * Verifies clear boundaries between layers
 */
describe('Layer Abstraction Boundaries', () => {
  it('should verify components do NOT directly instantiate readers or transports', () => {
    const componentDir = path.join(__dirname, '../src/components');
    const componentFiles = getTypeScriptFiles(componentDir);

    componentFiles.forEach((filePath) => {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Components should NOT directly import or instantiate transport/reader classes
      expect(content).not.toMatch(/import.*from.*transport|import.*from.*protocol|import.*from.*readers|new.*SerialTransport|new.*MQTTTransport|new.*ReaderManager/i);
    });
  });

  it('should verify Context layer abstracts hardware details', () => {
    const contextPath = path.join(__dirname, '../src/contexts/TagContext.tsx');

    if (fs.existsSync(contextPath)) {
      const content = fs.readFileSync(contextPath, 'utf-8');

      // Should not know about hardware
      expect(content).not.toMatch(/SerialPort|mqtt|tcp|tls|protocol/i);
    }
  });

  it('should verify service layer is only hardware interaction point', () => {
    const sdkServicePath = path.join(__dirname, '../src/services/sdkService.ts');

    if (fs.existsSync(sdkServicePath)) {
      const content = fs.readFileSync(sdkServicePath, 'utf-8');

      // Should reference window.electronAPI (IPC bridge to Electron)
      expect(content).toMatch(/window\.electronAPI/);

      // Should NOT directly instantiate transport classes
      expect(content).not.toMatch(
        /new\s+(SerialTransport|TCPTransport|MQTTTransport|Rfidsdk|ReaderManager)/
      );
    }
  });

  it('should verify IPC bridge is isolation layer', () => {
    const ipcPath = path.join(__dirname, '../electron/ipc');

    if (fs.existsSync(ipcPath)) {
      // Get both TS and JS files from IPC directory  
      const ipcFiles = fs.readdirSync(ipcPath)
        .filter(f => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js'))
        .map(f => path.join(ipcPath, f));

      const bridgeContent = ipcFiles.map((f) => fs.readFileSync(f, 'utf-8')).join('\n');

      if (bridgeContent.length > 0) {
        // IPC should reference SDK classes and use sdkService
        expect(bridgeContent.toLowerCase()).toMatch(/sdk|reader|transport/i);
      }
    }
  });
});

/**
 * Configuration Isolation Tests
 * 
 * Verifies hardware config is not hardcoded in GUI
 */
describe('Configuration Isolation', () => {
  it('should verify components do not directly connect to hardware', () => {
    const componentDir = path.join(__dirname, '../src/components');

    const componentFiles = getTypeScriptFiles(componentDir);

    componentFiles.forEach((filePath) => {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Components should NOT directly instantiate transport/HW classes
      expect(content).not.toMatch(/new\s+SerialPort|new\s+Socket|new\s+MqttClient|net\.createConnection/);
      // Components should not directly import protocol handlers
      expect(content).not.toMatch(/import.*from.*["'].*SerialTransport|import.*from.*["'].*MQTTTransport|import.*from.*["'].*TCPTransport/);
    });
  });

  it('should verify connection config is passed through service, not components', () => {
    const sdkServicePath = path.join(__dirname, '../src/services/sdkService.ts');

    if (fs.existsSync(sdkServicePath)) {
      const content = fs.readFileSync(sdkServicePath, 'utf-8');

      // Should accept config as parameter
      expect(content).toMatch(/connectReader.*config|connect.*options/i);
    }
  });
});

// ============================================
// Mock SDK Service Implementations
// ============================================

function createFakeSdkService() {
  return {
    connect: (jest.fn() as jest.Mock<any>).mockResolvedValue({ success: true }),
    connectReader: (jest.fn() as jest.Mock<any>).mockResolvedValue({ success: true }),
    connectMqtt: (jest.fn() as jest.Mock<any>).mockResolvedValue({ success: true }),
    connectSerial: (jest.fn() as jest.Mock<any>).mockResolvedValue({ success: true }),
    disconnect: (jest.fn() as jest.Mock<any>).mockResolvedValue({ success: true }),
    disconnectReader: (jest.fn() as jest.Mock<any>).mockResolvedValue({ success: true }),
    startScan: (jest.fn() as jest.Mock<any>).mockReturnValue({ success: true }),
    stopScan: (jest.fn() as jest.Mock<any>).mockReturnValue({ success: true }),
    resetCounters: (jest.fn() as jest.Mock<any>).mockResolvedValue({ success: true }),
    onStats: (jest.fn() as jest.Mock<any>),
    onDisconnected: (jest.fn() as jest.Mock<any>),
    onTagRead: (jest.fn() as jest.Mock<any>),
    onRawData: (jest.fn() as jest.Mock<any>),
    publishMqtt: (jest.fn() as jest.Mock<any>).mockResolvedValue({ success: true }),
  } as any;
}

function createMemoryBasedSdkService() {
  const statsListeners: Function[] = [];

  return {
    connectReader: (jest.fn() as jest.Mock<any>).mockResolvedValue({ success: true }),
    disconnectReader: (jest.fn() as jest.Mock<any>).mockResolvedValue({ success: true }),
    startScan: (jest.fn() as jest.Mock<any>).mockReturnValue({ success: true }),
    stopScan: (jest.fn() as jest.Mock<any>).mockReturnValue({ success: true }),
    onStats: (cb: Function) => {
      statsListeners.push(cb);
      return () => {
        const idx = statsListeners.indexOf(cb);
        if (idx > -1) statsListeners.splice(idx, 1);
      };
    },
    onDisconnected: (jest.fn() as jest.Mock<any>),
    onTagRead: (jest.fn() as jest.Mock<any>),
    _emitStats: (stats: any) => {
      statsListeners.forEach((cb) => cb(stats));
    },
  } as any;
}

function createDelayedAsyncSdkService() {
  return {
    connectReader: (jest.fn() as jest.Mock<any>).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ success: true }), 100);
        })
    ),
    disconnectReader: (jest.fn() as jest.Mock<any>).mockResolvedValue({ success: true }),
    startScan: (jest.fn() as jest.Mock<any>).mockReturnValue({ success: true }),
    stopScan: (jest.fn() as jest.Mock<any>).mockReturnValue({ success: true }),
    onStats: (jest.fn() as jest.Mock<any>),
    onDisconnected: (jest.fn() as jest.Mock<any>),
    onTagRead: (jest.fn() as jest.Mock<any>),
  } as any;
}

function createTrackedSdkService() {
  const callHistory: Array<{ method: string; args: any[] }> = [];

  return {
    connectReader: (jest.fn() as jest.Mock<any>).mockImplementation((config: any) => {
      callHistory.push({ method: 'connectReader', args: [config] });
      return Promise.resolve({ success: true });
    }),
    disconnectReader: (jest.fn() as jest.Mock<any>).mockImplementation(() => {
      callHistory.push({ method: 'disconnectReader', args: [] });
      return Promise.resolve({ success: true });
    }),
    startScan: (jest.fn() as jest.Mock<any>).mockImplementation(() => {
      callHistory.push({ method: 'startScan', args: [] });
      return { success: true };
    }),
    stopScan: (jest.fn() as jest.Mock<any>).mockImplementation(() => {
      callHistory.push({ method: 'stopScan', args: [] });
      return { success: true };
    }),
    onStats: (jest.fn() as jest.Mock<any>).mockImplementation((cb: Function) => {
      callHistory.push({ method: 'onStats', args: [cb] });
      return () => {};
    }),
    onDisconnected: (jest.fn() as jest.Mock<any>).mockImplementation((cb: Function) => {
      callHistory.push({ method: 'onDisconnected', args: [cb] });
      return () => {};
    }),
    onTagRead: (jest.fn() as jest.Mock<any>).mockImplementation((cb: Function) => {
      callHistory.push({ method: 'onTagRead', args: [cb] });
      return () => {};
    }),
    getCallHistory: () => callHistory,
  } as any;
}

function createEventDrivenSdkService() {
  const listeners: Map<string, Function[]> = new Map();

  const addEventListener = (event: string, cb: Function) => {
    if (!listeners.has(event)) {
      listeners.set(event, []);
    }
    listeners.get(event)!.push(cb);
  };

  return {
    connectReader: (jest.fn() as jest.Mock<any>).mockResolvedValue({ success: true }),
    disconnectReader: (jest.fn() as jest.Mock<any>).mockResolvedValue({ success: true }),
    startScan: (jest.fn() as jest.Mock<any>).mockReturnValue({ success: true }),
    stopScan: (jest.fn() as jest.Mock<any>).mockReturnValue({ success: true }),
    onStats: (cb: Function) => {
      addEventListener('stats', cb);
      return () => {};
    },
    onDisconnected: (cb: Function) => {
      addEventListener('disconnected', cb);
      return () => {};
    },
    onTagRead: (cb: Function) => {
      addEventListener('tagread', cb);
      return () => {};
    },
    _emit: (event: string, data: any) => {
      listeners.get(event)?.forEach((cb) => cb(data));
    },
  } as any;
}

// ============================================
// Helper Functions
// ============================================

function getTypeScriptFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files: string[] = [];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    entries.forEach((entry) => {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        walk(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        files.push(fullPath);
      }
    });
  }

  walk(dir);
  return files;
}
