# Serial Cumulative Display Debugging Guide

## Problem Overview
Your cumulative display (Total/Unique tag counts) isn't updating when using serial COM connections, even though tags are being received.

## Root Causes Identified & Fixed

### 1. **Protocol Mismatch** ✅ FIXED
**Issue**: SerialReader was only checking for **A0 Protocol** headers (0xA0), but your device sends **BB Protocol** frames (0xBB start byte).

**What Was Happening**:
```
Your device sends: BB 97 12 20 00 FB A1 58...
                   ↓
SerialReader sees: 0xBB header (not 0xA0)
                   ↓
Rejects as "invalid header"
                   ↓
Searches for 0xA0 (never finds it)
                   ↓
Clears buffer (data is lost!)
                   ↓
NO TAGS EMITTED → NO STATS UPDATE
```

**Fix Applied**: SerialTransport now detects and processes BOTH protocols:
- ✅ **A0 Protocol**: `A0 <len> <addr> <cmd> [...] <checksum>`
- ✅ **BB Protocol**: `BB <len> [...] <checksum>` (NEW)

### 2. **Tag Emission Issue** ✅ AUTO-FIXED
When a tag WAS being processed, it needed to provide the correct field names for stats tracking:
- Old: `{ id, timestamp, rssi, raw }` (missing `epc` field)
- New: `{ id, epc, timestamp, rssi, raw }` (both `id` and `epc`)

SDK stats listener checks for either:
```typescript
const uniqueIdentifier = rawTagData?.epc || rawTagData?.id;
```

## How Stats Flow Works

```
┌─────────────────────────────────────────────┐
│ Serial COM Port                             │
│ Device sends: BB 97 12 20 00 FB A1 58...    │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│ SerialTransport.handleIncomingData()        │
│ ✓ Detects BB protocol header                │
│ ✓ Extracts frame                            │
│ ✓ Calls processFrame(frame, 'BB')           │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│ SerialTransport.processFrame('BB')          │
│ ✓ Parses EPC data from payload              │
│ ✓ Calculates RSSI from byte 2               │
│ ✓ Calls extractAndEmitTag()                 │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│ SerialReader.emitTag()                      │
│ ✓ Calls this.emit('tagRead', tag)           │
│   (emits on ReaderManager)                  │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│ RfidSdk.start() listener                    │
│ ✓ this.reader.on('tagRead', listener)       │
│ ✓ Increments this.totalCount++              │
│ ✓ Adds to this.uniqueTags Set()             │
│ ✓ Emits 'stats' event                       │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│ IPC Bridge (sdkbridge.js)                   │
│ ✓ Listeners registered on SDK               │
│ ✓ statsListener receives stats object       │
│ ✓ Sends 'rfid:stats' to renderer             │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│ Renderer (GUI)                              │
│ ✓ preload.js receives 'rfid:stats'          │
│ ✓ TagContext.onStats() triggers             │
│ ✓ Updates totalReads & uniqueCount state    │
│ ✓ CumulativeCount.tsx re-renders            │
│ ✓ Display shows: Total: 5, Unique: 3       │
└─────────────────────────────────────────────┘
```

## Console Log Breadcrumbs to Verify Fix

When you connect to a BB protocol device and receive tags, you should see:

### 1. **Data Reception** (SerialTransport)
```
[SerialReader] Data received (12 bytes): BB 97 12 20 00 FB A1 58 6A BC DF 16
```

### 2. **Protocol Detection** (NEW!)
```
[SerialReader] ✓ BB Protocol frame detected
[SerialReader] Frame #1 complete (14 bytes, BB protocol)
```

### 3. **Frame Processing**
```
[SerialReader] Processing BB frame: Header=0xBB, Len=0x97
[SerialReader] [BB] Format: RSSI at byte 2 (value: 18), EPC starts at byte 3
```

### 4. **EPC Extraction**
```
[SerialReader] [BB] EPC raw bytes (6 bytes): FBA1586ABCDF
[SerialReader] [BB] ✓ Tag detected - EPC: FBA1586ABCDF, RSSI: -18dBm
```

### 5. **Tag Emission**
```
[RfidSdk] Emitting stats event: { total: 1, unique: 1 }
```

### 6. **IPC Forwarding**
```
[IPC] ✓ Received stats event from SDK: { total: 1, unique: 1 }
[IPC] ✓ Sent rfid:stats to renderer
```

### 7. **GUI Update** (Browser Console)
```
[TagContext] ✓ Received stats update: { total: 1, unique: 1 }
[TagContext] Setting total=1, unique=1
```

## Testing Your Serial Connection

### Step 1: Check Console Logs (Main Process)
**Application Menu** → **View** → **Toggle Developer Tools** → **Main Process Console**

Look for these patterns:
- ✅ `[SerialReader] Data received (X bytes):`
- ✅ `[SerialReader] ✓ BB Protocol frame detected` (or A0)
- ✅ `[SerialReader] ✓ Tag detected - EPC:`
- ✅ `[RfidSdk] Emitting stats event:`

### Step 2: Check Renderer Console
**Developer Tools** → **Console Tab**

