// gui/src/components/Sidebar/ReadControl.tsx
import React, { useState, useEffect, useRef } from 'react';
import { sdkService } from '../../services/sdkService';

export default function ReadControl() {
  const [scanning, setScanning] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number>(0);

  // Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (scanning) {
      // If we just started (elapsed is 0), set start time. 
      // If we are resuming (not implemented but good for robustness), adjust start time.
      if (startTimeRef.current === 0) {
        startTimeRef.current = Date.now() - elapsedTime;
      }
      
      interval = setInterval(() => {
        setElapsedTime(Date.now() - startTimeRef.current);
      }, 200); // Update 5 times a second is enough for seconds display
    } else {
      startTimeRef.current = 0;
    }
    return () => clearInterval(interval);
  }, [scanning]);

  // Format time as HH:MM:SS
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Auto-stop scan when reader disconnects
  useEffect(() => {
    const handleDisconnect = (data: any) => {
      console.log('[ReadControl] Reader disconnected:', data);
      if (scanning) {
        console.log('[ReadControl] Auto-stopping scan due to disconnect');
        try {
          sdkService.stopScan();
        } catch (err) {
          console.error('[ReadControl] Error stopping scan on disconnect:', err);
        }
        setScanning(false);
      }
    };

    const handleReset = () => {
      console.log('[ReadControl] Resetting timer');
      setElapsedTime(0);
      if (scanning) {
        startTimeRef.current = Date.now();
      } else {
        startTimeRef.current = 0;
      }
    };

    sdkService.onDisconnected(handleDisconnect);
    sdkService.onResetCounters(handleReset);

    return () => {
      // Note: IPC listeners persist, but this component cleanup is still good practice
    };
  }, [scanning]);

  return (
    <div className="mb-4 p-2 border border-gray-300 rounded bg-white shadow-sm">
      <div className="mb-2">
        <h3 className="text-xs font-bold text-gray-700">Read Control</h3>
      </div>
      
      <div className="flex flex-col gap-2">
        <button 
          onClick={async () => {
            try {
              // start backend scan
              sdkService.startScan();
              setScanning(true);
            } catch (err) {
              setScanning(false);
            }
          }}
          disabled={scanning}
          className={`flex items-center justify-center gap-2 py-2 rounded text-white font-bold shadow
            ${scanning ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
        >
          <span>▶ Start Read</span>
        </button>

        <button 
          onClick={async () => {
            try {
              sdkService.stopScan();
              setScanning(false);
            } catch (err) {
              // ignore
            }
          }}
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

      <div className="mt-4 flex flex-col items-center justify-center">
        <span className="text-sm font-mono font-bold text-gray-800">Total Time:</span>
        <span className="text-lg font-mono font-bold text-blue-600">{formatTime(elapsedTime)}</span>
      </div>
    </div>
  );
}