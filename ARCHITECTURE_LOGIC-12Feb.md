# EvolveSDK - Architecture Logic & Implementation Details

## 1. CORE ARCHITECTURE PRINCIPLES

### **Principle 1: Separation of Concerns**

```
┌─────────────────────────────────────────────────────────────┐
│                    EVOLVE SDK                              │
├─────────────────────────────────────────────────────────────┤
│
│  PRESENTATION LAYER (React/GUI)
│  ├─ Responsibility: User interface & interaction
│  ├─ Technology: React, Tailwind CSS
│  ├─ State: LogsContext, ReaderContext, TagContext
│  └─ Does NOT: Direct hardware access, complex business logic
│
├─────────────────────────────────────────────────────────────┤
│
│  APPLICATION LAYER (Electron)
│  ├─ Responsibility: Process management, IPC Bridge
│  ├─ Technology: Electron Main Process
│  ├─ Handles: SDK initialization, message routing
│  └─ Does NOT: Rendering, UI logic
│
├─────────────────────────────────────────────────────────────┤
│
│  SDK LAYER (Business Logic)
│  ├─ Responsibility: Core reader logic, event management
│  ├─ Components: EventBus, Readers, Transports
│  ├─ Technology: Node.js TypeScript
│  └─ Does NOT: UI, IPC (independent of Electron)
│
├─────────────────────────────────────────────────────────────┤
│
│  HARDWARE ABSTRACTION LAYER
│  ├─ Responsibility: Physical device communication
│  ├─ Components: SerialTransport, TCPTransport
│  ├─ Technology: serialport, net module
│  └─ Does NOT: Data parsing, protocol logic
│
├─────────────────────────────────────────────────────────────┤
│
│  HARDWARE LAYER
│  ├─ Serial ports (RS-232/RS-485)
│  ├─ Network sockets (TCP/IP)
│  └─ Physical RFID readers
│
└─────────────────────────────────────────────────────────────┘
```

**Benefits:**
- Each layer can be tested independently
- Layers are replaceable (Electron → Tauri, Browser, etc.)
- SDK can be used outside Electron
- Clean interfaces between layers

---

### **Principle 2: Inversion of Control (IoC) via Event Bus**

```
                Traditional Approach (TIGHTLY COUPLED)
                ────────────────────────────────────

    Reader → Logger       (Reader calls Logger)
    ↓
    Reader → Cache        (Reader calls Cache)
    ↓
    Reader → GUI          (Reader calls GUI)
    
    Problem: Reader knows about all consumers
    Change: Can't add new consumer without modifying reader


                    IoC Approach (LOOSELY COUPLED)
                    ──────────────────────────────

    Reader → EventBus.emit(TAG_DETECTED)
    
    ↓
    
    EventBus broadcasts to ALL subscribers
    ├─ Logger listener
    ├─ Cache listener
    ├─ GUI listener
    └─ Future listeners
    
    Benefit: Reader ONLY knows about EventBus
    Change: Add new listener without touching Reader
```

**Implementation:**
```typescript
// Reader emits
eventBus.emit(SDKEvent.TAG_DETECTED, tagData);

// Any number of subscribers can listen
eventBus.on(SDKEvent.TAG_DETECTED, (data) => {
  logger.log(data);     // Logger
  cache.add(data);      // Cache
  gui.update(data);     // GUI
  // ... unlimited consumers
});
```

---

### **Principle 3: Protocol Abstraction via Interface**

```
Problem: Different readers use different protocols
─────────────────────────────────────────────────

    UF3-S (Sensormatic)
    ├─ Start Scan: 0xAA 0x01 [checksum] 0xFF
    ├─ Stop Scan:  0xAA 0x02 [checksum] 0xFF
    └─ Data: [AA][EPC][RSSI][CRC][FF]
    
    UF3-H (Different)
    ├─ Start Scan: 0x01 0x01 [checksum]
    ├─ Stop Scan:  0x01 0x02 [checksum]
    └─ Data: [01][Type][EPC][RSSI][09]


Solution: Abstract Protocol in Reader Class
──────────────────────────────────────────

    BaseRFIDReader (Abstract)
    ├─ connect()
    ├─ disconnect()
    ├─ startScan()
    └─ stopScan()
    
    ↓ extends
    
    UF3SReader              UF3HReader              FutureReader
    ├─ Implements commands  ├─ Implements commands  ├─ Implements commands
    └─ Parses UF3-S data   └─ Parses UF3-H data   └─ Parses custom data
```