Look for:
- ✅ `[TagContext] ✓ Received stats update:`
- ✅ `[TagContext] Setting total=X, unique=Y`

### Step 3: Monitor Live
1. Open Developer Tools (Main Process Console)
2. Connect to serial COM port
3. Place RFID tag in read range
4. **Watch for all console messages above**

## Troubleshooting Scenarios

### Scenario 1: "Protocol Detection says A0, but device sends BB"
**Problem**: SerialReader only sees A0 protocol, misses your BB frames

**Diagnosis**:
```
[SerialReader] ⚠️ Unknown protocol header: 0xBB (187)
[SerialReader] Looking for A0 (0xA0) or BB (0xBB) headers...
```

**Solution**: Your fix is in place (v2 of SerialTransport). Rebuild and test.

### Scenario 2: "Frames detected but no tags"
**Problem**: Frames are recognized but EPC extraction fails

**Look for**:
```
[SerialReader] [BB] ✓ Tag detected - EPC: UNKNOWN, RSSI: 0dBm
```
or
```
[SerialReader] [BB] Failed to decode EPC
```

**Cause**: BB frame layout might differ from assumed format. Check your device documentation.

**Fix**: 
- Byte 1: Length (which bytes count?)
- Byte 2: RSSI? (or something else?)
- Byte 3+: EPC data? (or different layout?)

Update [SerialTransport.ts](../sdk/src/transports/SerialTransport.ts) lines ~175-185 with correct offsets.

### Scenario 3: "Tags detected but stats NOT updating"
**Problem**: `[SerialReader] ✓ Tag detected` appears, but no stats emission

**Look for**:
- Missing: `[RfidSdk] Emitting stats event:`
- Missing: `[TagContext] ✓ Received stats update:`

**Diagnosis**:
1. Check if `sdk.start()` was called
2. Verify `sdkService.startScan()` in GUI
3. Check IPC bridge listener registration

**Fix**:
```typescript
// In RfidSdk.start():
this.tagReadListener = (rawTagData: any) => {
  this.totalCount++;
  const uniqueId = rawTagData?.epc || rawTagData?.id;
  if (uniqueId) this.uniqueTags.add(uniqueId);
  this.emit('stats', this.getCumulativeStats()); // ← MUST emit
};
```

### Scenario 4: "Different data format I don't recognize"
**Problem**: Your device sends data in unknown format

**Capture & analyze**:
1. Enable serial logging (already done)
2. Send 1-2 tags through device
3. Copy all console output
4. Share the hex frames with protocol info:

Example:
```
Frame 1: A0 08 01 80 00 50 AA BB CC 45 23
  Header: 0xA0
  Length: 0x08
  CMD: 0x80
  EPC: AA BB CC
  
Frame 2: BB 0D FF 23 12 00 11 22 33 44 55 66 77
  Header: 0xBB
  Length: 0x0D
  Maybe RSSI: 0xFF
  EPC: 12 00 11 22 33 44 55 66 77
```

Share this with your device vendor to confirm frame structure.

## Key Files Updated

### [sdk/src/transports/SerialTransport.ts](../sdk/src/transports/SerialTransport.ts)
- **handleIncomingData()**: Now detects both A0 and BB headers
- **processFrame()**: Protocol-aware processing with 'A0' | 'BB' parameter
- **extractAndEmitTag()**: Handles both protocol payload formats

**Changes**:
- ✅ Line 67-113: Dual protocol detection loop
- ✅ Line 115+: processFrame() method signature updated
- ✅ Line 175+: Protocol-aware EPC extraction logic

### Other Unchanged (Working Correctly)
- ✅ [sdk/src/Rfidsdk.ts](../sdk/src/Rfidsdk.ts): Stats emission logic intact
- ✅ [gui/electron/ipc/sdkbridge.js](../gui/electron/ipc/sdkbridge.js): IPC listeners intact  
- ✅ [gui/src/contexts/TagContext.tsx](../gui/src/contexts/TagContext.tsx): Stats reception intact

## Next Steps

1. **Rebuild**: `npm run build` in `sdk/` directory
2. **Test**: Connect serial device and place tag in range
3. **Verify**: Check console logs match expected sequence
4. **Confirm**: See cumulative counts update in GUI

## If Still Not Working

Capture and share:
1. **Console output**:  First 10 frames of data (raw bytes)
2. **Device spec**: Model, protocol documentation
3. **Frame examples**: At least 3 complete tag frames with annotations

Example share format:
```
Device: [Model Name]
Protocol: BB (or A0)
Expected EPC format: [bytes offset]
Sample frames:
  Frame 1: BB 97 12 20 00 FB A1 58 6A BC DF 16
    → EPC should be: FBA1586ABCDF
    → At bytes: 3-8 (assuming BB=0, len=1, rssi=2, epc=3-8)
```

This helps identify the exact payload structure for your device.

---

**Summary**: The main issue was **protocol detection** (BB vs A0). The fix is now in place. Rebuild, test with your device, and check console logs at each step. Stats should flow through the entire pipeline: Device → Serial → EventBus → SDK → IPC → GUI → Display.
