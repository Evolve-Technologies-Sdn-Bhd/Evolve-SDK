# PM2 Performance Testing Guide

## Overview
This guide explains how to run comprehensive performance tests for your Evolve SDK project, including baseline tests and load tests with active RFID readers using PM2.

## Prerequisites
```bash
npm install -g pm2
```

## Test Types

### 1. **Baseline Performance Tests** (No Reader Active)
Tests SDK and GUI performance in isolation:
- **SDK Core** (`sdk-perf-test`): Database, deduplication, cleanup
- **SDK Serial** (`sdk-serial-perf-test`): Serial COM protocol parsing & throughput  
- **SDK MQTT** (`sdk-mqtt-perf-test`): MQTT payload parsing & message routing
- **GUI** (`gui-perf-test`): Component rendering, state management

### 2. **Load Testing** (With RFID Reader Active)
Measures performance while reader is actively processing data:
- Start your RFID application (Serial or MQTT)
- Run performance tests simultaneously
- Monitor real-world bottlenecks

## Quick Start

### Run All Baseline Tests
```bash
npx pm2 start ecosystem.config.js
npx pm2 list
npx pm2 logs
```

### Run Specific Tests
```bash
# SDK tests only
npx pm2 start ecosystem.config.js --only sdk-perf-test
npx pm2 start ecosystem.config.js --only sdk-serial-perf-test
npx pm2 start ecosystem.config.js --only sdk-mqtt-perf-test

# GUI only
npx pm2 start ecosystem.config.js --only gui-perf-test

# Serial + MQTT serial tests
npx pm2 start ecosystem.config.js --only sdk-serial-perf-test,sdk-mqtt-perf-test
```

### Run Tests Sequentially
```bash
# SDK tests in sequence
npx pm2 start ecosystem.config.js --only sdk-perf-test
# Wait for completion, then:
npx pm2 start ecosystem.config.js --only sdk-serial-perf-test
# Then:
npx pm2 start ecosystem.config.js --only sdk-mqtt-perf-test
```

## Monitoring Performance

### Real-time Dashboard
```bash
# Live CPU/Memory monitoring
npx pm2 monit

# Watch process changes
npx pm2 watch
```

### View Logs
```bash
# Real-time all logs
npx pm2 logs

# Specific test logs
npx pm2 logs sdk-perf-test
npx pm2 logs sdk-serial-perf-test
npx pm2 logs sdk-mqtt-perf-test
npx pm2 logs gui-perf-test

# Last N lines
npx pm2 logs sdk-serial-perf-test --lines 100

# Errors only
npx pm2 logs sdk-mqtt-perf-test --err
```

### Process Status
```bash
# List all processes
npx pm2 list

# Detailed info about a process
npx pm2 info sdk-mqtt-perf-test
npx pm2 show sdk-serial-perf-test

# Generate system report
npx pm2 report
```

## Test Descriptions

### SDK Core Performance Tests (`sdk-perf-test`)
Tests critical database operations:
```
- Date range filtering (50k records)
- Unique EPC extraction (100k records)
- EPC aggregation (50k records)
- RSSI filtering (100k records)
- Event deduplication (50k records)
- 30-day retention filtering (100k records)
- Deletion query preparation (50k records)
```

### SDK Serial Performance Tests (`sdk-serial-perf-test`)
Tests serial communication with RFID readers:
```
- Frame parsing (F5001 protocol): 10k frames
- Bulk data reception: 100k tags
- Deduplication: 50k unique from repeated reads
- RSSI filtering: 100k tags with threshold
- Concurrent antenna parsing: 4 antennas × 25k tags
- Error recovery: 1000 recovery cycles
- Baud rate impact: 9600, 57600, 115200 baud
```

**Key Metrics:**
- Frames/sec processing rate
- RSSI threshold filtering efficiency
- Error recovery success rate
- Throughput at different baud rates

### SDK MQTT Performance Tests (`sdk-mqtt-perf-test`)
Tests MQTT broker communication:
```
- JSON payload parsing: 10k payloads
- Binary payload parsing: 10k payloads (optimized)
- Message deduplication: 100k messages, 20k unique
- RSSI filtering: 100k messages with threshold
- Topic-based routing: 100k messages, 10 topics
- Concurrent subscriber processing: 5 subscribers × 20k messages
- Payload size impact: 100B to 5kB payloads
- Connection stability: 1000 connect/disconnect cycles
```

**Key Metrics:**
- JSON vs Binary parsing speed comparison
- Topics/sec routing capacity
- Message throughput per subscriber
- Processing efficiency across payload sizes

### GUI Performance Tests (`gui-perf-test`)
Tests frontend performance:
```
- Tag filter operation
- Data formatting for large datasets
- Tag counting with Map
- Rapid state updates
- EPC sorting performance
```

## Load Testing with Active Reader

### Setup: Enable RFID Reader in Ecosystem Config

1. Open `ecosystem.config.js`
2. Uncomment the `rfid-reader-app` section (around line 52)
3. Customize connection settings as needed:
   ```javascript
   {
     name: 'rfid-reader-app',
     cwd: './gui',
     script: 'npm',
     args: 'run dev',
     // ... configuration
   },
   ```

### Scenario 1: Serial Reader + Performance Tests