**Benefit:** Same interface for all readers, different implementations

---

### **Principle 4: Multi-Transport Support (Serial, TCP, MQTT)**

```
Problem: Readers in different locations
────────────────────────────────────────

Single facility:           Multiple facilities:      Remote locations:
└─ Serial Port            └─ TCP over LAN           └─ MQTT over Internet
   1-2 readers max           10-50 readers max          Unlimited readers
   Local only               Local network              Global distribution


Solution: ITransport Interface Agnostic to Medium
─────────────────────────────────────────────────

ITransport (Abstract Interface)
│
├─ connect()
├─ disconnect()
├─ send(data)
├─ onData(callback)
└─ isConnected()

└─ Implemented by:
   ├─ SerialTransport → RS-232 port
   ├─ TCPTransport → Network socket
   └─ MQTTTransport → Message broker
   
Reader doesn't know HOW data travels:
┌─────────────────────────────────┐
│ UF3SReader.send(data)          │
│   │                             │
│   └─ transport.send(data)      │
│       (Could be any transport) │
└─────────────────────────────────┘
```

**Benefits:**
- Same reader code for all connection types
- Runtime: Choose transport based on environment
- Add new transport without modifying readers
- Mix multiple readers using different transports

**Example Configuration:**
```
Reader 1: Serial COM3 (Local warehouse)
Reader 2: TCP 192.168.1.50 (LAN factory)
Reader 3: MQTT mqtt://broker.cloud.io (Remote distribution center)
```
All managed by same ReaderManager, same EventBus, same RFID protocol!
```

## 2. DATA FLOW LOGIC

### **Tag Detection Data Flow (Detailed)**

```
STAGE 1: PHYSICAL TRANSMISSION
───────────────────────────────
Time: 0ms - Initial tag RF wave

RFID Tag                      Reader                 Computer
  │                             │
  ├─ [RF Wave] ───────────────> │
  │                             │
                                ├─ Detect
                                │
                                ├─ Extract EPC
                                │
                                ├─ Measure RSSI
                                │
                                └─ Format packet
                                    [AA][EPC][RSSI][CRC][FF]


STAGE 2: TRANSPORT TRANSMISSION
────────────────────────────────
Time: 5ms - Serial/TCP transmission

Reader                        Serial/TCP              Computer
  │                             │                      │
  ├─ [Binary packet] ────────── │ ── Over wire ──────> │
  │                           (Bits)              SerialPort/Socket


STAGE 3: TRANSPORT RECEPTION
──────────────────────────────
Time: 10ms - Raw buffer received

Transport Buffer:
┌─────────────────────────────────────────────────┐
│ [AA 00 26 E2 00 00 17 22 11 01 44 18 90 D5 FF]  │
│    │   │  │                                │ │  │
│    │   │  └─ Length byte (38 bytes)        │ │  └─ Frame end (0xFF)
│    │   └────── Data starts                 │ └─── CRC bytes
│    └─────────── Frame start (0xAA)         └───── Frame end marker
└─────────────────────────────────────────────────┘

Callback triggered:
transport.onData((buffer) => {
  reader.parse(buffer);  // Pass to reader
});


STAGE 4: PROTOCOL PARSING
──────────────────────────
Time: 15ms - Frame analysis

UF3SReader.parse(buffer):
  
  Step 1: Find frame boundaries
  ├─ Search for 0xAA (start)
  ├─ Search for 0xFF (end)
  └─ Extract frame: [AA...FF]
  
  Step 2: Validate structure
  ├─ Check minimum length
  ├─ Verify checksum
  └─ Extract data segment
  
  Step 3: Extract fields
  ├─ Bytes 1-2: Length
  ├─ Bytes 3-20: EPC (Electronic Product Code)
  │   └─ "E2000017221101441890" (hex string)
  ├─ Bytes 21-22: RSSI (Received Signal Strength Indicator)
  │   └─ Convert to dBm: -45 dBm
  ├─ Bytes 23-26: Timestamp
  │   └─ Reader timestamp
  └─ Bytes 27-28: CRC
      └─ Verify checksum
  
  Step 4: Emit event
  └─ EventBus.emit(SDKEvent.TAG_DETECTED, {
       epc: "E2000017221101441890",
       rssi: -45,
       timestamp: Date.now(),
       reader: { id: "reader-1", model: "UF3-S" }
     });


