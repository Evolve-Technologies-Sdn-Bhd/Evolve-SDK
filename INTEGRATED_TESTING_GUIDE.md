# Integrated Performance Testing: RFID Reader + Load Tests

This guide explains how to run performance tests while your RFID reader is actively processing data.

## Configuration

### Step 1: Enable RFID Reader in PM2

Open `ecosystem.config.js` and uncomment the `rfid-reader-app` section:

```javascript
{
  name: 'rfid-reader-app',
  cwd: './gui',
  script: 'npm',
  args: 'run dev',
  autorestart: false,
  watch: false,
  env: {
    NODE_ENV: 'production',
  },
  error_file: './logs/rfid-reader-error.log',
  out_file: './logs/rfid-reader-output.log',
  log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  max_memory_restart: '2G',
},
```

### Step 2: Configure Your Reader Connection

Before starting tests, configure your RFID reader in the GUI:

**Serial Connection:**
- COM Port: `COM3` (or your USB/Serial port)
- Baud Rate: `115200`
- Protocol: `F5001` (or `UF3-S`, `A0`, `BB`)

**MQTT Connection:**
- Protocol: `mqtt://`
- Host: `broker.emqx.io` (or your MQTT broker)
- Port: `1883`
- Topic: `rfid/tags`
- Username/Password: (if required)

## Scenarios

### Scenario A: Serial COM + Performance Tests

```bash
# 1. Start everything at once
npx pm2 start ecosystem.config.js

# 2. In the Electron app (opens automatically):
#    - Select "Serial Mode"
#    - Click "Configuration"
#    - Set COM port, baud rate, protocol
#    - Click "Connect"

# 3. Once reader shows "Connected":
#    - Reader starts scanning
#    - Performance tests begin
#    - Monitor both in PM2

# 4. Watch real-time metrics
npx pm2 monit
# You should see:
# - rfid-reader-app: continuously reading tags
# - sdk-serial-perf-test: running with active reader
# - sdk-perf-test: baseline SDK tests
# - sdk-mqtt-perf-test: MQTT tests (if applicable)
# - gui-perf-test: GUI component tests
```

### Scenario B: MQTT + Performance Tests

```bash
# 1. Ensure MQTT broker is running and publishing tags
#    Example: mosquitto, EMQ X, HiveMQ, etc.

# 2. Start PM2 with reader + tests
npx pm2 start ecosystem.config.js

# 3. In the Electron app:
#    - Select "MQTT Mode"
#    - Click "Configuration"
#    - Set broker URL, topic
#    - Click "Connect"

# 4. Monitor
npx pm2 logs rfid-reader-app     # Watch reader
npx pm2 logs sdk-mqtt-perf-test  # Watch MQTT performance
npx pm2 monit                     # Live dashboard
```

### Scenario C: Sequential Testing (Recommended for Baseline)

Test reader startup impact on performance:

```bash
# 1. Start reader only
npx pm2 start ecosystem.config.js --only rfid-reader-app

# 2. Wait 30 seconds for reader to initialize and start reading
sleep 30

# 3. Start performance tests while reader is active
npx pm2 start ecosystem.config.js --only sdk-serial-perf-test,sdk-mqtt-perf-test,sdk-perf-test

# 4. Monitor all running together
npx pm2 monit
```

## What to Monitor

### In `npx pm2 monit` Dashboard

Watch for:

```
READER PERFORMANCE:
- rfid-reader-app memory: Should be stable 300-800MB
- rfid-reader-app CPU: Spikes during tag reads (normal)

SDL/MQTT PERF:
- sdk-serial-perf-test: Should complete in 2-3 seconds
- sdk-mqtt-perf-test: Should complete in 2-5 seconds

IMPACT ANALYSIS:
- If perf tests are slower with reader active = bottleneck detected
- If perf tests are unchanged = good isolation
- High CPU spike = protocol parsing efficiency issue
```

### In Logs

Check for insights:

