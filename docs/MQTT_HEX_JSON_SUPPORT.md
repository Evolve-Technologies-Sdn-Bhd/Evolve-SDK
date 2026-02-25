# MQTT Hex-Encoded JSON Support

## Overview
The system now properly handles MQTT data that arrives as hex-encoded JSON, decoding it back to readable JSON and extracting the required fields.

## Data Flow

### Scenario 1: MQTT with Plain JSON Text (Standard)
```
MQTT Broker publishes:
{ "EPC": "ABC12345", "Code": "ABCD123456" }
                ↓
System receives as text
                ↓
parsePayload() detects '{'
                ↓
Parses as JSON directly
                ↓
Maps "Code" → "ID"
                ↓
Returns: { "EPC": "ABC12345", "ID": "ABCD123456" }
```

### Scenario 2: MQTT with Hex-Encoded JSON (New)
```
MQTT Broker publishes (UTF-8 hex encoded):
7B 0A 20 20 22 45 50 43 22 3A 20 22 41 42 43 31 32 33 34 35 22...
                ↓
System receives as hex string
                ↓
PayloadFormatter.parsePayload() checks format
                ↓
Detects hex pattern: /^[0-9A-Fa-f\s]+$/
                ↓
Decodes hex bytes to ASCII text:
{ "EPC": "ABC12345", "Code": "ABCD123456" }
                ↓
Detects '{' in decoded text
                ↓
Parses as JSON
                ↓
Maps "Code" → "ID"
                ↓
Returns: { "EPC": "ABC12345", "ID": "ABCD123456" }
```

### Scenario 3: Serial Protocol (Existing)
```
Serial port sends:
BB 97 12 20 00 FB A1 58 6A BC DF 16...
                ↓
System identifies as binary protocol (starts with BB or A0)
                ↓
PayloadDecryptor.parseEpcFromHex() extracts bytes
                ↓
EPC located at bytes 5-11
                ↓
Returns: { "EPC": "FBA1586ABCDF16", "Frame_Hex": "BB 97..." }
```

## Format Detection Priority

The `PayloadFormatter.parsePayload()` method implements a hierarchical detection strategy:

1. **JSON Text Check**: If data starts with `{` or `[` → Parse as JSON directly
2. **Hex Format Detection**: If data matches `/^[0-9A-Fa-f\s]+$/` pattern
   - **Hex-to-Text Decode**: Convert hex bytes to ASCII
   - **JSON Check on Decoded**: If decoded text starts with `{` → Parse as JSON ✨ NEW
   - **Binary Protocol Fallback**: If not JSON, try BB/A0 protocol parsing
3. **Default**: Return structured data with `Frame_Hex`

## Field Mapping

### MQTT to Display Mapping
```javascript
// User Request: Map "Code" field to "ID" for MQTT data
if (jsonData.Code && !jsonData.ID) {
  jsonData.ID = jsonData.Code;
}
```

**Input**: `{ "EPC": "ABC12345", "Code": "ABCD123456" }`  
**Output**: `{ "EPC": "ABC12345", "Code": "ABCD123456", "ID": "ABCD123456" }`

## Console Logging Breadcrumbs

When MQTT hex-encoded JSON is received, you'll see these logs:

```
[Dashboard] ✓ Received raw data packet: { data: "7B 0A 20 20..." }
[Dashboard] Attempting hex to JSON conversion...
[Dashboard] ✓ Hex decoded to JSON: { EPC: 'ABC12345', Code: 'ABCD123456' }
[Dashboard] ✓ Adding to logs: { data: {EPC, ID, ...} }
```

Or from PayloadFormatter directly:
```
[PayloadFormatter] Attempting to decode hex string...
[PayloadFormatter] ✓ Hex decodes to JSON
```

## Updated Files

### gui/src/utils/PayloadFormatter.ts
- Added hex-to-ASCII decoding loop
- Check decoded text for JSON before binary protocol fallback
- Implements "Code" → "ID" mapping for MQTT data

