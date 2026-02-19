// gui/src/components/Sidebar/HardwareConnection.tsx
import React, { useState } from 'react';

export default function HardwareConnection() {
  const [mode, setMode] = useState<'serial' | 'tcp' | 'mqtt'>('tcp');
  const [connected, setConnected] = useState(false);

  return (
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

      {/* TCP Specific Controls - Simplified */}
      {mode === 'tcp' && (
        <div className="pl-4 mb-3 border-l-2 border-gray-200">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-gray-500">IP Address</label>
              <input type="text" defaultValue="192.168.1.100" className="w-full border p-1 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500">Port</label>
              <input type="number" defaultValue="8088" className="w-full border p-1 text-xs" />
            </div>
          </div>
        </div>
      )}

      {/* Serial Specific Controls */}
      {mode === 'serial' && (
        <div className="pl-4 mb-3 border-l-2 border-gray-200">
           <label className="block text-[10px] text-gray-500">COM Port</label>
           <select className="w-full border p-1 text-xs">
             <option>COM1</option>
             <option>COM3</option>
           </select>
        </div>
      )}

      {/* MQTT Specific Controls */}
        {mode === 'mqtt' && (
          <div className="pl-4 mb-3 border-l-2 border-gray-200 space-y-2">
            
            <div>
              <label className="block text-[10px] text-gray-500">
                Broker URL
              </label>
              <input
                type="text"
                placeholder="mqtt://broker.hivemq.com"
                className="w-full border p-1 text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] text-gray-500">
                Topic
              </label>
              <input
                type="text"
                placeholder="rfid/raw"
                className="w-full border p-1 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-500">
                  Username
                </label>
                <input
                  type="text"
                  className="w-full border p-1 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500">
                  Password
                </label>
                <input
                  type="password"
                  className="w-full border p-1 text-xs"
                />
              </div>
            </div>
          </div>
        )}

      {/* Connect Button */}
      <button 
        className={`w-full py-2 px-4 rounded text-white font-bold text-xs transition-colors
          ${connected ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'}`}
        onClick={() => setConnected(!connected)}
      >
        {connected ? 'Disconnect' : 'Connect'}
      </button>
    </div>
  );
}