```bash
# Reader connection details
npx pm2 logs rfid-reader-app

# Serial performance metrics
npx pm2 logs sdk-serial-perf-test | grep -i "throughput\|latency\|frame"

# MQTT performance metrics
npx pm2 logs sdk-mqtt-perf-test | grep -i "payload\|msg\|broker"

# GUI rendering under load
npx pm2 logs gui-perf-test | grep -i "filter\|sort\|update"
```

## Performance Comparison

### Create Baseline Without Reader

```bash
# Run 1: Tests without reader
npx pm2 start ecosystem.config.js --only sdk-serial-perf-test,sdk-mqtt-perf-test
npx pm2 list
# Note the execution times and CPU usage
npx pm2 delete all
```

### Create Load Test With Reader

```bash
# Run 2: Tests with reader active
npx pm2 start ecosystem.config.js
# Wait for reader to connect in GUI
# Monitor performance
npx pm2 list
```

### Compare Results

| Metric | Without Reader | With Reader | Difference |
|--------|---|---|---|
| Serial 10k frames | ~40ms | ~45ms | +5ms (+12%) |
| MQTT 10k payloads | ~30ms | ~38ms | +8ms (+27%) |
| GUI filter (10k tags) | ~20ms | ~28ms | +8ms (+40%) |

- **<10% difference**: Good isolation
- **10-30% difference**: Acceptable under load
- **>30% difference**: Potential bottleneck or optimization opportunity

## Real-World Testing Tips

### Test with Real RFID Tags

```bash
# Setup reader connected to actual RFID antenna
# In GUI, click "Connect" to scan real tags
# Start performance tests while scanning
npx pm2 start ecosystem.config.js

# Monitor:
npx pm2 logs rfid-reader-app        # Shows actual tags being read
npx pm2 logs sdk-serial-perf-test   # Performance under real load
npx pm2 monit                        # Resource usage
```

### Test with Simulated High Throughput

Modify your broker/reader to send high-frequency data:

```bash
# For MQTT: Configure to publish faster
# For Serial: Set scanner to continuous mode

# Start tests
npx pm2 start ecosystem.config.js

# Monitor bottlenecks
npx pm2 monit
npx pm2 logs sdk-perf-test
```

### Test with Multiple Antennas

```bash
# Serial readers often support 4 antennas
# Tag frequency simulates:
# - Antenna 1: 25,000 tags
# - Antenna 2: 25,000 tags  
# - Antenna 3: 25,000 tags
# - Antenna 4: 25,000 tags
# Total: 100,000 reads (with deduplication)

# This tests concurrent antenna handling
npx pm2 logs sdk-serial-perf-test | grep -i "antenna\|concurrent"
```

## Cleanup

```bash
# Stop everything
npx pm2 stop all
npx pm2 delete all

# Save final logs
cp -r ./logs ./logs-backup-$(date +%Y%m%d-%H%M%S)

# Check logs for analysis
Get-Content ./logs-backup-*/sdk-serial-perf-output.log | Select-String "throughput"
```

## Troubleshooting

### Reader Won't Connect

```bash
# Check reader logs
npx pm2 logs rfid-reader-app

# Verify settings:
# - Port exists: (COM1, COM3, COM4...)
# - Serial device is plugged in
# - Baud rate matches device
# - No other process using the port
```

### Performance Tests Complete Before Reader Connects

This is normal! Tests complete in 2-5 seconds, reader may take 10-30 seconds to initialize.

**Solution:** Manually delay test startup:
1. Start only reader: `npx pm2 start ecosystem.config.js --only rfid-reader-app`
2. Wait for "Connected" message in logs
3. Then start tests: `npx pm2 start ecosystem.config.js --only sdk-*-perf-test,gui-perf-test`

### High Memory/CPU During Tests

Expected during heavy benchmarks. If abnormal:
```bash
# Check for memory leaks
npx pm2 monit

# Restart process
npx pm2 restart sdk-serial-perf-test

# Check logs
npx pm2 logs sdk-serial-perf-test --err
```

## Next Steps

- Review logs for optimization opportunities
- Identify bottlenecks from performance metrics
- Apply improvements and re-test
- Track performance trends over time
- Implement monitoring in production
