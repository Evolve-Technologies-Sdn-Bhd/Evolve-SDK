# PM2 Performance Testing Guide

## Overview
This guide explains how to use PM2 to manage and monitor performance tests for your Evolve SDK project.

## Prerequisites
```bash
npm install -g pm2
# Install pm2-logrotate for automatic log rotation
pm2 install pm2-logrotate
```

## Starting Performance Tests

### Option 1: Run Individual Tests
```bash
# SDK performance test only
pm2 start ecosystem.config.js --only sdk-perf-test

# GUI performance test only
pm2 start ecosystem.config.js --only gui-perf-test

# Both tests
pm2 start ecosystem.config.js
```

### Option 2: Run with Sequential Execution
```bash
pm2 start ecosystem.config.js --only sdk-perf-test
# Wait for SDK tests to complete...
pm2 start ecosystem.config.js --only gui-perf-test
```

## Monitoring Performance Tests

### Real-time Monitoring
```bash
# View live process status and resources
pm2 monit

# Watch full output
pm2 watch
```

### View Logs
```bash
# Real-time log output
pm2 logs sdk-perf-test
pm2 logs gui-perf-test

# Last N lines
pm2 logs sdk-perf-test --lines 100

# View errors only
pm2 logs sdk-perf-test --err
```

### Process Status
```bash
# List all processes
pm2 list

# Detailed info about a process
pm2 info sdk-perf-test
pm2 info gui-perf-test

# Show process identifiers and IDs
pm2 ps
```

## Performance Metrics

### Generate Reports
```bash
# Memory usage during test
pm2 report

# Export process list as JSON
pm2 export json
```

### View Available Data
The ecosystem config is set up to capture:
- **CPU Usage**: Real-time monitoring via pm2 monit
- **Memory Usage**: Max 1GB (SDK) / 2GB (GUI) before restart
- **Execution Time**: Measured by sandbag performance tests
- **Logs**: Stored in ./logs/ directory
  - SDK: `logs/sdk-perf-error.log` and `logs/sdk-perf-output.log`
  - GUI: `logs/gui-perf-error.log` and `logs/gui-perf-output.log`

## Cleanup After Testing

### Stop All Tests
```bash
pm2 stop all
pm2 delete all
```

### Stop Specific Tests
```bash
pm2 stop sdk-perf-test
pm2 delete sdk-perf-test
```

### View Historical Logs
```bash
# Logs are saved in ./logs/ directory
# Check logs after tests complete
Get-Content .\logs\sdk-perf-output.log
Get-Content .\logs\gui-perf-output.log
```

## Advanced Usage

### Save Process List for Recovery
```bash
pm2 save
pm2 startup
# This allows PM2 to restart processes on system restart
```

### Run Tests with Custom Node Args
Edit `ecosystem.config.js` to add:
```javascript
node_args: '--max-old-space-size=4096',
```

### Run Sequential Tests (One After Another)
```bash
# Custom script to run sequential tests
pm2 start sdk-perf-test
# Wait for completion, then:
pm2 start gui-perf-test
```

## Interpreting Sandbag Results
The `test:sandbag` scripts run performance benchmarks. Look for:
- **Execution time**: Lower is better
- **Memory allocations**: Fewer is better
- **Garbage collection**: Fewer collections is better

Check the test output logs for detailed metrics:
```bash
pm2 logs sdk-perf-test
pm2 logs gui-perf-test
```

## Troubleshooting

### Tests Not Starting
```bash
# Check for errors
pm2 logs sdk-perf-test --err
pm2 logs gui-perf-test --err

# Verify working directory
pm2 info sdk-perf-test
```

### Memory Issues
If you see "max_memory_restart" triggers:
1. Increase the threshold in ecosystem.config.js
2. Check logs for memory leaks
3. Run one test at a time instead of both

### Log Files Growing Large
```bash
# pm2-logrotate handles this automatically
# Or manually clear old logs
Remove-Item .\logs\* -Recurse
```

## Integration with CI/CD
To integrate with your CI/CD pipeline:
```bash
pm2 start ecosystem.config.js
pm2 save
# Wait for tests to complete
pm2 report
```