STAGE 5: EVENT EMISSION
────────────────────────
Time: 20ms - Event distributed

EventBus.emit() flow:

  EventBus emits TAG_DETECTED
         ↓
  Loop through listeners
         ├─> Logger.onTagDetected() ──> logs to file
         ├─> Cache.onTagDetected() ──> deduplicates
         ├─> ReaderManager.onTagDetected() ──> broadcasts to IPC
         └─> Stats.onTagDetected() ──> updates counters


STAGE 6: IPC TRANSMISSION
──────────────────────────
Time: 25ms - Send to GUI

ReaderManager listener:

  mainWindow.webContents.send('event:tag-detected', {
    epc: "E2000017221101441890",
    rssi: -45,
    timestamp: 1707000000000,
    count: 1,
    firstSeen: 1707000000000
  });


STAGE 7: GUI STATE UPDATE
──────────────────────────
Time: 30ms - React state change

window.electronAPI.onTagRead((tagData) => {
  // TagContext subscriber
  TagContext.addTag(tagData);
});

TagContext logic:

  const addTag = (tagData) => {
    setTags(prev => {
      const key = tagData.epc;
      const existing = prev.get(key);
      
      if (existing) {
        // Tag already seen - increment count
        return new Map(prev).set(key, {
          ...existing,
          count: existing.count + 1,
          rssi: tagData.rssi,
          lastSeen: tagData.timestamp
        });
      } else {
        // New tag - add to map
        return new Map(prev).set(key, {
          epc: key,
          count: 1,
          rssi: tagData.rssi,
          firstSeen: tagData.timestamp,
          lastSeen: tagData.timestamp
        });
      }
    });
  };


STAGE 8: COMPONENT RE-RENDER
──────────────────────────────
Time: 35ms - React rendering

React detects state change in TagContext
  ↓
TagList component subscribed to tags
  ↓
Component re-renders with new tag
  ↓
Virtual DOM diff: only new row added
  ↓
Real DOM update: insert row at top


STAGE 9: USER SEES DATA
──────────────────────
Time: 50ms - Visual display in browser

Browser renders table row:
┌─────────────┬──────────────────────────────┬───────┬─────────────┐
│ EPC         │ E2000017221101441890         │ -45   │ 2:30:45.123 │
├─────────────┼──────────────────────────────┼───────┼─────────────┤
│ (New row)   │ Count: 1                      │       │             │
└─────────────┴──────────────────────────────┴───────┴─────────────┘

Total latency: 50ms ✓ (Good for real-time application)
```

---

### **Connection Flow (Detailed)**

```
USER INTERACTION
─────────────────
Button: "Connect" clicked
Component: HardwareConnection
State: { type: 'serial', port: 'COM3', baudRate: 115200 }

           ↓

IPC MESSAGE
────────────
Renderer → Main Process

const msg = {
  type: 'command:connect-reader',
  payload: {
    type: 'serial',
    port: 'COM3',
    baudRate: 115200
  }
};

window.electronAPI.connectReader(msg.payload);

Process: IPC transfer via preload.js
Time: ~1ms


MAIN PROCESS HANDLER
─────────────────────
electron-main.cjs ipcMain.handle('connectReader', handler)

