# MQTT JSON Data Stream Fix

## Problem
When receiving MQTT data that's already in JSON format like:
```json
{
  "EPC": "ABC12345",
  "Code": "ABCD123456"
}
```

The system was incorrectly treating it as hex data and converting it to hex representation:
```json
{
  "EPC": "7B0A2020224550",  // This is hex of "{\n  "E"
  "Frame_Hex": "7B 0A 20 20 22..."  // Hex of the entire JSON string
}
```

## Root Cause
The payload parsing logic was:
1. Converting all `raw` data to hex (`Frame_Hex`)
2. Then attempting hex decryption on everything
3. Only checking for JSON format as a fallback

This meant JSON strings were being hex-encoded before being checked for JSON format.

## Solution

### Changed Priority Order to: **JSON → Binary Protocols (BB, A0) → Raw Hex**

**Updated Files:**

#### 1. `PayloadFormatter.ts` - parsePayload()
- **Before**: Check hex, then JSON
- **After**: Check JSON first, then hex
- JSON data returns early with parsed structure
- Only JSON that fails parsing attempts hex decryption

```typescript
// NEW: Check JSON FIRST (for MQTT data)
if (payloadString.trim().startsWith('{')) {
  try {
    const jsonData = JSON.parse(payloadString);
    return { data: { ...displayData, ...jsonData }, isJson: true };
  } catch (e) {
    // Fall through to hex detection only if JSON parse fails
  }
}

// THEN: Try hex decryption (for Serial/Binary)
if (typeof rawData.raw === 'string' && /^[0-9A-Fa-f\s]+$/.test(rawData.raw)) {
  // Hex decryption logic...
}
```

#### 2. `Dashboard.tsx` - onRawData()
- **Before**: Only checked if data was hex format
- **After**: Checks JSON first, then hex
- Properly identifies MQTT JSON payloads
- Gracefully falls back to hex for Serial data

```typescript
if (typeof packet.data === 'string') {
  // First check if it's JSON
  if (packet.data.trim().startsWith('{')) {
    try {
      const jsonData = JSON.parse(packet.data);
      processedData = jsonData;
    } catch (error) {
      // Fall back to hex decryption if JSON fails
    }
  }
  // Then try hex decryption if not JSON
  else if (/^[0-9A-Fa-f\s]+$/.test(packet.data)) {
    // Hex decryption logic...
  }
}
```

#### 3. `JSONFormatter.ts` - format()
- **Before**: Attempted hex decryption on JSON-like strings
- **After**: Validates JSON format first
- Attempts hex decryption only if JSON format fails

## Impact

### MQTT Data (Now Works Correctly ✓)
**Input:**
```json
{
  "EPC": "ABC12345",
  "Code": "ABCD123456"
}
```

**Output (Fixed):**
```json
{
  "EPC": "ABC12345",
  "Code": "ABCD123456"
}
```

### Serial Hex Data (Still Works ✓)
**Input (hex):**
```
BB 97 12 20 00 FB A1 58 6A BC DF 16 ...
```

**Output (Correct):**
```json
{
  "EPC": "FBA1586ABCDF16",
  "Frame_Hex": "BB 97 12 20 00 FB A1 58 6A BC DF 16..."
}
```

## Testing

### MQTT Connection
Connect via MQTT and send JSON data - should now display correctly in:
- **Data Stream → JSON Tab**: Shows parsed JSON object
- **Data Stream → Raw Tab**: Shows space-separated hex bytes
- **Data Stream → Text Tab**: Shows formatted text output

### Serial Connection
Connect via Serial and present RFID tag - should continue working:
- **Data Stream → JSON Tab**: Shows extracted EPC
- **Data Stream → Raw Tab**: Shows frame hex with spaces
- **Data Stream → Text Tab**: Shows EPC and protocol info

## Console Log Changes

### For JSON Data (MQTT)
```
[PayloadFormatter] Detected JSON format
[PayloadFormatter] ✓ Successfully parsed JSON: { EPC: "ABC12345", Code: "ABCD123456" }
```

### For Hex Data (Serial)
```
[PayloadFormatter] Attempting to decrypt hex payload: BB 97 12 20...
[PayloadFormatter] ✓ Successfully decrypted EPC: FBA1586ABCDF16
```

## Compatibility

- ✅ MQTT JSON text payloads
- ✅ Serial hex protocols (BB, A0)
- ✅ Mixed deployments (MQTT + Serial)
- ✅ Raw text data
- ✅ Binary array data

## Files Modified

- `gui/src/utils/PayloadFormatter.ts` - parsePayload() and JSONFormatter.format()
- `gui/src/components/Dashboard/Dashboard.tsx` - onRawData() handler

## Build Status

✓ TypeScript compilation successful  
✓ No errors or warnings  
✓ Ready for testing with MQTT and Serial connections

