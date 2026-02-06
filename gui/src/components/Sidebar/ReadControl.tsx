// gui/src/components/Sidebar/ReadControl.tsx
import React, { useState } from 'react';

export default function ReadControl() {
  const [scanning, setScanning] = useState(false);

  return (
    <div className="mb-4 p-2 border border-gray-300 rounded bg-white shadow-sm">
      <h3 className="text-xs font-bold text-gray-700 mb-2">Read Control</h3>
      
      <div className="flex flex-col gap-2">
        <button 
          onClick={() => setScanning(true)}
          disabled={scanning}
          className={`flex items-center justify-center gap-2 py-2 rounded text-white font-bold shadow
            ${scanning ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
        >
          <span>▶ Start Read</span>
        </button>

        <button 
          onClick={() => setScanning(false)}
          disabled={!scanning}
          className={`flex items-center justify-center gap-2 py-2 rounded text-white font-bold shadow
            ${!scanning ? 'bg-red-500 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600'}`}
        >
          <span>⏹ Stop Read</span>
        </button>
      </div>

      <div className="mt-3 text-xs font-bold flex items-center gap-2">
        Status: 
        <span className={scanning ? "text-green-600" : "text-red-600"}>
          {scanning ? '● Scanning' : '● Stopped'}
        </span>
      </div>
    </div>
  );
}