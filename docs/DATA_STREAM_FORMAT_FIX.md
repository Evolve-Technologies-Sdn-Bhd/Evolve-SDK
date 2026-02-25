# Data Stream Output Format & Unique Counting Fix

## Problems Fixed

### Problem 1: Inconsistent Data Stream Output (Two Different Formats)
**Issue**: Data stream showed either:
- **Format 1** (desired): Comprehensive with EPC, ID, RSSI, RSSI_Value, Timestamp, Frame_Hex, EPC_Decrypted
- **Format 2** (unwanted): Only EPC and Frame_Hex

**Root Cause**: 
1. Device sends **multiple BB protocol frames concatenated together** with `0x0D 0x0A` (CR+LF) separators
2. Parser was treating concatenated frames as one giant frame
3. ID field extraction included entire concatenated payload, making output inconsistent
4. Sometimes JSON parsing would fail, falling back to minimal format

**Fix Applied**:
- ✅ Updated `SerialTransport` to skip `0x0D 0x0A` separators between frames
- ✅ Extract **only 6-7 byte EPC** (bytes 3-9 in BB protocol), not entire payload
- ✅ Capture **full payload as `id_full`** field for comprehensive display
- ✅ Added `epc` field to `TagData` interface
- ✅ Updated `PayloadFormatter` to always output comprehensive format

### Problem 2: Cumulative Count Not Registering Unique Tags Properly
**Issue**: Same RFID tag appearing multiple times counted as different unique tags

**Root Cause**:
1. Multiple concatenated frames with same EPC arriving in one packet
2. Without separate `epc` field, unique tracking might fall back to using entire `id` (which varies)
3. No consistent EPC field in TagData being emitted

**Fix Applied**:
- ✅ Added explicit `epc` field to TagData interface
- ✅ SerialTransport now extracts clean `epc` value (6-7 bytes only)
- ✅ SDK's unique tracking explicitly uses `epc` field: `const uniqueIdentifier = rawTagData?.epc || rawTagData?.id;`
- ✅ Same EPC will now consistently increment count, not unique count

## Data Flow After Fix

```
┌─ Serial Device ────────────────────────────────────────────┐
│ Sends: [Frame1][0D 0A][Frame2][0D 0A][Frame3]...           │
└────────────────────┬──────────────────────────────────────┘
                     │
┌────────────────────▼──────────────────────────────────────┐
│ SerialTransport.handleIncomingData()                      │
│ ✓ Detects BB frame (0xBB header)                          │
│ ✓ Processes FIRST frame completely                        │
│ ✓ **SKIPS 0x0D 0x0A separator**                          │
│ ✓ Continues loop to NEXT frame                             │
└────────────────────┬──────────────────────────────────────┘
                     │
┌────────────────────▼──────────────────────────────────────┐
│ extractAndEmitTag() - Per Frame                            │
│ ✓ Extract EPC: bytes 3-9 (CLEAN, 6-7 bytes only)          │
│   Example: "FBA1586ABCDF16"                               │
│ ✓ Extract RSSI: byte 2 = -18 dBm                          │
│ ✓ Extract id_full: bytes 2 to checksum (entire payload)   │
│   Example: "1220...6BC..." (hex string)                   │
│ ✓ Emit tag with both epc + id_full                        │
└────────────────────┬──────────────────────────────────────┘
                     │
┌────────────────────▼──────────────────────────────────────┐
│ RfidSdk.start() Listener                                   │
│ ✓ totalCount++ (always incremented)                        │
│ ✓ uniqueTags.add(epc) (only if NEW epc)                   │
│ ✓ Emit stats: { total: 5, unique: 1 } ✓                    │
└────────────────────┬──────────────────────────────────────┘
                     │
┌────────────────────▼──────────────────────────────────────┐
│ PayloadFormatter.formatTagForDisplay()                     │
│ ✓ displayData.EPC = rawData.epc ("FBA1586ABCDF16")        │
│ ✓ displayData.ID = rawData.id_full (full hex payload)     │
│ ✓ displayData.RSSI = rawData.rssi ("-18 dBm")            │
│ ✓ displayData.Timestamp = ISO format                      │
│ ✓ displayData.Frame_Hex = formatted hex bytes              │
│ ✓ displayData.EPC_Decrypted = rawData.epc                 │
└────────────────────┬──────────────────────────────────────┘
                     │
┌────────────────────▼──────────────────────────────────────┐
│ GUI Dashboard Output (JSON)                                │
│ {                                                          │
│   "EPC": "FBA1586ABCDF16",                                │
│   "ID": "1220...hex payload...",                          │
│   "RSSI": "-18 dBm",                                      │
│   "RSSI_Value": -18,                                      │
│   "Timestamp": "2026-02-23T08:59:54.130Z",               │
│   "Frame_Hex": "BB 97 12 20 00 FB A1 58...",            │
│   "EPC_Decrypted": "FBA1586ABCDF16"                       │
│ }                                                          │
└────────────────────────────────────────────────────────────┘
```

