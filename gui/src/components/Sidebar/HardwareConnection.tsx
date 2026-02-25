// gui/src/components/Sidebar/HardwareConnection.tsx
import React, { useState } from 'react';
import { Settings, X, RefreshCw, Info } from 'lucide-react';
import { sdkService } from '../../services/sdkService';

export default function HardwareConnection() {
  const [mode, setMode] = useState<'serial' | 'tcp' | 'mqtt'>('tcp');
  const [connected, setConnected] = useState(false);
  const [isMqttModalOpen, setMqttModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  
  // Serial Form State
  const [serialConfig, setSerialConfig] = useState({
    comPort: 'COM4',
    baudRate: 115200,
    // FIX 1: Set default to 'BB' because we know it's an F5001/Sanray reader
    protocol: 'BB' 
  });

  // TCP Form State
  const [tcpConfig, setTcpConfig] = useState({
    ip: '192.168.1.100',
    port: 8088
  });
  
  // MQTT Form State
  const [mqttConfig, setMqttConfig] = useState({
    name: 'RFID_Reader_01',
    protocol: 'mqtt://',
    host: 'broker.emqx.io',
    port: 1883,
    topic: 'rfid/tags',
    clientId: 'mqttx_' + Math.random().toString(16).substring(2, 8),
    username: '',
    password: '',
    ssl: false
  });

  // 1. Generic Input Handler
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
        const checked = (e.target as HTMLInputElement).checked;
        setMqttConfig(prev => {
            const newPort = checked ? 8883 : 1883;
            const newProto = checked ? 'mqtts://' : 'mqtt://';
            return { ...prev, [name]: checked, port: newPort, protocol: newProto };
        });
    } else {
        setMqttConfig(prev => ({ ...prev, [name]: value }));
    }
  };

  // 2. Protocol Handler
  const handleProtocolChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const proto = e.target.value;
      const isSecure = proto === 'mqtts://' || proto === 'wss://';
      setMqttConfig(prev => ({
          ...prev,
          protocol: proto,
          ssl: isSecure,
          port: isSecure ? 8883 : 1883
      }));
  };

  // 3. Helper: Regenerate ID
  const regenerateClientId = () => {
    setMqttConfig(prev => ({
      ...prev,
      clientId: 'mqttx_' + Math.random().toString(16).substring(2, 8)
    }));
  };

  // 3.5 Helper: Timeout Wrapper
  const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number = 180000): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs / 1000} seconds`)), timeoutMs)
      ),
    ]);
  };

  // 4. MQTT Submit
  const handleMqttSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const brokerUrl = `${mqttConfig.protocol}${mqttConfig.host}:${mqttConfig.port}`;
      if (!mqttConfig.topic.trim()) throw new Error('Topic is required');
      
      const options: any = { clientId: mqttConfig.clientId };
      if (mqttConfig.username) options.username = mqttConfig.username;
      if (mqttConfig.password) options.password = mqttConfig.password;
      
      console.log('[GUI] MQTT Connection Attempt:', { brokerUrl, topic: mqttConfig.topic });
      
      const result = await withTimeout(
        sdkService.connectMqtt(brokerUrl, mqttConfig.topic, options),
        180000
      );
      
      if (result && result.success === false) throw new Error(result.error || 'Connection failed');
      
      console.log('[GUI] MQTT Connection Successful');
      setConnected(true);
      setMqttModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      try { await sdkService.disconnect(); } catch (e) {}
    } finally {
      setLoading(false);
    }
  };
  
  // 5. Disconnect
  const handleDisconnect = async () => {
    try {
      setError('');
      setLoading(true);
      await sdkService.disconnect();
      setConnected(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };
  
  // 6. Main Connect Toggle
  const handleMainConnectClick = async () => {
    if (connected) {
      await handleDisconnect();
    } else if (mode === 'mqtt') {
      setMqttModalOpen(true);
    } else if (mode === 'serial') {
      await handleSerialConnect();
    } else if (mode === 'tcp') {
      await handleTcpConnect();
    }
  };

  // 7. Serial Connect
  const handleSerialConnect = async () => {
    setError('');
    setLoading(true);
    
    try {
      if (!serialConfig.comPort) throw new Error('COM port is required');
      
      console.log('[GUI] Serial Connection Attempt:', serialConfig);
      
      const result = await withTimeout(
        // @ts-ignore
        window.electronAPI.connectSerial(
            serialConfig.comPort, 
            serialConfig.baudRate, 
            serialConfig.protocol // Sending the correct 'BB' protocol here
        ),
        180000
      );
      
      if (result && result.success === false) throw new Error(result.error || 'Connection failed');
      
      setConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      try { await sdkService.disconnect(); } catch (e) {}
    } finally {
      setLoading(false);
    }
  };

  // 8. TCP Connect
  const handleTcpConnect = async () => {
    setError('');
    setLoading(true);
    try {
      if (!tcpConfig.ip || !tcpConfig.port) throw new Error('IP and Port are required');
      
      const result = await withTimeout(
        sdkService.connect(tcpConfig.ip, tcpConfig.port),
        180000
      );
      
      if (result && result.success === false) throw new Error(result.error || 'Connection failed');
      setConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      try { await sdkService.disconnect(); } catch (e) {}
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="mb-4 p-2 border border-gray-300 rounded bg-white shadow-sm relative">
        <h3 className="text-xs font-bold text-gray-700 mb-2">Connection Configuration</h3>
        
        <div className="flex flex-col gap-1 mb-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="connType" checked={mode === 'serial'} onChange={() => setMode('serial')} disabled={connected} />
            <span>Serial COM</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="connType" checked={mode === 'tcp'} onChange={() => setMode('tcp')} disabled={connected} />
            <span>TCP/IP Mode</span>
          </label>
          <label className='flex items-center gap-2 cursor-pointer'>
            <input type="radio" name="connType" checked={mode === 'mqtt'} onChange={() => setMode('mqtt')} disabled={connected} />
            <span>MQTT Mode</span>
          </label>
        </div>

        {/* --- TCP Controls --- */}
        {mode === 'tcp' && (
          <div className="pl-4 mb-3 border-l-2 border-gray-200">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-500">IP Address</label>
                <input type="text" value={tcpConfig.ip} onChange={(e) => setTcpConfig({...tcpConfig, ip: e.target.value})} className="w-full border p-1 text-xs" disabled={connected} />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500">Port</label>
                <input type="number" value={tcpConfig.port} onChange={(e) => setTcpConfig({...tcpConfig, port: parseInt(e.target.value) || 8088})} className="w-full border p-1 text-xs" disabled={connected} />
              </div>
            </div>
          </div>
        )}

        {/* --- Serial Controls --- */}
        {mode === 'serial' && (
          <div className="pl-4 mb-3 border-l-2 border-gray-200">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-500">COM Port</label>
                <select value={serialConfig.comPort} onChange={(e) => setSerialConfig({...serialConfig, comPort: e.target.value})} className="w-full border p-1 text-xs" disabled={connected}>
                  <option>COM1</option>
                  <option>COM2</option>
                  <option>COM3</option>
                  <option>COM4</option>
                  <option>COM5</option>
                  <option>COM6</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500">Baud Rate</label>
                <select value={serialConfig.baudRate} onChange={(e) => setSerialConfig({...serialConfig, baudRate: parseInt(e.target.value) || 115200})} className="w-full border p-1 text-xs" disabled={connected}>
                  <option value="9600">9600</option>
                  <option value="19200">19200</option>
                  <option value="38400">38400</option>
                  <option value="57600">57600</option>
                  <option value="115200">115200</option>
                  <option value="230400">230400</option>
                </select>
              </div>
              {/* FIX 2: Updated Protocol Dropdown (Removed 'AUTO', Added explicit 'BB' option) */}
              <div className="col-span-2">
                <label className="block text-[10px] text-gray-500">Reader Protocol</label>
                <select 
                  value={serialConfig.protocol}
                  onChange={(e) => setSerialConfig({...serialConfig, protocol: e.target.value})}
                  className="w-full border p-1 text-xs bg-blue-50" 
                  disabled={connected}
                >
                  <option value="BB">BB Protocol (F5001/Sanray)</option>
                  <option value="A0">A0 Protocol (Seuic)</option>
                  <option value="UF3-S">UF3-S</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* --- MQTT Controls --- */}
        {mode === 'mqtt' && (
          <div className="pl-4 mb-3 border-l-2 border-gray-200">
             <button onClick={() => setMqttModalOpen(true)} disabled={connected} type="button" className="w-full flex items-center justify-center gap-2 py-1.5 border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs rounded transition-colors">
               <Settings className="w-3 h-3" />
               Configuration
             </button>
             <div className="mt-1 text-[10px] text-gray-400 text-center truncate px-1">
               {mqttConfig.protocol}{mqttConfig.host}:{mqttConfig.port}
             </div>
          </div>
        )}

        <div className="mb-3 flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-300'}`}></div>
          <span className="text-[10px] text-gray-600">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        <button 
          disabled={loading}
          className={`w-full py-2 px-4 rounded text-white font-bold text-xs transition-colors shadow-sm ${
            loading ? 'bg-gray-400 cursor-not-allowed' : connected ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'
          }`}
          onClick={handleMainConnectClick}
        >
          {loading ? 'Processing...' : connected ? 'Disconnect' : 'Connect'}
        </button>
      </div>

      {/* --- MQTT MODAL --- */}
      {isMqttModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-[550px] animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">New Connection</h3>
              <button onClick={() => setMqttModalOpen(false)} className="text-gray-400 hover:text-red-500"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleMqttSubmit}>
              {error && <div className="bg-red-50 border-b border-red-200 px-6 py-3"><p className="text-[10px] text-red-600">{error}</p></div>}
              <div className="p-6 space-y-5 text-xs">
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="name" className="text-right text-gray-500 font-medium"><span className="text-red-500 mr-1">*</span>Name</label>
                  <div className="col-span-3 relative">
                    <input id="name" name="name" type="text" required disabled={loading} value={mqttConfig.name} onChange={handleInputChange} className="w-full border border-gray-300 rounded px-3 py-1.5 focus:border-blue-500 outline-none" />
                    <Info className="w-3.5 h-3.5 text-gray-300 absolute right-3 top-2" />
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="host" className="text-right text-gray-500 font-medium"><span className="text-red-500 mr-1">*</span>Host</label>
                  <div className="col-span-3 flex gap-2">
                    <div className="w-1/4 relative">
                      <select name="protocol" value={mqttConfig.protocol} onChange={handleProtocolChange} disabled={loading} className="w-full border border-gray-300 rounded px-2 py-1.5 appearance-none bg-white focus:border-blue-500 outline-none">
                        <option value="mqtt://">mqtt://</option>
                        <option value="mqtts://">mqtts://</option>
                        <option value="ws://">ws://</option>
                        <option value="wss://">wss://</option>
                      </select>
                      <div className="absolute right-2 top-2 pointer-events-none text-gray-400">▼</div>
                    </div>
                    <input id="host" name="host" type="text" required disabled={loading} value={mqttConfig.host} onChange={handleInputChange} className="flex-1 border border-gray-300 rounded px-3 py-1.5 focus:border-blue-500 outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="port" className="text-right text-gray-500 font-medium"><span className="text-red-500 mr-1">*</span>Port</label>
                  <div className="col-span-3">
                    <input id="port" name="port" type="number" required disabled={loading} value={mqttConfig.port} onChange={handleInputChange} className="w-1/3 border border-gray-300 rounded px-3 py-1.5 focus:border-blue-500 outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="topic" className="text-right text-gray-500 font-medium"><span className="text-red-500 mr-1">*</span>Topic</label>
                  <div className="col-span-3">
                    <input id="topic" name="topic" type="text" required disabled={loading} value={mqttConfig.topic} onChange={handleInputChange} placeholder="e.g., rfid/tags" className="w-full border border-gray-300 rounded px-3 py-1.5 focus:border-blue-500 outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="clientId" className="text-right text-gray-500 font-medium">Client ID</label>
                  <div className="col-span-3 flex gap-2">
                     <input id="clientId" name="clientId" type="text" disabled={loading} value={mqttConfig.clientId} onChange={handleInputChange} className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-gray-600 bg-gray-50 focus:border-blue-500 outline-none" />
                    <button type="button" onClick={regenerateClientId} disabled={loading} className="text-gray-400 hover:text-blue-600"><RefreshCw className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="username" className="text-right text-gray-500 font-medium">Username</label>
                  <div className="col-span-3">
                    <input id="username" name="username" type="text" disabled={loading} value={mqttConfig.username} onChange={handleInputChange} className="w-full border border-gray-300 rounded px-3 py-1.5 focus:border-blue-500 outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="password" className="text-right text-gray-500 font-medium">Password</label>
                  <div className="col-span-3">
                    <input id="password" name="password" type="password" disabled={loading} value={mqttConfig.password} onChange={handleInputChange} className="w-full border border-gray-300 rounded px-3 py-1.5 focus:border-blue-500 outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="ssl" className="text-right text-gray-500 font-medium">SSL/TLS</label>
                  <div className="col-span-3 flex items-center">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input id="ssl" name="ssl" type="checkbox" disabled={loading} checked={mqttConfig.ssl} onChange={handleInputChange} className="sr-only peer" />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 border-t border-gray-100">
                <button type="button" onClick={() => setMqttModalOpen(false)} disabled={loading} className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded transition-colors disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={loading} className="px-6 py-2 text-xs font-bold text-white bg-green-500 hover:bg-green-600 rounded shadow-sm transition-colors disabled:bg-gray-400">{loading ? 'Connecting...' : 'Connect'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}