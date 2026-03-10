# RFID Hardware Troubleshooting Guide

A practical guide to diagnose and resolve hardware and physical connectivity issues with RFID readers. For SDK error codes, see [ERROR_HANDLING.md](ERROR_HANDLING.md).

---

## Quick Troubleshooting by Symptom

### **Reader Not Responding**

**Physical Checks:**

1. **Verify reader is powered on**
   - Check power cable is connected to wall outlet
   - Check power indicator LED on reader (should be lit)
   - Listen for fan noise or activity sounds
   - Check power switch is in ON position

2. **Serial/USB Connection**
   - **Check USB cable connection:**
     - Verify USB cable is fully inserted into reader USB port
     - Verify USB cable is fully inserted into computer USB port
     - Try different USB port on computer
     - Try different USB cable (cable may be damaged)
   
   - **Verify port is detected:**
     - Windows: Open Device Manager → Ports (COM & LPT)
     - Look for "COM3", "COM4", etc. - reader should appear here
     - If missing or shows "Unknown Device", reinstall drivers

   - **Test with different USB port:**
     - Avoid USB 3.0 ports (use USB 2.0 if available)
     - Avoid USB hubs if possible - connect directly to computer

3. **Network Connection (TCP/Ethernet)**
   - **Check Ethernet cable:**
     - Verify RJ45 cable is firmly connected to reader
     - Verify RJ45 cable is firmly connected to network switch/router
     - Check for damaged pins in connector
     - Try different Ethernet cable
   
   - **Verify network connectivity:**
     - Check if reader LED shows Network Activity (blinking)
     - Check if reader is getting IP address (check router admin page)
     - Verify reader and computer are on same network
Serial Port Not Showing in Device Manager**
**Physical Issue:** Reader not detected by computer

**Step-by-Step Fix:**

1. **Check USB cable and connection**
   - Verify USB cable is genuine (not low-quality)
   - Try bending cable near connectors to check for broken wires
   - Try different USB port on computer

2. **Check for hardware malfunction**
   - Verify reader powers on
   - Check if any LED is red/error indicator
   - Check if reader makes any unusual noise

3. **Install or update USB drivers**
   - Windows: Open Device Manager
   - Look for "Unknown Device" or device with yellow exclamation mark
   - Right-click → Update driver
   - Choose "Search automatically for drivers" or download from reader manufacturer website

4. **Try on different computer**
   - If reader appears on different computer, issue is with first computer's drivers/ports
   - If reader doesn't appear on any computer, reader hardware may be faulty

---

### **Serial Connection Dropping Constantly**

**Physical Causes:**

1. **Check cable integrity**
   - Inspect USB cable for physical damage
   - Check for bent pins in USB connector
   - Look for loose connections
   - **Replace cable with known good USB cable**
RFID Tags Not Being Read / Missing Tags**

**Hardware Issues:**

1. **Check antenna connection**
   - Verify antenna cable is firmly connected to reader (TNC/SMA connector)
   - Look inside connector for loose or bent pins
   - Try gently wiggling connector to see if connection improves
   - **Try different antenna cable** to isolate issue

2. **Verify antenna placement**
   - Antenna should be within 1-2 meters of tags
   - Antenna should have clear line of sight to tags
   - Antenna should not be blocked by metal objects or water
   - Move antenna away from interference sources

3. **Check for RF interference**
   - Move antenna away from:
     - WiFi routers (2.4GHz interference)
     - Cell phone towers
     - Walkie-talkies
     - Microwave ovens
     - Wireless headphones
   - Check if problem occurs at different location
   - Use metal shielding to isolate antenna from interference sources

4. **TNetwork Connection Issues (Ethernet/TCP)**

**Physical Checks:**

1. **Verify Ethernet connection**
   - Check RJ45 cable is fully inserted into reader (port should be at rear)
   - Check RJ45 cable is fully inserted into network switch/router
   - Verify cable is category 5e or higher (look at cable jacket)
   - Look for LED activity on Ethernet port (should blink when active)

2. **Check network switch/router**
   - If using network switch, verify it's powered on
   - Check switch has power LED lit
   - Try different port on switch
   - Try connecting directly to router (not through switch)

