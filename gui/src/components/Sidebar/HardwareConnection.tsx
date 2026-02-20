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
  
  // Form State
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
    
    // Handle Checkbox separately
    if (type === 'checkbox') {
        const checked = (e.target as HTMLInputElement).checked;
        setMqttConfig(prev => {
            // Auto-switch port and protocol based on SSL
            const newPort = checked ? 8883 : 1883;
            const newProto = checked ? 'mqtts://' : 'mqtt://';
            return { ...prev, [name]: checked, port: newPort, protocol: newProto };
        });
    } else {
        setMqttConfig(prev => ({ ...prev, [name]: value }));
    }
  };

  // 2. Specific Handler for Protocol Select (Updates Port automatically)
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

  // 3. Helper: Regenerate Client ID
  const regenerateClientId = () => {
    setMqttConfig(prev => ({
      ...prev,
      clientId: 'mqttx_' + Math.random().toString(16).substring(2, 8)
    }));
  };

  // 3.5 Helper: Add timeout wrapper to promises
  const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number = 180000): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs / 1000} seconds`)), timeoutMs)
      ),
    ]);
  };

  // 4. Form Submit Handler - Connect to MQTT Broker
  const handleMqttSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      // Build broker URL from components
      const brokerUrl = `${mqttConfig.protocol}${mqttConfig.host}:${mqttConfig.port}`;
      
      // Validate topic
      if (!mqttConfig.topic.trim()) {
        throw new Error('Topic is required');
      }
      
      // Build options for authentication
      const options: any = {
        clientId: mqttConfig.clientId,
      };
      if (mqttConfig.username) options.username = mqttConfig.username;
      if (mqttConfig.password) options.password = mqttConfig.password;
      
      // Log connection attempt for debugging
      console.log('[GUI] MQTT Connection Attempt:', {
        brokerUrl,
        topic: mqttConfig.topic,
        clientId: mqttConfig.clientId,
      });
      
      // Call SDK service to connect with 3-minute timeout
      const result = await withTimeout(
        sdkService.connectMqtt(brokerUrl, mqttConfig.topic, options),
        180000
      );
      
      // Check if connection was successful (handle both response objects and direct resolution)
      if (result && result.success === false) {
        throw new Error(result.error || 'Connection failed');
      }
      
      console.log('[GUI] MQTT Connection Successful');
      setConnected(true);
      setMqttModalOpen(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      console.error('[GUI] MQTT Connection Error:', err);
      
      // Attempt graceful disconnect on connection error
      try {
        await sdkService.disconnect();
      } catch (disconnectErr) {
        console.error('[GUI] Error during disconnect after connection failure:', disconnectErr);
      }
    } finally {
      setLoading(false);
    }
  };
  
  // 5. Handle Disconnect
  const handleDisconnect = async () => {
    try {
      setError('');
      setLoading(true);
      await sdkService.disconnect();
      setConnected(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };
  
  // 6. Handle Main Connect Button Click
  const handleMainConnectClick = async () => {
    if (connected) {
      await handleDisconnect();
    } else if (mode === 'mqtt') {
      setMqttModalOpen(true);
    }
  };

  return (
    <>
      <div className="mb-4 p-2 border border-gray-300 rounded bg-white shadow-sm relative">
        <h3 className="text-xs font-bold text-gray-700 mb-2">Connection Configuration</h3>
        
        {/* Connection Type Selection */}
        <div className="flex flex-col gap-1 mb-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="radio" name="connType" 
              checked={mode === 'serial'} onChange={() => setMode('serial')} 
              disabled={connected}
            />
            <span>Serial COM</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="radio" name="connType" 
              checked={mode === 'tcp'} onChange={() => setMode('tcp')} 
              disabled={connected}
            />
            <span>TCP/IP Mode</span>
          </label>
          <label className='flex items-center gap-2 cursor-pointer'>
            <input 
              type="radio" name="connType" 
              checked={mode === 'mqtt'} onChange={() => setMode('mqtt')} 
              disabled={connected}
            />
            <span>MQTT Mode</span>
          </label>
        </div>

        {/* --- TCP Controls --- */}
        {mode === 'tcp' && (
          <div className="pl-4 mb-3 border-l-2 border-gray-200">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-500">IP Address</label>
                <input type="text" defaultValue="192.168.1.100" className="w-full border p-1 text-xs" disabled={connected} />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500">Port</label>
                <input type="number" defaultValue="8088" className="w-full border p-1 text-xs" disabled={connected} />
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
                <select className="w-full border p-1 text-xs" disabled={connected}>
                  <option>COM1</option>
                  <option>COM3</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500">Baud Rate</label>
                <select className="w-full border p-1 text-xs" defaultValue="115200" disabled={connected}>
                  <option value="9600">9600</option>
                  <option value="115200">115200</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* --- MQTT Controls (Button) --- */}
        {mode === 'mqtt' && (
          <div className="pl-4 mb-3 border-l-2 border-gray-200">
             <button 
               onClick={() => setMqttModalOpen(true)}
               disabled={connected}
               type="button"
               className="w-full flex items-center justify-center gap-2 py-1.5 border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs rounded transition-colors"
             >
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
            loading
              ? 'bg-gray-400 cursor-not-allowed'
              : connected
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-blue-600 hover:bg-blue-700'
          }`}
          onClick={handleMainConnectClick}
        >
          {loading ? 'Processing...' : connected ? 'Disconnect' : 'Connect'}
        </button>
      </div>

      {/* --- MQTT CONFIGURATION FORM MODAL --- */}
      {isMqttModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-[550px] animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">New Connection</h3>
              <button onClick={() => setMqttModalOpen(false)} className="text-gray-400 hover:text-red-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* START FORM */}
            <form onSubmit={handleMqttSubmit}>
              {/* Error Display in Modal */}
              {error && (
                <div className="bg-red-50 border-b border-red-200 px-6 py-3">
                  <p className="text-[10px] text-red-600">{error}</p>
                </div>
              )}
              
              <div className="p-6 space-y-5 text-xs">
                
                {/* 1. Name */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="name" className="text-right text-gray-500 font-medium">
                    <span className="text-red-500 mr-1">*</span>Name
                  </label>
                  <div className="col-span-3 relative">
                    <input
                      id="name"
                      name="name"
                      type="text"
                      required
                      disabled={loading}
                      value={mqttConfig.name}
                      onChange={handleInputChange}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 focus:border-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                    />
                    <Info className="w-3.5 h-3.5 text-gray-300 absolute right-3 top-2" />
                  </div>
                </div>

                {/* 2. Host & Protocol */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="host" className="text-right text-gray-500 font-medium">
                    <span className="text-red-500 mr-1">*</span>Host
                  </label>
                  <div className="col-span-3 flex gap-2">
                    <div className="w-1/4 relative">
                      <select 
                        name="protocol"
                        value={mqttConfig.protocol}
                        onChange={handleProtocolChange}
                        disabled={loading}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 appearance-none bg-white focus:border-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                      >
                        <option value="mqtt://">mqtt://</option>
                        <option value="mqtts://">mqtts://</option>
                        <option value="ws://">ws://</option>
                        <option value="wss://">wss://</option>
                      </select>
                      <div className="absolute right-2 top-2 pointer-events-none text-gray-400">▼</div>
                    </div>
                    <input
                      id="host"
                      name="host"
                      type="text"
                      required
                      disabled={loading}
                      value={mqttConfig.host}
                      onChange={handleInputChange}
                      className="flex-1 border border-gray-300 rounded px-3 py-1.5 focus:border-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                </div>

                {/* 3. Port */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="port" className="text-right text-gray-500 font-medium">
                    <span className="text-red-500 mr-1">*</span>Port
                  </label>
                  <div className="col-span-3">
                    <input
                      id="port"
                      name="port"
                      type="number"
                      required
                      disabled={loading}
                      value={mqttConfig.port}
                      onChange={handleInputChange}
                      className="w-1/3 border border-gray-300 rounded px-3 py-1.5 focus:border-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                </div>

                {/* 4. Topic */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="topic" className="text-right text-gray-500 font-medium">
                    <span className="text-red-500 mr-1">*</span>Topic
                  </label>
                  <div className="col-span-3">
                    <input
                      id="topic"
                      name="topic"
                      type="text"
                      required
                      disabled={loading}
                      value={mqttConfig.topic}
                      onChange={handleInputChange}
                      placeholder="e.g., rfid/tags, sensor/data"
                      className="w-full border border-gray-300 rounded px-3 py-1.5 focus:border-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                    />
                    <p className="text-[9px] text-gray-400 mt-1">MQTT topic to subscribe to for receiving tag data</p>
                  </div>
                </div>

                {/* 5. Client ID */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="clientId" className="text-right text-gray-500 font-medium">Client ID</label>
                  <div className="col-span-3 flex gap-2">
                     <input
                      id="clientId"
                      name="clientId"
                      type="text"
                      disabled={loading}
                      value={mqttConfig.clientId}
                      onChange={handleInputChange}
                      className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-gray-600 bg-gray-50 focus:border-blue-500 outline-none disabled:text-gray-400"
                    />
                    <button 
                      type="button" 
                      onClick={regenerateClientId} 
                      disabled={loading}
                      className="text-gray-400 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed" 
                      title="Regenerate ID"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 6. Username */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="username" className="text-right text-gray-500 font-medium">Username</label>
                  <div className="col-span-3">
                    <input
                      id="username"
                      name="username"
                      type="text"
                      disabled={loading}
                      value={mqttConfig.username}
                      onChange={handleInputChange}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 focus:border-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                </div>

                {/* 7. Password */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="password" className="text-right text-gray-500 font-medium">Password</label>
                  <div className="col-span-3">
                    <input
                      id="password"
                      name="password"
                      type="password"
                      disabled={loading}
                      value={mqttConfig.password}
                      onChange={handleInputChange}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 focus:border-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                </div>

                {/* 8. SSL Toggle */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="ssl" className="text-right text-gray-500 font-medium">SSL/TLS</label>
                  <div className="col-span-3 flex items-center">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        id="ssl"
                        name="ssl"
                        type="checkbox" 
                        disabled={loading}
                        checked={mqttConfig.ssl} 
                        onChange={handleInputChange} 
                        className="sr-only peer" 
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer 
                        peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] 
                        after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 
                        after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>

              </div>

              {/* Form Footer */}
              <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 border-t border-gray-100">
                <button 
                  type="button"
                  onClick={() => setMqttModalOpen(false)}
                  disabled={loading}
                  className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 text-xs font-bold text-white bg-green-500 hover:bg-green-600 rounded shadow-sm transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {loading ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </form>
            {/* END FORM */}

          </div>
        </div>
      )}
    </>
  );
}