## Files Updated

### 1. [sdk/src/events/EventBus.ts](../sdk/src/events/EventBus.ts)
**Changes**: Enhanced TagData interface
```typescript
export interface TagData {
  id: string;
  epc?: string;          // ← NEW: Clean EPC identifier (6-7 bytes)
  timestamp: number;
  raw: Buffer;
  rssi?: number;
  id_full?: string;      // ← NEW: Full payload data (comprehensive ID)
}
```

### 2. [sdk/src/transports/SerialTransport.ts](../sdk/src/transports/SerialTransport.ts)
**Changes**: 
- Added `0x0D 0x0A` separator skip logic (lines ~130-133)
- Limited BB protocol EPC extraction to bytes 3-9 only (lines ~280-290)
- Extract full payload as `id_full` hex string (lines ~325-338)
- Emit both `epc` and `id_full` fields

### 3. [gui/src/utils/PayloadFormatter.ts](../gui/src/utils/PayloadFormatter.ts)
**Changes**:
- Use `id_full` if available, otherwise `id` for ID field (lines ~42-48)
- Always include Frame_Hex when EPC is present (lines ~155-167)
- Always include EPC_Decrypted when EPC is present (lines ~169-172)

## Verification Checklist

### After Rebuild, You Should See:

**1. Console Logs (Main Process)**
```
[SerialReader] ✓ BB Protocol frame detected
[SerialReader] Skipping CR+LF separator (0x0D 0x0A)
[SerialReader] [BB] Format: RSSI at byte 2 (18), EPC at bytes 3-9 (7 bytes)
[SerialReader] [BB] Tag detected - EPC: FBA1586ABCDF16, RSSI: -18dBm
[RfidSdk] Emitting stats event: { total: 1, unique: 1 }
```

**2. Data Stream Output Format**
```json
{
  "EPC": "FBA1586ABCDF16",
  "ID": "1220...hex...",
  "RSSI": "-18 dBm",
  "RSSI_Value": -18,
  "Timestamp": "2026-02-23T...",
  "Frame_Hex": "BB 97 12 20...",
  "EPC_Decrypted": "FBA1586ABCDF16"
}
```
✅ **ALWAYS** format 1 (never format 2)

**3. Cumulative Display**
- Place 1 tag in range: Total=1, Unique=1
- Place same tag again: Total=2, Unique=1 ✓
- Place different tag: Total=3, Unique=2 ✓
- Remove all tags, place original again: Total=4, Unique=1 (still same tag)

### Build Verification
- ✅ SDK: `npm run build` in `sdk/` directory
- ✅ GUI: `npm run build` in `gui/` directory (or `npx tsc --noEmit` for type check)

## How to Test

1. **Rebuild both SDK and GUI**
   ```bash
   cd sdk && npm run build
   cd ../gui && npm run build
   ```

2. **Launch the Electron app**
   - Start scanning with your serial reader
   - Check Developer Tools → Console (Main Process)

3. **Monitor Output**
   - Data Stream tab should always show comprehensive format
   - Cumulative counters should reflect unique tags correctly

4. **Test Scenarios**
   - Single tag multiple times → Total increases, Unique stays 1
   - Multiple different tags → Both Total and Unique increase
   - Disconnect/reconnect → Stats reset (session-based, as designed)

## Key Behavior Changes

### BB Protocol Frame Handling
**Before**: Entire concatenation treated as one massive frame
**After**: Each frame processed separately, separated by `0x0D 0x0A` skip

### EPC Extraction  
**Before**: Extracted entire remaining payload (hundreds of bytes for concatenated frames)
**After**: Extract only 6-7 bytes (bytes 3-9 in BB frame), actual EPC data

### Unique Tracking
**Before**: Might use full payload ID if EPC not available → different values for same tag
**After**: Always uses clean `epc` field → consistent deduplication

## Backward Compatibility
✅ **Fully backward compatible**:
- A0 Protocol unchanged
- MQTT JSON unchanged
- Cumulative display logic unchanged
- Only improvements to BB protocol frame splitting and formatting

## Build Status
- ✅ SDK: Compiles successfully (46.75 KB CJS, 44.89 KB ESM)
- ✅ GUI: TypeScript compiles without errors
- ✅ No breaking changes