3. **Power cycle network equipment**
   - Restart reader (power off 10 seconds, power on)
   - Restart network router (power off 30 seconds, power on)
   - Wait until reader gets new IP address

4. **Test with different cable**
   - Try a known good Ethernet cable
   - Original cable may have damaged pins or internal wires

5. **Check reader network LED**
   - Locate network LED on reader (usually amber/green)
   - LED should be lit when connected
   - Blinking indicates activity
   - No light = no connection- Access reader web UI dashboard
   - Look for error messages or crashes

---

### **"Invalid Topic" or "Topic Not Found"**
**Error:** `EVRFID-MQTT-004` or `EVRFID-MQTT-005`

**Solution:**
```javascript
// ❌ Invalid topic syntax
sdk.connectMqtt('mqtt://broker.com:1883', 'invalid/topic/');  // Trailing slash
sdk.connectMqtt('mqtt://broker.com:1883', 'topic with spaces');

// ✅ Correct topic syntax
sdk.connectMqtt('mqtt://broker.com:1883', 'rfid/tags');
sdk.connectMqtt('mqtt://broker.com:1883', 'devices/reader-001/tags');
```

**Check MQTT broker ACL rules** - Verify user has publish/subscribe permissions on the topic.

---

### **"Authentication Failed"**
**Error:** `EVRFID-MQTT-003`

**Solution:**
```javascript
// Provide credentials
sdk.connectMqtt(
  'mqtt://broker.example.com:1883',
  'topic',
  {
    username: 'rfid_user',
    password: 'correct_password',
  }
);

// Test credentials with MQTT client
# Using mosquitto-clients (Linux)
mosquiGarbled or Corrupted Tag Data**

**Physical Causes:**

1. **Check RF environment for interference**
   - Metal objects near antenna reflect signals
   - Liquid/moisture absorbs RF signals
   - Electrical interference from nearby devices
   - **Solution:** Move antenna away from metal, water, and electrical equipment

2. **Check antenna cable shielding**
   - Antenna cable should have shielded connector (not bare wires)
   - Check if cable shielding is damaged
   - Route cable away from power cables and electrical equipment

3. **Verify proper antenna impedance matching**
   - Check antenna type matches reader specifications
   - Mismatched impedance causes signal loss
   - Refer to reader manual for correct antenna type

4. **Reduce power level if possible**
   - High power in noisy environments can cause reflections
   - Check reader settings for configurable power levels
   - Try reducing power and see if error rate improves

5. **Check for connector oxidation**
   - Inspect antenna connector for green/white corrosion
   - Clean connector with dry cloth
   - If heavily corroded, replace connector
3. **Reduce reader transmit power** (if adjustable)
   - May reduce noise in noisy RF environment

4. **Test with different RFID tags**
   - Isolate if issue is with specific tags or all tags

---

### **"Out of Memory"**
**Error:** `EVRFID-SYSTEM-002`

**Solution:**

1. **Increase Node.js heap size**
   ```bash
   # Increase max memory to 4GB
   node --max-old-space-size=4096 app.js
   ```

2. **Check for memory leaks**
   - Monitor tag cache size
   - Clear old tag data periodically
   - Check event listeners aren't accumulating

3. **Monitor system memory**
   ```bash
   # Linux
   free -h
   
   # Windows PowerShell
   Get-WmiObject Win32_ComputerSystem
   
   # macOS
   vm_Led Indicators Not Showing / All Red**

**Diagnosis by LED Color:**

| LED Color | Status | Action |
|-----------|--------|--------|
| Green | Normal | OK - no action needed |
| Amber/Orange | Initializing | Wait 30 seconds for boot complete |
| Red | Error | Power cycle reader, check manual |
| Off | No power | Check power connection and cable |
| Blinking | Activity | Normal - data is being transferred |

**If all LEDs are red:**
1. Verify correct power supply is being used (wrong voltage/amperage)
2. Power cycle reader completely
3. Check for internal hardware failure (may need replacement)

**If no LEDs light:**
1. Verify power cable is connected to wall outlet
2. Try different power outlet
3. Try different power cable
4. Check if power switch on reader is ON
5. Check circuit breaker or power strip

---

### **Reader Stops Working After Some Hours**