Handler logic:

  async connectReader(event, config) {
    try {
      // 1. Validate config
      if (!config.port) throw new Error('Port required');
      
      // 2. Create transport
      const transport = new SerialTransport(
        config.port,
        config.baudRate || 115200
      );
      
      // 3. Create reader (UF3-S protocol)
      const reader = new UF3SReader(
        {
          id: `serial-${config.port}`,
          model: 'UF3-S',
          transport: 'serial',
          address: config.port
        },
        transport
      );
      
      // 4. Register listeners
      const eventBus = reader.getEventBus();
      
      eventBus.on(SDKEvent.CONNECTED, (info) => {
        this.emit('reader:connected', { readerId: info.id });
      });
      
      eventBus.on(SDKEvent.TAG_DETECTED, (data) => {
        this.emit('reader:tag-detected', data);
      });
      
      eventBus.on(SDKEvent.ERROR, (error) => {
        this.emit('reader:error', error);
      });
      
      // 5. Attempt connection
      await reader.connect();
      
      // 6. Store in ReaderManager
      readerManager.addReader(reader);
      
      return { success: true, readerId: reader.info.id };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }


TRANSPORT LAYER
────────────────
SerialTransport.connect()

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.port = new SerialPort({
        path: 'COM3',
        baudRate: 115200,
        autoOpen: false  // Don't auto-open
      });
      
      // Setup handlers
      this.port.on('open', () => {
        console.log('Port opened');
        this.connected = true;
        resolve();
      });
      
      this.port.on('error', (err) => {
        console.error('Port error:', err);
        this.connected = false;
        reject(err);
      });
      
      this.port.on('data', (data) => {
        this.dataCallback?.(data);  // Forward to reader
      });
      
      // Actually open the port
      this.port.open();
    });
  }

Actual port opening:
  Operating System
    ├─ Interact with serial driver
    ├─ Allocate port resource
    ├─ Set baud rate = 115200
    ├─ Set parity = none
    └─ Set data bits = 8


MQTT TRANSPORT LAYER (NEW) 🆕
──────────────────────────────
MQTTTransport.connect()

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 1. Create MQTT client
      const client = mqtt.connect(
        `mqtt://${this.broker}:${this.port}`,
        {
          clientId: this.clientId,
          username: this.username,    // Optional
          password: this.password,    // Optional
          clean: true,               // Session flag
          reconnectPeriod: 5000,     // Auto-reconnect ms
          keepalive: 60              // Ping interval (sec)
        }
      );
      
      // 2. Setup handlers
      client.on('connect', () => {
        console.log('Connected to MQTT broker');
        
        // Subscribe to reader's data topic
        client.subscribe(this.dataTopicPattern, { qos: 1 }, (err) => {
          if (err) return reject(err);
          this.connected = true;
          resolve();
        });
      });
      
      client.on('message', (topic, message) => {
        const buffer = Buffer.from(message);
        this.dataCallback?.(buffer);  // Forward to reader
      });
      
      client.on('error', (err) => {
        console.error('MQTT error:', err);
        this.connected = false;
        reject(err);
      });
      
      client.on('disconnect', () => {
        this.connected = false;
      });
      
      this.client = client;
    });
  }

MQTT Protocol Details:
  ├─ Connection: TCP to broker (port 1883 or 8883 for TLS)
  ├─ Topics:
  │   ├─ Subscribe:  rfid/reader/{readerId}/data
  │   ├─ Data format: JSON → { epc, rssi, timestamp }
  │   └─ QoS: 1 (At least once delivery)
  │
  ├─ Broker: Mosquitto, HiveMQ, AWS IoT, Azure IoT Hub, etc.
  │
  └─ Reconnection:
      ├─ Auto-reconnect if broker unavailable
      ├─ Last Will Testament (LWT) for offline status
      └─ Queued messages with QoS 1


READER INITIALIZATION WITH MQTT
─────────────────────────────────
Same BaseRFIDReader.connect() applies to all transports!

  async connect() {
    try {
      // 1. Update state
      this.state = ReaderState.CONNECTING;
      
      // 2. Emit event
      this.eventBus.emit(SDKEvent.CONNECTING, this.info);
      
      // 3. Bind transport listeners (works for Serial, TCP, MQTT)
      this.transport.onData((data) => this.handleRawData(data));
      this.transport.onError((err) => this.handleError(err));
      
      // 4. Perform actual connection (transport-agnostic)
      await this.transport.connect();
      
      // 5. Update state
      this.state = ReaderState.CONNECTED;
      
      // 6. Emit success event
      this.eventBus.emit(SDKEvent.CONNECTED, this.info);
      
    } catch (err) {
      this.handleError(err);
    }
  }

✨ Key Point: Same code works for ALL transports!
   Reader doesn't care if it's Serial/TCP/MQTT
   Only cares about: connect() → data received → parse data → emit event


EVENT FLOW
──────────
Reader → EventBus → ReaderManager → IPC → GUI

EventBus.emit(SDKEvent.CONNECTED, readerInfo)


TAG DETECTION FLOW: TRANSPORT COMPARISON
─────────────────────────────────────────────

