# Evolve SDK RFID Application

The **Evolve SDK RFID Application** is a comprehensive desktop utility designed for managing, monitoring, and interacting with RFID readers. Built on a modern stack using **Electron**, **React**, and **TypeScript**, it provides a robust interface for both serial and network-based RFID operations.

## 🚀 Key Features

-   **Multi-Protocol Support**: Seamlessly connect to RFID readers via **Serial (COM)**, **TCP/IP**, and **MQTT**.
-   **Real-Time Monitoring**: Visualize tag reads, signal strength (RSSI), and reader status in real-time.
-   **Data Management**:
    -   **Live Dashboard**: View cumulative tag counts, unique tag identification, and raw data streams.
    -   **Filtering**: Apply dynamic filters to isolate specific tags or data patterns.
    -   **Export**: Export collected data to CSV/Excel formats for external analysis.
-   **Integrated Documentation**: Access user manuals, API references, and troubleshooting guides directly within the app.
-   **Performance Benchmarking**: Includes "Sandbag" performance tests to verify system throughput and stability under load.

## 🛠️ Technology Stack

-   **Frontend**: React 18, Tailwind CSS, Vite
-   **Backend/Runtime**: Electron, Node.js
-   **Language**: TypeScript
-   **Communication**: `serialport`, `mqtt`, `net` (TCP)
-   **Database**: `sql.js` / `better-sqlite3` for local data persistence
-   **Testing**: Jest, React Testing Library

## 📦 Installation & Setup

### Prerequisites

-   **Node.js**: v18 or higher
-   **npm**: v9 or higher

### 1. Clone the Repository

```bash
git clone <repository-url>
cd EvolveSDK
```

### 2. Install Dependencies

The project is structured as a monorepo with a `gui` (Electron app) and an `sdk` (Core logic). You need to install dependencies for both.

**Install SDK Dependencies:**
```bash
cd sdk
npm install
npm run build  # Important: Build the SDK first!
```

**Install GUI Dependencies:**
```bash
cd ../gui
npm install
```

## 🏃‍♂️ Running the Application

### Development Mode

To run the application in development mode with hot-reloading:

```bash
cd gui
npm run dev
```
This command concurrently starts the Vite dev server and the Electron main process.

### Production Build

To build the standalone executable (`.exe`):

1.  **Ensure the SDK is built**:
    ```bash
    cd sdk
    npm run build
    ```

2.  **Build the GUI**:
    ```bash
    cd ../gui
    npm run build
    ```

The output installer/executable will be located in `gui/dist_electron/`.

## 🧪 Testing

The project includes a comprehensive test suite covering both the GUI components and the core SDK logic.

**Run All Tests:**
```bash
# In 'gui' directory
npm test
```

**Run Performance Benchmarks:**
```bash
# In 'sdk' directory
npm run test:sandbag       # General performance
npm run test:serial-perf   # Serial communication benchmarks
npm run test:mqtt-perf     # MQTT communication benchmarks
```

## 📚 Documentation

Detailed documentation is available in the `docs/` directory:

-   [**API Reference**](docs/API_REFERENCE.md): Technical details on SDK methods and events.
-   [**Troubleshooting Guide**](docs/TROUBLESHOOTING_GUIDE.md): Solutions for common connection and runtime issues.
-   [**Implementation Summary**](docs/IMPLEMENTATION_SUMMARY.md): Overview of the system architecture and design decisions.

## 🤝 Contributing

1.  Fork the repository.
2.  Create a feature branch (`git checkout -b feature/amazing-feature`).
3.  Commit your changes (`git commit -m 'Add some amazing feature'`).
4.  Push to the branch (`git push origin feature/amazing-feature`).
5.  Open a Pull Request.

## 📄 License

(c) 2026 Evolve Technology Platform. All rights reserved.
