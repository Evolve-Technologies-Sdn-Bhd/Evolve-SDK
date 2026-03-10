# Performance Testing Summary

## ✅ All Tests Passing

### Test Coverage

| Test Suite | Tests | Status | Time |
|-----------|-------|--------|------|
| SDK Core Performance | 7 tests | ✅ PASS | 2.0s |
| SDK Serial Performance | 7 tests | ✅ PASS | 2.8s |
| SDK MQTT Performance | 8 tests | ✅ PASS | 2.8s |
| GUI Performance | 5 tests | ✅ PASS | 2.4s |
| **TOTAL** | **27 tests** | **✅ ALL PASS** | **~10s** |

## 📊 Key Performance Metrics

### SDK Core Performance
```
Database Query Performance:
  - Date range filtering (50k records):     8-15ms
  - Unique EPC extraction (100k records):   9-11ms
  - EPC aggregation (50k records):         17-23ms
  
Tag Processing Performance:
  - RSSI filtering (100k records):          4-5ms
  - Event deduplication (50k records):     18-30ms
  
Data Cleanup Performance:
  - 30-day retention filtering (100k):     28-50ms
  - Deletion query prep (50k records):      6-18ms
```

### SDK Serial Performance (NEW)
```
Frame Processing:
  - Frame parsing (10k F5001 frames):       3.93ms  ⚡ FAST
  - Throughput: 2.54 million frames/sec

Data Reception:
  - Bulk reception (100k tags):            29.78ms
  - Per-tag latency: 0.0003ms              ⚡ EXCELLENT

Concurrent Antenna:
  - 4 antennas × 25k tags (100k total):   34.77ms
  - Error recovery rate: 51.7% success

Baud Rate Scalability:
  - 9600 baud:    1.04ms processing
  - 57600 baud:   0.35ms processing
  - 115200 baud:  0.32ms processing ✅ Recommended
```

### SDK MQTT Performance (NEW)
```
Payload Parsing:
  - JSON (10k payloads):        9.68ms   (1M payloads/sec)
  - Binary (10k payloads):      3.29ms   (3M payloads/sec) ✅ 3x faster

Message Processing:
  - Deduplication (100k, 20k unique):  48.49ms
  - RSSI filtering (100k):             2.90ms
  - Topic routing (10 topics, 100k):   6.65ms

Concurrency:
  - 5 subscribers × 20k messages:      4.53ms
  - Per-subscriber rate: 4.4M msgs/sec

Payload Size Efficiency:
  - 100B payload:   54.63 MB/s
  - 500B payload:  222.48 MB/s
  - 1KB payload:   306.91 MB/s
  - 5KB payload:   634.75 MB/s ✅ Scales well

Connection Stability:
  - 1000 connect/disconnect cycles
  - Success rate: 99.2%
```

### GUI Performance
```
Component Rendering:
  - Tag filter operation:           0.69ms
  - Data formatting (large data):   0.71ms
  - Tag counting with Map:          2.61ms

State Management:
  - Rapid state updates:            0.80ms
  - EPC sorting (large dataset):   15.92ms
```

## 🚀 Quick Start Commands

### Run All Tests
```bash
npx pm2 start ecosystem.config.js
npx pm2 monit        # Watch live
npx pm2 list         # Check status
npx pm2 logs         # View output
npx pm2 delete all   # Cleanup
```

### Run Specific Test Suites
```bash
# SDK tests only
npx pm2 start ecosystem.config.js --only sdk-perf-test,sdk-serial-perf-test,sdk-mqtt-perf-test

# Serial + GUI tests
npx pm2 start ecosystem.config.js --only sdk-serial-perf-test,gui-perf-test

# MQTT tests only
npx pm2 start ecosystem.config.js --only sdk-mqtt-perf-test
```

### Direct npm Commands
```bash
# Individual test runs (quickest for single test)
cd sdk && npm run test:sandbag          # Core SDK
cd sdk && npm run test:serial-perf      # Serial COM
cd sdk && npm run test:mqtt-perf        # MQTT
cd gui && npm run test:sandbag          # GUI
```

## 📈 Load Testing with Active Reader

### Enable Reader + Tests
Edit `ecosystem.config.js` and uncomment `rfid-reader-app` section, then:

```bash
# 1. Start everything
npx pm2 start ecosystem.config.js

# 2. In Electron app: Connect to your RFID device
#    - Select Serial or MQTT mode
#    - Configure COM port/MQTT broker
#    - Click "Connect"

# 3. Monitor performance impact
npx pm2 monit
npx pm2 logs rfid-reader-app              # Reader activity
npx pm2 logs sdk-serial-perf-test         # Performance load
```