SCENARIO: Reader detects tag with EPC "3000A1B201"

════════════════════════════════════════════════════════════════════════════════

SERIAL PORT (Local, Fastest)
────────────────────────────
TIME  COMPONENT              ACTION
────────────────────────────────────────────────────────────────────────────────
0ms   Reader Hardware        Antenna detects tag
      └─ Generates RF field

2ms   SerialPort            Sends raw frame to COM3
      └─ 115200 baud (11 bits per char) ≈ 10KB/sec

4ms   SerialTransport.onData Receives buffer
      └─ Callback triggers

5ms   UF3SReader.handleData  Extracts "3000A1B201" from frame
      └─ Validates checksum

6ms   EventBus.emit()        Emits TAG_DETECTED event
      └─ Synchronously calls all listeners

7ms   ReaderManager         Deduplicates tag
      └─ Updates TagContext

8ms   React State Update     Re-renders Dashboard
      └─ New tag appears on screen

═══════════════════════════════════════════════════════════════════════════════

TCP SOCKET (Network, Medium Speed)
──────────────────────────────────
TIME  COMPONENT              ACTION
────────────────────────────────────────────────────────────────────────────────
0ms   Reader Hardware        Antenna detects tag
      └─ Generates RF field

2ms   Reader's TCP Client    Connects to ElectronApp:9600
      └─ Sends raw bytes over TCP socket

5ms   TCPTransport.onData    Receives buffer
      └─ Network latency (≈2-3ms avg LAN)

8ms   UF3SReader.handleData  Extracts "3000A1B201" from frame
      └─ Validates checksum

9ms   EventBus.emit()        Emits TAG_DETECTED event
      └─ Synchronous dispatch

11ms  ReaderManager         Deduplicates tag
      └─ Updates TagContext

13ms  React State Update     Re-renders Dashboard
      └─ New tag appears on screen

═══════════════════════════════════════════════════════════════════════════════

MQTT (Cloud/Remote, Slowest but Most Flexible)
───────────────────────────────────────────────
TIME  COMPONENT              ACTION
────────────────────────────────────────────────────────────────────────────────
0ms   Reader Hardware        Antenna detects tag
      └─ Generates RF field

2ms   Reader's MQTT Client   Publishes to "rfid/reader/1/data"
      └─ Broker: mqtt.example.com:1883

5ms   Message in Transit     Network delay (≈20-30ms over internet)
      └─ Includes retransmission if QoS=1

35ms  Broker Receives        mqtt.example.com acknowledges
      └─ QoS=1 guarantee

37ms  MQTTTransport.onData   Receives message JSON
      └─ { epc: "3000A1B201", rssi: -45, timestamp: ... }

38ms  UF3SReader.handleData  Parses JSON payload
      └─ Extracts EPC and RSSI

39ms  EventBus.emit()        Emits TAG_DETECTED event
      └─ Same synchronous dispatch

42ms  ReaderManager         Deduplicates tag
      └─ Updates TagContext

45ms  React State Update     Re-renders Dashboard
      └─ New tag appears on screen

═══════════════════════════════════════════════════════════════════════════════

SUMMARY COMPARISON
──────────────────
Transport   Antenna→Screen   Network Delay  Use Case
─────────────────────────────────────────────────────────────────
Serial      8ms              ~0ms           ✅ Local laboratory
TCP         13ms             2-3ms LAN      ✅ Same building/campus
MQTT        45ms             20-30ms WAN    ✅ Multi-site, cloud backup

KEY INSIGHT 💡
──────────────
Despite network delays:
  ├─ ALL three use SAME frontend code
  ├─ ALL three use SAME EventBus
  ├─ ALL three use SAME ReaderManager deduplication
  ├─ Only DIFFERENT code is in the transport layer
  └─ This is why ITransport abstraction exists!


Implementation detail: TCP reader can be local device OR remote device
  
  Example 1 - Local device with Ethernet:
    TCP 127.0.0.1:9600  → Same room, 2-3ms latency
  
  Example 2 - Remote device in another building:
    TCP 192.168.100.50:9600  → 5-10ms latency (corporate WAN)
  
  Example 3 - MQTT broker for multi-site aggregation:
    MQTT mqtt.company.io  → Readers at 5 sites publish to 1 broker
    → Dashboard subscribes to all topics
    → Real-time synchronized view of ALL readers



  │
  ├─> ReaderManager listener:
  │   └─ mainWindow.webContents.send('reader:connected', {
  │      readerId: readerInfo.id,
  │      model: 'UF3-S',
  │      status: 'connected'
  │    });
  │
  └─> Other listeners (logging, etc.)