```bash
# 1. Edit ecosystem.config.js to uncomment rfid-reader-app
# 2. In the GUI app, connect to your RFID device via Serial:
#    - COM Port: COM3 (or your device)
#    - Baud Rate: 115200
#    - Protocol: F5001 (or your protocol)

# 3. Start everything with PM2
npx pm2 start ecosystem.config.js

# 4. The reader starts first
# 5. Once connected, performance tests begin automatically

# 6. Monitor in real-time
npx pm2 monit

# 7. View detailed logs
npx pm2 logs rfid-reader-app
npx pm2 logs sdk-serial-perf-test
```

### Scenario 2: MQTT Broker + Performance Tests

```bash
# 1. Edit ecosystem.config.js
# 2. In the GUI app, connect to MQTT broker:
#    - Protocol: mqtt://
#    - Host: broker.emqx.io (or your broker)
#    - Port: 1883
#    - Topic: rfid/tags

# 3. Ensure your MQTT broker is running and publishing tags

# 4. Start PM2
npx pm2 start ecosystem.config.js

# 5. Monitor MQTT message flow and performance
npx pm2 logs
```

### Scenario 3: Custom Test Order

Create a sequence to test reader startup impact:

```bash
# Manual sequence:
npx pm2 start ecosystem.config.js --only rfid-reader-app
# Wait 30 seconds for reader to initialize...
npx pm2 start ecosystem.config.js --only sdk-serial-perf-test,sdk-mqtt-perf-test
# Monitor both running together
npx pm2 monit
```

## Performance Analysis

### Expected Baselines

**SDK Core:**
- Database queries: 10-50ms
- Deduplication: 20-30ms
- 30-day cleanup: 50-200ms

**Serial Communication:**
- Frame parsing: <0.01ms per frame
- 100k tags throughput: <500ms total
- Error recovery: >95% success rate

**MQTT:**
- JSON parsing: <0.01ms per payload
- Binary parsing: <0.005ms per payload (50% faster)
- 100k messages: <80ms processing
- Topic routing capacity: 1000+ msgs/sec

**GUI:**
- Tag filtering: <50ms for 10k tags
- State updates: <5ms per update
- EPC sorting: <30ms

### Analyzing Logs

```bash
# Extract performance metrics from logs
npx pm2 logs sdk-serial-perf-test | grep "throughput"
npx pm2 logs sdk-mqtt-perf-test | grep "MB/s"
npx pm2 logs sdk-perf-test | grep "ms"
```

### Comparing Payload Types

Notice in MQTT logs:
- Binary parsing is typically 50% faster than JSON
- For high-load scenarios, use binary format
- JSON suitable for low-frequency or administrative messages

## Cleanup After Testing

### Stop All Tests
```bash
npx pm2 stop all
npx pm2 delete all
```

### Stop Specific Tests
```bash
npx pm2 stop sdk-serial-perf-test sdk-mqtt-perf-test
npx pm2 delete sdk-serial-perf-test
```

### Preserve Log History
```bash
# Copy logs before cleanup
mkdir backup-logs-$(date +%Y%m%d)
cp -r ./logs/* backup-logs-$(date +%Y%m%d)/

# View historical logs
Get-Content ./logs/sdk-serial-perf-output.log
```

## Advanced Usage

### Custom PM2 Configuration

Modify `ecosystem.config.js` to adjust:
- **Memory limits**: `max_memory_restart: '2G'`
- **Auto-restart**: `autorestart: true`
- **Watch mode**: `watch: ['src/']` (auto-restart on changes)
- **Node args**: `node_args: '--max-old-space-size=4096'`

### Saving Process Snapshots
```bash
npx pm2 save      # Save current process list
npx pm2 startup   # Enable auto-start on system reboot
npx pm2 resurrect # Restore from saved snapshot
```

### Running in Production Mode

```bash
# Install pm2-logrotate for log rotation
npx pm2 install pm2-logrotate

# Run with production settings
NODE_ENV=production npx pm2 start ecosystem.config.js
```

## Troubleshooting

### Tests Not Running
```bash
# Check if PM2 daemon is running
npx pm2 list

# View PM2 logs
npx pm2 logs PM2

# Restart PM2 daemon
npx pm2 kill
npx pm2 start ecosystem.config.js
```

### High Memory Usage
```bash
# Check memory in real-time
npx pm2 monit

# Reduce max memory limits in ecosystem.config.js
max_memory_restart: '512M'

# Manually clear memory
npx pm2 restart sdk-serial-perf-test
```

### Logs Growing Large
```bash
# Manually rotate logs
npx pm2 flush

# View current log sizes
Get-ChildItem ./logs/ | Measure-Object -Property Length -Sum
```

### Reader Connection Issues

If using active reader testing:
```bash
# Check reader logs
npx pm2 logs rfid-reader-app

# View reader error log
Get-Content ./logs/rfid-reader-error.log

# Verify connection settings in GUI before running tests
```

## Integration with CI/CD

```bash
# GitHub Actions example
- name: Run Performance Tests
  run: |
    npm install -g pm2
    npx pm2 start ecosystem.config.js
    sleep 30s
    npx pm2 list
    npx pm2 report
    npx pm2 delete all
```

## Summary of Commands

| Task | Command |
|------|---------|
| Run all baseline tests | `npx pm2 start ecosystem.config.js` |
| Run Serial tests | `npx pm2 start ecosystem.config.js --only sdk-serial-perf-test` |
| Run MQTT tests | `npx pm2 start ecosystem.config.js --only sdk-mqtt-perf-test` |
| Monitor live | `npx pm2 monit` |
| View logs | `npx pm2 logs` |
| Get process info | `npx pm2 info sdk-serial-perf-test` |
| Stop all | `npx pm2 stop all` |
| Clean up | `npx pm2 delete all` |
| Save state | `npx pm2 save` |

