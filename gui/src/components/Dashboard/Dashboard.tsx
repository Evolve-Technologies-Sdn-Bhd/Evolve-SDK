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
      const dataStr = tag?.raw
        ? (typeof tag.raw === 'string'
            ? tag.raw
            : Buffer.isBuffer(tag.raw)
            ? tag.raw.toString('hex')
            : JSON.stringify(tag.raw))
        : JSON.stringify(tag);

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