GUI RECEPTION
──────────────
React component receives event:

window.electronAPI.onReaderConnected((data) => {
  // Update ReaderContext
  ReaderContext.addReader({
    id: data.readerId,
    model: data.model,
    status: 'connected'
  });
});


GUI STATE UPDATE
─────────────────
ReaderContext.addReader():

  const addReader = (readerInfo) => {
    setConnectedReaders(prev => [...prev, readerInfo]);
  };


COMPONENT RE-RENDER
────────────────────
HardwareConnection component:

  const { connectedReaders } = useReaderContext();
  
  return (
    <div>
      {connectedReaders.map(reader => (
        <div key={reader.id}>
          ✓ {reader.model} connected on {reader.address}
        </div>
      ))}
    </div>
  );


USER SEES RESULT
────────────────
Visual feedback: "✓ Connected: UF3-S on COM3"

Status: CONNECTED ✓
```

---

## 3. ERROR HANDLING LOGIC

### **Error Propagation Strategy**

```
LAYER 1: HARDWARE ERROR
────────────────────────
Physical Reader
  │
  ├─ Scenario: Port doesn't exist
  │   └─ Error: ENOENT (file not found)
  │
  ├─ Scenario: Connection refused
  │   └─ Error: ECONNREFUSED
  │
  └─ Scenario: Timeout waiting for response
      └─ Error: ETIMEDOUT


LAYER 2: TRANSPORT ERROR HANDLING
──────────────────────────────────
SerialTransport.connect():

  this.port.open((err) => {
    if (err) {
      // Catch hardware error
      this.connected = false;
      reject(new Error(`Failed to open ${this.path}: ${err.message}`));
    }
  });

Error becomes a Promise rejection
  │
  └─ Caught in BaseRFIDReader.connect():
      
      try {
        await this.transport.connect();
      } catch (err) {
        this.handleError(err);  // Pass to error handler
      }


LAYER 3: READER ERROR HANDLING
───────────────────────────────
BaseRFIDReader.handleError():

  protected handleError(err: Error): void {
    // 1. Update state
    this.state = ReaderState.ERROR;
    
    // 2. Create SDKError
    const sdkError: SDKError = {
      code: 'CONNECTION_FAILED',
      message: err.message,
      source: this.info.model,
      timestamp: Date.now()
    };
    
    // 3. Emit error event
    this.eventBus.emitError(sdkError);
  }


LAYER 4: EVENTBUS ERROR EMISSION
─────────────────────────────────
EventBus.emitError():

  emitError(error: SDKError): void {
    // 1. Check for listeners
    const listenerCount = this.listenerCount(SDKEvent.ERROR);
    
    if (listenerCount === 0 && this.errorHandlers.size === 0) {
      // Warn if no one listening
      console.warn('Unhandled SDK error:', error);
    }
    
    // 2. Emit to subscribers
    this.emitter.emit(SDKEvent.ERROR, error);
    
    // 3. Call error handlers
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch (handlerErr) {
        console.error('Error in error handler:', handlerErr);
      }
    }
  }


LAYER 5: READER MANAGER HANDLING
─────────────────────────────────
electron-main.cjs:

  reader.getEventBus().on(SDKEvent.ERROR, (error) => {
    // 1. Log error
    logger.error(error);
    
    // 2. Update reader state
    const reader = readerManager.getReader(reader.id);
    if (reader) {
      reader.status = 'error';
      reader.lastError = error;
    }
    
    // 3. Send to GUI
    mainWindow.webContents.send('reader:error', {
      readerId: reader.info.id,
      code: error.code,
      message: error.message
    });
  });


LAYER 6: GUI ERROR HANDLING
────────────────────────────
React component:

  window.electronAPI.onReaderError((error) => {
    // 1. Log error
    LogsContext.addLog(error.message, 'ERROR');
    
    // 2. Show notification
    showErrorNotification(error.message);
    
    // 3. Update reader status
    ReaderContext.updateReaderStatus(
      error.readerId,
      { status: 'error', error: error.message }
    );
  });

