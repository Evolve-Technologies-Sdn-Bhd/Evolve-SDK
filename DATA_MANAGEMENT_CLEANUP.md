# Data Management Cleanup - EPCs One-by-One Processing

## Overview
Updated the system to properly handle messy EPCList data from MQTT brokers by extracting and emitting individual EPCs one-by-one to the data stream.

## Changes Made

### 1. MQTTTransport.ts - Message Handler Rewrite
**Location:** `sdk/src/transports/MQTTTransport.ts`

#### What Changed:
- **Old Format:** Received nested EPCList arrays and emitted as complex structures
- **New Format:** Extracts individual EPCs and emits one-per-message

#### Processing Logic:
```
Incoming Message
    ↓
Detect EPCList Array
    ↓
Loop Through Each EPC
    ↓
Emit One Tag Per EPC (formatTagToEpc)
    ↓
Data Stream (Individual EPC entries)
```

#### Supported Input Formats:
1. **Nested EPCList (Original Format):**
```json
{
  "EPC": "{\"Type\":\"EPCList\",...\"EpcList\":[{epc objects}]}",
  "Timestamp": "2026-02-26T08:00:47.716Z"
}
```

2. **Direct EPCList:**
```json
{
  "data": {
    "EpcList": [{epc objects}]
  }
}
```

3. **Single EPC:**
```json
{
  "EPC": "...",
  "TID": "...",
  "RSSI": ...,
  "AntId": "..."
}
```

### 2. Individual EPC Output Format
Each EPC is now emitted with these clean fields:
```json
{
  "EPC": "FEE1586ABCDE8800",
  "TID": "",
  "RSSI": -48,
  "AntId": "1",
  "ReadTime": "2026-02-26 16:00:42"
}
```

### 3. PayloadFormatter Update
**Location:** `gui/src/utils/PayloadFormatter.ts`

Updated `parsePayload()` to extract all five fields:
- `EPC` - The RFID tag identifier
- `TID` - Terminal ID (if available)
- `RSSI` - Received signal strength (-dBm)
- `AntId` - Antenna ID
- `ReadTime` - When the tag was read

## Data Flow

```
MQTT Broker
    ↓
MQTTTransport.on('message')
    ├─ Detect EPCList format
    ├─ Extract individual EPC objects
    └─ For each EPC:
        ├─ Create TagData with fields: epc, tid, rssi, antId, readTime
        └─ emitTag(tag) → One message per EPC
            ↓
IPC Bridge (rfid:tag-read)
    ↓
Dashboard (Data Stream)
    ├─ formatTagForDisplay()
    ├─ PayloadFormatter.parsePayload()
    └─ Display in Data Stream
        {
          "EPC": "...",
          "TID": "...",
          "RSSI": ...,
          "AntId": "...",
          "ReadTime": "..."
        }
```

## Benefits

✅ **One-by-One Processing:** Each EPC displays separately in the data stream
✅ **Cleaner Format:** No nested arrays or stringified JSON
✅ **Backward Compatible:** Still handles single EPC messages
✅ **Key Fields Only:** Shows exactly what users need
✅ **Better Tracking:** Can count/track individual EPCs through their lifetime

## Console Output Examples

When receiving EPCList with 4 entries:
```
[MqttReader] Processing EPCList with 4 entries
[MqttReader] Emitting EPC 1/4: FEE1586ABCDE8800
[MqttReader] Emitting EPC 2/4: DCD2298ABCDA7900
[MqttReader] Emitting EPC 3/4: FEE1586ABCDE8800
[MqttReader] Emitting EPC 4/4: DCD2298ABCDA7900
```

## Testing

### To verify the changes:

1. **Build the SDK:**
   ```bash
   cd sdk
   npm run build
   ```

2. **Start the GUI:**
   ```bash
   cd gui
   npm run dev
   ```

3. **Connect to MQTT broker with EPCList data**

4. **Expected behavior in Data Stream:**
   - Multiple EPCs appear one per row
   - Each shows: EPC, TID, RSSI, AntId, ReadTime
   - No nested structures or arrays visible

## Future Enhancements

- Add deduplication (skip if same EPC recently seen)
- Add filtering (skip low RSSI, invalid EPCs)
- Add aggregation (count same EPC across time windows)
- Persist to SQLite for historical tracking
