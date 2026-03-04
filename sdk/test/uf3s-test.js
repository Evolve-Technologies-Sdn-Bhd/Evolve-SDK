const net = require("net");

const READER_IP = "192.168.1.100";
const READER_PORT = 8088;

let buffer = "";

const client = new net.Socket();

client.connect(READER_PORT, READER_IP, () => {
    console.log("✅ Connected to UF3S server");

    setTimeout(() => {
        startInventory();
    }, 1000);
});

function send(obj) {
    const msg = JSON.stringify(obj) + "$";
    console.log("📤 Sending:", msg);
    client.write(msg);
}

// =================================
// START INVENTORY (numeric codes)
// =================================
function startInventory() {
    console.log("🚀 Starting continuous inventory...");

    send({
        code: 2005,
        data: {
            antennaEnable: 1
        }
    });

    setTimeout(() => {
        send({
            code: 2006,
            data: {
                type: 1, // 1 for continuous inventory
                time: 0  // 0 for infinite until stopped
            }
        });
    }, 200);
}

// =================================
// STOP INVENTORY
// =================================
function stopInventory() {
    console.log("🛑 Stopping inventory...");

    send({
        code: 2005,
        data: {
            antennaEnable: 0
        }
    });
}

client.on("data", (data) => {
    buffer += data.toString();

    let parts = buffer.split("$");
    buffer = parts.pop();

    parts.forEach(msg => {
        if (!msg.trim()) return;

        try {
            const json = JSON.parse(msg);
            console.log("📥 Received:", JSON.stringify(json, null, 2));
        } catch (e) {
            console.log("❌ Invalid JSON:", msg);
        }
    });
});

client.on("error", (err) => {
    console.error("❌ TCP Error:", err.message);
});

client.on("close", () => {
    console.log("🔌 Connection closed");
});

// Stop after 20 seconds
setTimeout(() => {
    stopInventory();
}, 20000);