import React, { useState, useEffect, useRef } from 'react';
import RawDataConsole, {
  RawPacket,
  DataViewType,
} from '../Dashboard/raw/RawDataConsole';

export default function Dashboard() {
  const [logs, setLogs] = useState<RawPacket[]>([]);
  const [viewType, setViewType] = useState<DataViewType>('raw');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Subscribe to real tag stream via IPC
  useEffect(() => {
    const onTag = (tag: any) => {
      const toHex = (raw: any) => {
        if (!raw) return '';
        if (typeof raw === 'string') return raw;
        // Handle Node Buffer if available
        if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(raw)) {
          return raw.toString('hex');
        }
        // Handle Uint8Array / ArrayBuffer
        if (raw instanceof Uint8Array || (raw && raw.constructor && raw.constructor.name === 'Uint8Array')) {
          try {
            // use Buffer.from when available
            if (typeof Buffer !== 'undefined' && Buffer.from) return Buffer.from(raw).toString('hex');
            // fallback: map bytes
            return Array.from(raw).map((b: any) => b.toString(16).padStart(2, '0')).join('');
          } catch {
            return JSON.stringify(raw);
          }
        }
        if (Array.isArray(raw)) {
          try {
            if (typeof Buffer !== 'undefined' && Buffer.from) return Buffer.from(raw).toString('hex');
            return raw.map((b: any) => Number(b).toString(16).padStart(2, '0')).join('');
          } catch {
            return JSON.stringify(raw);
          }
        }
        try { return JSON.stringify(raw); } catch { return String(raw); }
      };

      const dataStr = toHex(tag?.raw ?? tag);

      const newLog: RawPacket = {
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        direction: 'RX',
        data: dataStr,
      };

      setLogs((prev) => [...prev.slice(-100), newLog]);
    };

    // subscribe
    // @ts-ignore
    window.electronAPI && window.electronAPI.onTagRead && window.electronAPI.onTagRead(onTag);

    return () => {
      // remove listener
      // @ts-ignore
      window.electronAPI && window.electronAPI.removeTagListener && window.electronAPI.removeTagListener();
    };
  }, []);

  return (
    <div className="h-full flex flex-col bg-white rounded-lg shadow border border-gray-200">

      {/* Header */}
      <div className="bg-gray-100 px-3 py-2 flex justify-between items-center border-b border-gray-200 rounded-t-lg">
        <span className="text-gray-700 font-mono text-sm font-bold">
          Data Stream
        </span>

        <div className="flex items-center gap-2">
          {/* Data Type Selector */}
          <select
            value={viewType}
            onChange={(e) => setViewType(e.target.value as DataViewType)}
            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="raw">Raw</option>
            <option value="json">JSON</option>
            <option value="text">Plain Text</option>
          </select>

          {/* Refresh Button */}
          <button
            onClick={() => setLogs([])}
            className="text-xs bg-indigo-500 hover:bg-indigo-600 text-white px-2 py-1 rounded shadow-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Raw Data Console */}
      <RawDataConsole
        logs={logs}
        scrollRef={scrollRef}
        viewType={viewType}
      />
    </div>
  );
}
