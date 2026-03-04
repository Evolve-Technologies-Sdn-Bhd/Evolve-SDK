/*connect() – Establishes the physical or logical connection (e.g., opens a serial port, connects a TCP socket, or subscribes to an MQTT topic). Returns a Promise that resolves on success.

disconnect() – Closes the connection and releases resources.

send(data) – Transmits raw binary data over the medium.

onData(callback) – Registers a handler that receives incoming raw data buffers from the reader.

onError(callback) – Registers a handler for low‑level errors (e.g., port busy, connection refused).

isConnected() – Returns the current connection status.*/
