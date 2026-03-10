# Quick Reference: Evolve SDK Performance Testing

## 🚀 One-Liner Commands

```bash
# Run ALL tests with PM2
npx pm2 start ecosystem.config.js && npx pm2 monit

# Run just Serial + MQTT tests
npx pm2 start ecosystem.config.js --only sdk-serial-perf-test,sdk-mqtt-perf-test

# Run SDK tests with active RFID reader
npx pm2 start ecosystem.config.js  # Uncomment rfid-reader-app first!

# Quick test without PM2 (fastest)
cd sdk && npm run test:serial-perf && npm run test:mqtt-perf

# Cleanup
npx pm2 delete all
```

## 📊 Test Performance at a Glance

```
SERIAL COM:                               MQTT:
├─ Frame parsing:          3.93ms ⚡      ├─ JSON parsing:         9.68ms
├─ 100k tags:             29.78ms        ├─ Binary parsing:        3.29ms ⚡
├─ 4 antenna concurrent:  34.77ms        ├─ 100k messages:        48.49ms
└─ Error recovery:        98.3% okay      └─ Connection stability: 99.2% ✅

CORE SDK:                                 GUI:
├─ Database filters:      8-15ms          ├─ Tag filtering:       <1ms ⚡
├─ Dedup (50k):          23.86ms          ├─ State updates:       <1ms ⚡
├─ 30-day cleanup:       50ms             └─ EPC sorting:         15.92ms
└─ Deletion prep:         7.80ms
```

## 🎯 Test Scenarios

| Scenario | Command | Use Case |
|----------|---------|----------|
| **Baseline** | `npx pm2 start ecosystem.config.js` | Measure without reader |
| **Serial Load** | `... --only sdk-serial-perf-test` | Test com throughput |
| **MQTT Load** | `... --only sdk-mqtt-perf-test` | Test broker performance |
| **With Reader** | Enable in config, `npx pm2 start ecosystem.config.js` | Real-world testing |
| **Sequential** | Start reader, wait 30s, start tests | Impact analysis |

## 📈 Key Metrics You Should Know

```
Serial: 2.5 million frames/second processing ⚡
MQTT:   3x faster with binary vs JSON format
GUI:    Handles 10k+ tags with <20ms latency
Scale:  Supports 100k+ concurrent RFID tag events
```

## 🔧 Useful PM2 Commands

```bash
# View everything
npx pm2 list              # Process list
npx pm2 monit             # Live dashboard
npx pm2 logs              # Stream all logs

# Specific test logs
npx pm2 logs sdk-serial-perf-test
npx pm2 logs sdk-mqtt-perf-test
npx pm2 logs rfid-reader-app      # If enabled

# Get info
npx pm2 info sdk-serial-perf-test
npx pm2 info sdk-mqtt-perf-test

# Control
npx pm2 stop all          # Stop all
npx pm2 restart sdk-serial-perf-test  # Restart one
npx pm2 delete all        # Delete/cleanup
npx pm2 flush             # Rotate logs
```

## 📁 Important Files

```
ecosystem.config.js                  - PM2 configuration (edit to enable reader)
PERFORMANCE_TEST_RESULTS.md         - Detailed metrics & analysis
pm2-performance-guide.md            - Complete usage guide
INTEGRATED_TESTING_GUIDE.md         - Testing with active reader

sdk/test/sandbag.serial.perf.test.ts - Serial COM tests
sdk/test/sandbag.mqtt.perf.test.ts   - MQTT tests
gui/test/sandbag.perf.test.ts        - GUI tests
```

## ⚡ Pro Tips

1. **Fastest way to run tests:**
   ```bash
   cd sdk && npm run test:serial-perf && npm run test:mqtt-perf
   ```

2. **Enable reader testing:**
   - Edit `ecosystem.config.js`, uncomment `rfid-reader-app`
   - Run `npx pm2 start ecosystem.config.js`
   - App opens automatically, configure RFID device

3. **Compare JSON vs Binary MQTT:**
   - See 3x speedup with binary format
   - Look for "Binary parsing" in logs
   - Use for high-throughput scenarios

4. **Monitor real performance:**
   ```bash
   npx pm2 monit          # CPU/Memory live
   npx pm2 logs | grep ms # Timing metrics
   ```

5. **Save performance baseline:**
   ```bash
   npx pm2 report > baseline-$(date +%Y%m%d).json
   ```

## 🎓 What Each Test Measures

**Serial Tests:**
- Can your device handle frame throughput? ✅ 2.5M frames/sec
- How fast can we deduplicate? ✅ 23ms for 50k tags
- Multi-antenna capable? ✅ 100k tags in 34ms

**MQTT Tests:**
- Should I use binary or JSON? ✅ Binary is 3x faster
- Can broker handle message volume? ✅ 4.4M msgs/sec
- What's max payload size? ✅ 634 MB/s at 5KB

**SDK Tests:**
- Database fast enough? ✅ 8-50ms operations
- Data cleanup efficient? ✅ 50ms for 100k records

**GUI Tests:**
- Can UI keep up? ✅ <20ms for 10k tags
- State updates responsive? ✅ <1ms updates

## 💡 When Something Seems Slow

```
> 50ms for standard operation?
  → Check logs for actual numbers
  → Run baseline without reader
  → Compare against metrics above

Memory growing during tests?
  → Normal for large datasets
  → Should reset between tests
  → Check max_memory_restart in config

Test hangs?
  → Check PM2 logs (npx pm2 logs)
  → Verify reader is connected (if enabled)
  → Try smaller batch sizes in test
```

## 🔗 Related Commands

```bash
# Install PM2 (one-time)
npm install -g pm2

# Run tests via npm directly
npm run test:sandbag           # SDK core (in sdk/)
npm run test:serial-perf       # Serial (in sdk/)
npm run test:mqtt-perf         # MQTT (in sdk/)
npm run test:sandbag           # GUI (in gui/)

# Run all SDK tests
npm run test                   # Full test suite with coverage
npm run test:watch            # Watch mode for development
```

## 🎯 Typical Workflow

```bash
# 1. Check baseline (no reader)
npx pm2 start ecosystem.config.js
npx pm2 monit
# Watch for ~10 seconds
# Press Ctrl+C to quit

# 2. Check with reader active (optional)
# Edit ecosystem.config.js, uncomment rfid-reader-app
npx pm2 start ecosystem.config.js
# Click "Connect" in app for your RFID device
npx pm2 monit
# Compare metrics with step 1

# 3. Cleanup
npx pm2 delete all
```

---

**Last Updated:** 2026-03-10  
**Test Suite:** 27 tests covering Serial, MQTT, SDK, GUI  
**All Tests:** ✅ PASSING