**Intermittent Hardware Issues:**

1. **Check for thermal issues**
   - Verify reader ventilation is not blocked
   - Check that airflow around reader is adequate
   - Reduce ambient temperature if very hot
   - Ensure reader is not in direct sunlight

2. **Check for loose connectors**
   - Vibration during operation can loosen connectors
   - Check antenna connectors
   - Check power connectors
   - Check Ethernet cable connections

3. **Check for signal degradation**
   - Inspect antenna cable for cracks or damage
   - Check antenna connector for loose or bent pins
   - Verify antenna placement hasn't shifted

4. **Monitor temperature**
   - High temperature can cause reader to thermal-throttle
   - Check reader temperature via web UI if available
   - Ensure adequate ventilation| EVRFID-TAG-* | ❌ No | Data corruption |
| Data | EVRFID-DATA-* | Mixed | Processing issue |
| System | EVRFID-SYSTEM-* | Mixed | System resource |

---

## Diagnostic Checklist

### Before Contacting Support

- [ ] Verified reader is powered on
- [ ] Tested network connectivity (ping, telnet, etc.)
- [ ] Checked corr: Physical Characteristics

| Connection Type | Physical Media | Typical Issues | Troubleshooting Time |
|---|---|---|---|
| **Serial (USB)** | USB Cable | Loose connection, driver issues | 5-10 min |
| **Network (Ethernet)** | RJ45 Cable | Cable damage, port issues | 10-15 min |
| **MQTT over Network** | Ethernet + Network | Network outage, router issues | 15-20 min |

---

## Hardware Checklist for Setup

### Before Using Reader:

- [ ] Reader is powered on (power light is green/amber, not red)
- [ ] All cables are firmly connected (USB or Ethernet)
- [ ] Antenna is properly connected to reader
- [ ] No visible physical damage to cables or connectors
- [ ] Reader is in acceptable operating environment (not too hot, not too cold)
- [ ] Reader is detected by computer/network
Hardware Diagnostic Tools

### Windows

**Device Manager** - Check USB devices and serial ports
- Right-click Start → Device Manager
- Look for Ports (COM & LPT)
- Reader should show as COM port (e.g., COM3)

**Network Connection** - Check Ethernet connectivity
- Settings → Network & Internet → Ethernet
- Should show "Connected" status
- Note IP address of reader

### Linux/macOS

**List serial ports:**
```bash
# macOS
ls /dev/tty.usb*

# Linux
ls /dev/ttyUSB* /dev/ttyACM*
```

**Check Ethernet connection:**
```bash
ifconfig  # Show network interfaces
ip link   # Show link status
```

**Test network connectivity:**
```bash
ping 192.168.1.100           # Test if device responds
arp -a                       # Show connected devices on network
```
4. **Open issue** with: error code + full error message + steps to reproduce

ader Specifications Checklist

Before Troubleshooting - Verify You Have:

- [ ] Reader Model Number (e.g., UF3-S, F5001)
- [ ] Reader Firmware Version (check via web UI or manual)
- [ ] Correct antenna type for reader model
- [ ] Correct power supply specifications
- [ ] Reader installation manual
- [ ] Network specifications (if network-connected)
- [ ] List of supported RFID tag types
- [ ] Operating temperature range for your environment

---

## Resources

- **SDK Error Codes:** [ERROR_HANDLING.md](ERROR_HANDLING.md)
- **Connection Guides:**
  - [SERIAL_CONNECTION_GUIDE.md](SERIAL_CONNECTION_GUIDE.md)
  - [MQTT_CONNECTION_GUIDE.md](MQTT_CONNECTION_GUIDE.md)
- **Implementation:** [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)
- **Reader Hardware:** Refer to manufacturer manual for your specific model

---

## When to Contact Hardware Support

Contact the reader manufacturer if:

1. **Reader won't power on**
   - Tried different power outlet
   - Tried different power cable
   - No response after 5 minutes

2. **Physical damage to reader**
   - Cracked casing
   - Bent connectors
   - Water damage
   - Burned smell

3. **All troubleshooting steps completed** with no success
   - Include reader model and serial number
   - Include what steps you've already tried
   - Include LED indicator status
   - Include any error messages displayed on reader