MainLayout logs panel shows:
┌──────────────────────────────────────────────┐
│ [14:23:45] [ERROR] Failed to open COM5       │
│                    Port already in use       │
└──────────────────────────────────────────────┘


LAYER 7: USER SEES ERROR
───────────────────────
Visual feedback on UI:
- Red error icon on reader
- Toast notification
- Error message in log panel
```

---

## 4. CONCURRENCY & THREADING LOGIC

### **Current Single-Threaded Model**

```
JavaScript/Node.js is Single-Threaded
──────────────────────────────────────

┌─────────────────────────────────────────┐
│         EVENT LOOP (Single Thread)      │
├─────────────────────────────────────────┤
│                                         │
│  Main Thread                            │
│  ┌─────────────────────────────────┐   │
│  │ 1. Execute synchronous code    │   │
│  │ 2. Check callback queue        │   │
│  │ 3. Execute callbacks           │   │
│  │ 4. Go back to step 1           │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Background:                            │
│  ├─ serialport native binding[worker]  │
│  ├─ Network socket [libuv]             │
│  └─ File I/O [libuv]                   │
│                                         │
└─────────────────────────────────────────┘


Current Architecture:
└─ Main Process (1 thread)
   ├─ SDK EventBus
   ├─ Reader instances
   ├─ Transport connections
   └─ Background I/O (handled by libuv)


Multiple Readers Same Process:
───────────────────────────────
Reader 1 ──┐
           ├─ Shared EventBus
Reader 2 ──┤
           ├─ Shared main thread
Reader 3 ──┤
           └─ Tag events queued

⚠️ Issue: High volume tags can:
  ├─ Queue overflow
  ├─ Memory spike
  └─ Event lag
```

---

### **Potential Future: Worker Threads (Advanced)**

```
├─ Main Thread (IPC, UI control)
│
├─ Worker Thread 1 (Reader 1)
│   └─ EventBus for tags
│
├─ Worker Thread 2 (Reader 2)
│   └─ EventBus for tags
│
└─ Aggregator Thread (Collect & relay)
    └─ Consolidates events to GUI
```

---

## 5. STATE CONSISTENCY LOGIC

### **How State Stays In Sync**

```
TWO-STATE MODEL
───────────────

Backend State (SQL/Memory):
  ├─ ReaderManager.readers Map
  ├─ Tag cache (deduped)
  └─ Connection status

Frontend State (React):
  ├─ ReaderContext
  ├─ TagContext
  └─ LogsContext


STATE CONSISTENCY MECHANISM
────────────────────────────

Write: Backend State Change
       ↓
       └─ Emit IPC event
           ├─ "reader:connected"
           ├─ "reader:disconnected"
           ├─ "reader:tag-detected"
           └─ "reader:error"

Read: React Component
      ↓
      └─ Listen via window.electronAPI.onXxx()
          ├─ Update Context state
          ├─ Trigger re-render
          └─ UI reflects backend state


Not Bidirectional - IMPORTANT
──────────────────────────────
Backend → Frontend: Yes (IPC events)
Frontend → Backend: Yes (IPC calls)

BUT NOT AUTOMATIC SYNC:
├─ Frontend: user clicks "Start Read"
│           └─ Calls IPC command
│               └─ Backend: executes startScan()
│                   └─ Emits IPC: "reader:scanning"
│                       └─ Frontend: updates state

Without careful IPC handlers:
├─ User clicks "Start"
├─ Frontend updates local state immediately
├─ But backend might fail!
├─ State mismatch!

SOLUTION: Always wait for backend response
──────────────────────────────────────────
async handleStartRead() {
  try {
    // 1. Call backend
    const result = await window.electronAPI.startScan();
    
    // 2. Only update if successful
    if (result.success) {
      setScanning(true);
    } else {
      setScanning(false);
      showError(result.error);
    }
  } catch (err) {
    setScanning(false);
    showError(err.message);
  }
}
```

---

## 6. MEMORY MANAGEMENT LOGIC

### **Current Memory Controls**

```
LOGS CONTEXT
────────────
└─ Circular buffer: Last 1000 logs

  addLog((message, type) => {
    setLogs(prev => [
      ...prev.slice(-999),  // ← Drop oldest if > 1000
      newLog
    ]);
  });

