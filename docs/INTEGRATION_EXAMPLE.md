# Integration Example: Auto-Parse EPC in SerialTransport

This shows how the `PayloadDecryptor` is already integrated into your data pipeline.

## Data Flow

```
Physical Device (RS-232)
         ↓
Serial Port (binary data)
         ↓
SerialTransport.handleIncomingData()
         ↓ [Emit as RawData packet]
         ↓ "BB 97 12 20 00 FB A1 58 6A BC DF 16..."
         ↓
IPC Bridge (rfid:raw-data)
         ↓
GUI Dashboard (Data Stream)
         ↓
PayloadFormatter.parsePayload()
         ↓ [Auto-calls PayloadDecryptor.parseEpcFromHex()]
         ↓
Output: { EPC: "FBA1586ABCDF16" }
         ↓
Displayed in JSON/Raw/Text Tabs
```

## Console Output When Tag is Received

```
[SerialReader] Data received (31 bytes): BB 97 12 20 00 FB A1 58 6A BC DF 16 00 00 00 01 00 2A 58 9E 00 F9 0D 0A 7E 7E 08 84 00 8A 06

[PayloadDecryptor] Parsing hex data, total bytes: 31
[PayloadDecryptor] Detected BB protocol format
[PayloadDecryptor] Extracted EPC bytes: 0xFB 0xA1 0x58 0x6A 0xBC 0xDF 0x16
[PayloadDecryptor] EPC: FBA1586ABCDF16

[PayloadFormatter] Attempting to decrypt hex payload: BB 97 12 20 00 FB A1 58 6A BC DF 16...
[PayloadFormatter] ✓ Successfully decrypted EPC: FBA1586ABCDF16

[Dashboard] ✓ Received raw data packet
[Dashboard] ✓ Adding to logs: { id: 1, timestamp: "14:23:45", direction: "RX", data: "BB 97 12 20..." }
```

## Testing Your Device Data

### Step 1: Connect via Serial
```
Hardware Connection → COM Port Settings
- Port: COM3 (or your port)
- Baud Rate: 115200 (adjust as needed)
- Click: Connect
```

### Step 2: Start Scan
```
Read Control → Click: Start Read
```

### Step 3: Present Tag to Reader
Hold your tag near the RFID reader antenna.

### Step 4: Check Data Stream
Open Dashboard → Data Stream tab

You should see:
```
14:23:45  [RX]  BB 97 12 20 00 FB A1 58 6A BC DF 16 00 00 00 01 00 2A 58 9E 00 F9 0D 0A 7E 7E 08 84 00 8A 06
```

Click on "JSON" tab to see:
```json
{
  "EPC": "FBA1586ABCDF16"
}
```

### Step 5: Verify Console Output
Open DevTools: Press `F12` → Console tab

Look for lines starting with:
- `[SerialReader] Data received...`
- `[PayloadDecryptor] Parsing hex data...`
- `[PayloadFormatter] ✓ Successfully decrypted EPC...`

## Implementation Details

### In SerialTransport.ts
```typescript
private handleIncomingData(data: Buffer) {
  // ... existing code ...
  
  // Show data in hex format for clarity
  const dataHex = data.toString('hex').toUpperCase();
  const hexFormatted = dataHex.match(/.{1,2}/g)?.join(' ') || '';
  console.log(`[SerialReader] Data received (${data.length} bytes): ${hexFormatted}`);
  
  // Emit to data stream (NEW - automatically triggers PayloadDecryptor)
  this.emitRawData(data, 'RX');
  
  // ... frame processing continues ...
}
```

### In PayloadFormatter.ts
```typescript
static parsePayload(rawData: any) {
  // ... existing code ...
  
  // Extract frame data (hex representation)
  if (rawData.raw) {
    displayData['Frame_Hex'] = rawData.raw;

    // Try to decrypt/parse hex data using PayloadDecryptor (NEW)
    if (typeof rawData.raw === 'string' && /^[0-9A-Fa-f\s]+$/.test(rawData.raw)) {
      try {
        console.log('[PayloadFormatter] Attempting to decrypt hex payload...');
        const decrypted = PayloadDecryptor.parseEpcFromHex(rawData.raw);
        if (decrypted.EPC && decrypted.EPC !== 'UNKNOWN') {
          displayData.EPC = decrypted.EPC;
          displayData['EPC_Decrypted'] = decrypted.EPC;
          console.log('[PayloadFormatter] ✓ Successfully decrypted EPC:', decrypted.EPC);
        }
      } catch (error) {
        console.error('[PayloadFormatter] Error during hex decryption:', error);
      }
    }
  }
  
  // ... rest of formatting ...
}
```

## Supported Data Formats

### Format 1: Your BB Protocol
```
BB 97 12 20 00 [EPC 7 bytes] [Reserved Data...]
```
✓ Automatically detected and parsed

### Format 2: A0 Protocol (Seuic Standard)
```
A0 [LEN] [ADDR] [CMD] [RSSI] [EPC 7 bytes] [DATA...]
```
✓ Automatically detected and parsed

### Format 3: Custom Protocol
If your device uses a different format, edit `PayloadDecryptor.parseEpcFromHex()`:

```typescript
else if (firstByte === 0xYOUR_HEADER) {
  console.log('[PayloadDecryptor] Detected YOUR protocol format');
  // Add your extraction logic here
  const epcBytes = bytes.slice(YOUR_OFFSET, YOUR_OFFSET + 7);
  epc = epcBytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('');
}
```

## Troubleshooting

### EPC not appearing in Data Stream
1. Check Console (F12) for `[PayloadDecryptor]` messages
2. Verify hex data is correct format (space-separated or continuous)
3. Check if EPC is at different byte offset (edit PayloadDecryptor.ts)
4. Enable detailed logging

### Wrong EPC value extracted
1. Open Console and check log messages
2. Count which byte offset the EPC data actually starts at
3. Update the offset in `PayloadDecryptor.parseEpcFromHex()`

Example: If EPC actually starts at byte 6 instead of 5:
```typescript
const epcBytes = bytes.slice(6, 13); // Changed from slice(5, 12)
```

### Data not showing in Data Stream at all
1. Verify serial connection is active
2. Check Hardware Connection section shows "Connected ✓"
3. Click "Start Read"
4. Present tag to reader
5. Check Console for `[SerialReader] Data received...` messages

## Advanced: Manual Testing

In browser DevTools Console:

```javascript
// Test the PayloadDecryptor directly
const testData = 'BB 97 12 20 00 FB A1 58 6A BC DF 16 00 00 00 01 00 2A 58 9E 00 F9 0D 0A 7E 7E 08 84 00 8A 06';
const result = PayloadDecryptor.parseEpcFromHex(testData);
console.log('Parsed result:', result);
console.log('JSON output:', PayloadDecryptor.parseToJson(testData));
console.log('Is valid EPC:', PayloadDecryptor.validateEpc(result.EPC));
```

Expected output:
```
Parsed result: {EPC: "FBA1586ABCDF16"}
JSON output: "{\n  \"EPC\": \"FBA1586ABCDF16\"\n}"
Is valid EPC: true
```