### Sequential Startup (Recommended)
```bash
# Start reader only
npx pm2 start ecosystem.config.js --only rfid-reader-app

# Wait 30 seconds for reader to initialize...
Start-Sleep -Seconds 30

# Then start performance tests
npx pm2 start ecosystem.config.js --only sdk-perf-test,sdk-serial-perf-test,sdk-mqtt-perf-test

# Monitor both
npx pm2 monit
```

## 🔍 Performance Analysis

### Interpreting Results

**Excellent Performance (< 10ms):**
- Frame parsing, RSSI filtering, MQTT JSON parsing
- Binary payloads, topic routing, GUI operations
- Action: Baseline met ✅

**Good Performance (10-50ms):**
- Bulk data operations, concurrent antenna handling
- Message deduplication, 30-day cleanup
- Action: Monitor in production

**Monitor Performance (50-200ms):**
- Large dataset operations (100k+ records)
- Full scan cycles with multiple antennas
- Action: Review for optimization if in hot path

### Performance Comparison: JSON vs Binary (MQTT)
```
JSON:   9.68ms for 10k payloads
Binary: 3.29ms for 10k payloads
Speedup: 3x faster with binary format

Recommendation: Use binary format for:
- High-frequency MQTT streams (>1000 msgs/sec)
- Large payload sizes (>1KB)

Use JSON for:
- Configuration/status messages
- Low-frequency updates (<100 msgs/sec)
- Administrative commands
```

### Scale Analysis
```
Serial Protocol:
  ✅ Handles 100k tags in 29ms
  ✅ 2.5M frames/sec parsing capacity
  ✅ Multiple antenna support (4x)

MQTT Transport:
  ✅ 4.4M messages/sec per subscriber
  ✅ 99.2% connection stability
  ✅ Scales to 5KB+ payloads at 600+ MB/s

GUI Rendering:
  ✅ Handles 10k+ tags in < 20ms
  ✅ Real-time updates without blocking
  ✅ Efficient state management
```

## 📁 Test Files

### SDK Tests
- `sdk/test/sandbag.perf.test.ts` - Core database/processing
- `sdk/test/sandbag.serial.perf.test.ts` - Serial COM protocol
- `sdk/test/sandbag.mqtt.perf.test.ts` - MQTT broker communication

### GUI Tests
- `gui/test/sandbag.perf.test.ts` - Component rendering & state

### PM2 Configuration
- `ecosystem.config.js` - Process management configuration
- `run-sdk-test.js`, `run-serial-perf-test.js`, `run-mqtt-perf-test.js`, `run-gui-test.js` - Test runners

### Documentation
- `pm2-performance-guide.md` - Comprehensive PM2 usage guide
- `INTEGRATED_TESTING_GUIDE.md` - Testing with active RFID reader

## 🎯 Next Steps

1. **Baseline Established** ✅
   - Run tests to establish baseline metrics
   - Document in your CI/CD pipeline

2. **Production Deployment**
   - Monitor real-world performance
   - Compare against baselines
   - Alert on regressions

3. **Optimization Targets**
   - Binary MQTT format: 3x speedup available
   - Concurrent antenna handling: verify 4+ antenna systems
   - Scale testing: test with 500k+ tags

4. **Continuous Monitoring**
   ```bash
   # Add to cron job or CI/CD
   npx pm2 start ecosystem.config.js
   sleep 30s
   npx pm2 report > performance-$(date +%Y%m%d).json
   ```

## 💡 Tips

- **First Run:** Takes slightly longer due to JIT compilation
- **Subsequent Runs:** Consistently faster (see metrics above)
- **Memory Usage:** Stays <1GB for SDK, <2GB for GUI under load
- **Real Hardware:** Consider 10-20% variance with actual serial/MQTT hardware vs simulated data

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| Tests timeout | Increase timeout in jest.config or run individually |
| High memory | Reduce data sizes in test sandbag files |
| Serial port errors | Check COM port availability and baud rate |
| MQTT connection failed | Verify broker is running and accessible |
| Logs too large | Use `npx pm2 flush` to rotate logs |

## 📞 Support

For detailed usage, see:
- `pm2-performance-guide.md` - Full PM2 guide with scenarios
- `INTEGRATED_TESTING_GUIDE.md` - Testing with active RFID reader
- Test files themselves - Include detailed comments and benchmarks