Memory impact:
  ├─ Per log: ~200 bytes
  ├─ Max logs: 1000
  └─ Max memory: ~200 KB ✓ Acceptable


TAG CONTEXT (Future Implementation)
─────────────────────────────────────
└─ Map<epc, TagData>

Not bounded yet - future needs:
  ├─ Size limit: 10,000 tags max
  ├─ Age limit: Remove tags > 1 hour old
  └─ Persistence: Save to SQLite


READER MANAGER (Future)
───────────────────────
└─ Map<readerId, Reader>

Per reader:
  ├─ Reader instance: ~50 KB
  ├─ EventBus: ~10 KB
  ├─ Transport buffer: 64 KB
  └─ Total per reader: ~124 KB

With 10 readers: ~1.24 MB ✓ Acceptable

TOTAL SYSTEM:
  ├─ Electron: ~100 MB (base)
  ├─ React/GUI: ~50 MB
  ├─ SDK code: ~2 MB
  ├─ Logs: ~0.2 MB
  ├─ Readers (10): ~1.24 MB
  ├─ Tags (10k): ~2 MB
  └─ Total: ~155 MB (reasonable for modern systems)
```

---

## 7. TESTING STRATEGY

### **Test Pyramid**

```
                        ▲
                       ╱ ╲
                      ╱   ╲  E2E Tests (Complex user flows)
                     ╱ ┌─┐ ╲ - Full app integration
                    ╱  │ │  ╱ - Multiple readers
                   ╱┌──┴─┴──╲
                  ╱ │   ╱ ╲  │ Integration Tests
                 ╱  │  ╱   ╲ │ - Reader + Transport
                ╱───┼─────────╲ - EventBus + Readers
               ╱ ┌──┴──┬───┐   ╱
              ╱  │Inte┼gra│   ╱
             ╱┌──┴────┴───┴──╲
            ╱ │   ╱ ╱ ╲ ╲    │  Unit Tests (Isolated)
           ╱  │  ╱ ╱   ╲ ╲   │  - EventBus logic
          ╱───┴─────────────┘   - Parser functions
                                 - Type validation
```

**Current Test Coverage:**

| Layer | Tests | Status |
|-------|-------|--------|
| **Unit** | EventBus (✅ 12/12) | ✅ Complete |
| **Unit** | SerialTransport | ✅ Complete |
| **Integration** | Serial + UF3SReader | ✅ Complete |
| **Integration** | TCP + UF3SReader | 📋 TODO |
| **E2E** | Full app flow | 📋 TODO |

---

## 8. DEPLOYMENT LOGIC

### **Build & Distribution**

```
Development Build
─────────────────
npm run dev
  │
  ├─ GUI: Vite dev server (hot reload)
  ├─ SDK: ts-node (real-time compile)
  └─ Electron: Auto-reload

Development Directory:
  ./gui/dist/  (Vite output)
  ./sdk/dist/  (TypeScript output)
  ./node_modules/  (Dependencies)


Production Build
────────────────
npm run build
  │
  ├─ GUI Build:
  │   ├─ vite build (minify, bundle)
  │   └─ gui/dist/index.html
  │
  ├─ SDK Build:
  │   ├─ tsup (bundle + minify)
  │   └─ sdk/dist/index.js
  │
  └─ Package:
      ├─ electron-builder
      ├─ Output: .exe (Windows)
      ├─ Output: .dmg (macOS)
      └─ Output: .AppImage (Linux)


Distribution Method
─────────────────
Electron Auto-Update:
  ├─ Check for new version on startup
  ├─ Download if available
  ├─ Install & restart
  └─ User sees update notification


File Structure in App:
──────────────────────
EvolveSDK.exe
  │
  ├─ resources/
  │   ├─ app.asar (all code)
  │   │   ├─ gui/
  │   │   ├─ sdk/
  │   │   └─ electron/
  │   └─ native-modules/
  │       └─ serialport.node (compiled native)
  │
  ├─ Update/
  │   └─ Cached updates
  │
  └─ User Data/
      ├─ config/
      ├─ logs/
      └─ cache/
```

---

This architecture logic document completes the system understanding. The key takeaway is the layered, event-driven design that separates concerns and maintains loose coupling.
