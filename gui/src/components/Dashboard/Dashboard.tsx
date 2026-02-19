import React, { useState, useEffect, useRef } from 'react';
import RawDataConsole, {
  RawPacket,
  DataViewType,
} from '../Dashboard/raw/RawDataConsole';
import { PayloadFormatter } from '../../utils/PayloadFormatter';

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
    console.log('[Dashboard] Setting up tag listener - electronAPI exists:', !!window.electronAPI);
    
    const onTag = (tag: any) => {
      console.log('[Dashboard] ✓ Received tag event:', tag);
      
      // Use PayloadFormatter to format the tag data
      const formattedTag = PayloadFormatter.formatTagForDisplay(tag);
      console.log('[Dashboard] ✓ Formatted tag:', formattedTag);

      const newLog: RawPacket = {
        id: formattedTag.id,
        timestamp: formattedTag.timestamp,
        direction: formattedTag.direction,
        data: formattedTag.data,
      };

      console.log('[Dashboard] ✓ Adding to logs:', newLog);
      setLogs((prev) => [...prev.slice(-100), newLog]);
    };

    // subscribe
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.onTagRead) {
      console.log('[Dashboard] ✓ Registering onTagRead listener');
      // @ts-ignore
      window.electronAPI.onTagRead(onTag);
    } else {
      console.error('[Dashboard] ✗ electronAPI.onTagRead not available');
    }

    return () => {
      // remove listener
      // @ts-ignore
      if (window.electronAPI && window.electronAPI.removeTagListener) {
        // @ts-ignore
        window.electronAPI.removeTagListener();
      }
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
