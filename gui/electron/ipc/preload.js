import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  connectReader: (config) => ipcRenderer.invoke('reader:connect', config),
  connectMqtt: (brokerUrl, topic, options) => ipcRenderer.invoke('reader:connect-mqtt', { brokerUrl, topic, options }),
  publishMqtt: (tag, topic) => ipcRenderer.invoke('mqtt:publish', { tag, topic }),
  disconnectReader: () => ipcRenderer.invoke('reader:disconnect'),
  startScan: () => ipcRenderer.send('reader:start-scan'),
  stopScan: () => ipcRenderer.send('reader:stop-scan'),
  onTagRead: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('rfid:tag-read', subscription);
    return () => ipcRenderer.removeListener('rfid:tag-read', subscription);
  },
  removeTagListener: () => ipcRenderer.removeAllListeners('rfid:tag-read'),
  onStats: (callback) => {
    const subscription = (_event, stats) => callback(stats);
    ipcRenderer.on('rfid:stats', subscription);
    return () => ipcRenderer.removeListener('rfid:stats', subscription);
  },
  removeStatsListener: () => ipcRenderer.removeAllListeners('rfid:stats'),
  onRawData: (callback) => {
    const subscription = (_event, packet) => callback(packet);
    ipcRenderer.on('rfid:raw-data', subscription);
    return () => ipcRenderer.removeListener('rfid:raw-data', subscription);
  },
  onDisconnected: (callback) => ipcRenderer.on('rfid:disconnected', (_event, data) => callback(data)),
  removeRawDataListener: () => ipcRenderer.removeAllListeners('rfid:raw-data'),

  // Utility to clear all data stream listeners at once (used for refresh)
  clearAllDataListeners: () => {
    ipcRenderer.removeAllListeners('rfid:tag-read');
    ipcRenderer.removeAllListeners('rfid:raw-data');
  },

  onSystemMessage: (callback) => {
    const subscription = (_event, message, level) => callback(message, level);
    ipcRenderer.on('system:message', subscription);
    return () => ipcRenderer.removeListener('system:message', subscription);
  },
  removeSystemMessageListener: () => ipcRenderer.removeAllListeners('system:message'),

  onOpenSettings: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('menu:open-settings', subscription);
    return () => ipcRenderer.removeListener('menu:open-settings', subscription);
  },
  saveSettings: (settings) => ipcRenderer.invoke('reader:configure', settings),

  onExportLogsTrigger: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('menu:export-logs', subscription);
    return () => ipcRenderer.removeListener('menu:export-logs', subscription);
  },
  saveLogs: (logContent) => ipcRenderer.invoke('logs:save-to-file', logContent),

  onExportDataTrigger: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('menu:export-data', subscription);
    return () => ipcRenderer.removeListener('menu:export-data', subscription);
  },

  saveDataCSV: (data, days) => ipcRenderer.invoke('data:save-csv', { content: data, days }),
  
  // Export data from database
  getExportData: (days) => ipcRenderer.invoke('data:export-database', days),
  saveExportedCSV: (content, days, isExcel) => ipcRenderer.invoke('data:save-csv', { content, days, isExcel }),

  listSerialPorts: () => ipcRenderer.invoke('serial:list-ports'),
  connectSerial: (config) => {
    console.log('[Preload] connectSerial config:', config);
    return ipcRenderer.invoke('reader:connect-serial', config);
  },

  resetCounters: () => ipcRenderer.invoke('reader:reset-counters'),
});