### gui/src/components/Dashboard/Dashboard.tsx  
- Enhanced `onRawData` handler with same detection logic
- Added detailed logging at each stage
- Supports both text and hex MQTT formats

## Testing MQTT Hex-Encoded JSON

### Test MQTT Publishing (via CLI/MQTT Client)
```bash
# Standard JSON format (already working)
mosquitto_pub -h localhost -p 1883 -t "rfid/data" \
  -m '{"EPC":"ABC12345","Code":"ABCD123456"}'

# Hex-encoded JSON (now working)
# First encode: { "EPC": "ABC12345", "Code": "ABCD123456" }
# Result hex: 7B20 2245 5043 222A... (UTF-8 encoded)
mosquitto_pub -h localhost -p 1883 -t "rfid/hex_data" \
  -m '7B 0A 20 20 22 45 50 43 22 3A 20 22 41 42 43 31 32 33 34 35 22...'
```

### Expected GUI Display

**Data Stream → JSON Tab**:
```json
{
  "EPC": "ABC12345",
  "ID": "ABCD123456",
  "Code": "ABCD123456"
}
```

**Data Stream → Raw Tab**:
```
7B 0A 20 20 22 45 50 43 22...
```

**Data Stream → Text Tab** (readable format):
```
EPC: ABC12345
ID: ABCD123456
Code: ABCD123456
```

## Implementation Details

### Hex Decoding Algorithm
```typescript
const cleanHex = rawString.replace(/\s/g, '');  // Remove spaces
let decodedString = '';
for (let i = 0; i < cleanHex.length; i += 2) {
  const hexPair = cleanHex.substr(i, 2);
  const charCode = parseInt(hexPair, 16);
  decodedString += String.fromCharCode(charCode);
}
```

### Decoding Example
```
Input:  "7B 20 22 45"
After cleanup: "7B2022 45"
Hex values: 0x7B, 0x20, 0x22, 0x45
ASCII chars: '{', ' ', '"', 'E'
Result: "{ "E"
```

## Backward Compatibility

✅ **All existing functionality preserved**:
- Serial binary protocols (BB, A0) still work
- Direct MQTT JSON text still works  
- Cumulative display and statistics unchanged
- Raw data streaming unchanged
- IPC communication unchanged

## Error Handling

If decoding fails at any stage:

1. **JSON Parse Error**: Falls back to hex/binary processing
2. **Hex Decode Error**: Moves to binary protocol parser
3. **All Decoders Fail**: Returns `Frame_Hex` with original data for manual inspection

All errors logged to browser console with `[PayloadFormatter]` or `[Dashboard]` prefix.

## Building & Testing

```bash
# Build GUI (TypeScript compilation)
cd gui
npm run build

# Both files compile with no errors ✅
# Dashboard.tsx: No TypeScript errors
# PayloadFormatter.ts: No TypeScript errors
```

## Troubleshooting

### MQTT Data Still Shows as Hex
1. Check browser console for `[Dashboard]` or `[PayloadFormatter]` logs
2. Verify MQTT data format:
   - Is it plain JSON? Should start with `{`
   - Is it hex-encoded? Should match pattern `/^[0-9A-Fa-f\s]+$/`
3. Ensure "Code" field is present for ID mapping

### Hex Doesn't Decode to JSON
1. Verify MQTT publisher is sending UTF-8 hex encoding
2. Check decoded result with Python:
   ```python
   hex_string = "7B 0A 20 20..."
   decoded = bytes.fromhex(hex_string.replace(" ", "")).decode('utf-8')
   print(decoded)  # Should show readable JSON
   ```
3. Check browser console for error messages

### Performance Considerations
- Hex decoding adds minimal overhead (O(n) where n = hex string length)
- Only applied when data matches hex pattern (skipped for normal JSON)
- No impact on serial binary protocol performance (unchanged code path)
