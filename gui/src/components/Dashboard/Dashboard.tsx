import React, { useState, useEffect, useRef } from 'react';
import RawDataConsole, {
  RawPacket,
  DataViewType,
} from '../Dashboard/raw/RawDataConsole';
import { PayloadFormatter } from '../../utils/PayloadFormatter';
import { PayloadDecryptor } from '../../utils/PayloadDecryptor';

declare global {
  interface Window {
    electronAPI: any;
  }
}

export default function Dashboard() {
  const [logs, setLogs] = useState<RawPacket[]>([]);
  const [viewType, setViewType] = useState<DataViewType>('raw');
  const scrollRef = useRef<HTMLDivElement>(null);
  const unsubscribeRef = useRef< { tagReadUnsub?: () => void; rawDataUnsub?: () => void } >({});

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Setup and teardown listeners
  const setupListeners = () => {
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

    const onRawData = (packet: RawPacket) => {
      console.log('[Dashboard] ✓ Received raw data packet:', packet);
      
      // Skip TX (command) packets and very short packets that are likely control frames
      if (packet.direction === 'TX') {
        console.log('[Dashboard] ⊘ Skipping TX command packet');
        return;
      }
      
      // Skip very short hex strings (likely ACK/control frames, not tag data)
      if (typeof packet.data === 'string') {
        const cleanHex = packet.data.replace(/\s/g, '');
        if (cleanHex.length < 20) {
          console.log('[Dashboard] ⊘ Skipping short control frame');
          return;
        }
      }
      
      // Check if packet data needs processing
      let processedData: any = packet.data;
      
      if (typeof packet.data === 'string') {
        // First check if it's direct JSON
        if (packet.data.trim().startsWith('{') || packet.data.trim().startsWith('[')) {
          try {
            console.log('[Dashboard] Attempting to parse JSON payload...');
            const jsonData = JSON.parse(packet.data);
            console.log('[Dashboard] ✓ Parsed JSON:', jsonData);
            processedData = jsonData;
          } catch (error) {
            console.error('[Dashboard] Error parsing JSON:', error);
            // Fall back to hex decoding
            if (/^[0-9A-Fa-f\s]+$/.test(packet.data)) {
              try {
                // Try to decode hex to JSON
                console.log('[Dashboard] Attempting to decode hex to JSON...');
                const cleanHex = packet.data.replace(/\s/g, '');
                let decodedString = '';
                for (let i = 0; i < cleanHex.length; i += 2) {
                  const char = String.fromCharCode(parseInt(cleanHex.substr(i, 2), 16));
                  decodedString += char;
                }
                
                const decodedTrimmed = decodedString.trim();
                if (decodedTrimmed.startsWith('{')) {
                  const jsonData = JSON.parse(decodedTrimmed);
                  console.log('[Dashboard] ✓ Hex decoded to JSON:', jsonData);
                  processedData = jsonData;
                } else {
                  // Hex decode didn't give JSON, try binary protocol
                  console.log('[Dashboard] Hex decoding did not produce JSON, trying binary protocol...');
                  const decrypted = PayloadDecryptor.parseEpcFromHex(packet.data);
                  if (decrypted.EPC && decrypted.EPC !== 'UNKNOWN' && decrypted.EPC !== 'ERROR') {
                    processedData = {
                      EPC: decrypted.EPC,
                      Frame_Hex: packet.data,
                    };
                    console.log('[Dashboard] ✓ Binary protocol decode succeeded:', processedData);
                  }
                }
              } catch (error) {
                console.error('[Dashboard] Error in hex/binary processing:', error);
              }
            }
          }
        } 
        // If not JSON text, try hex decoding
        else if (/^[0-9A-Fa-f\s]+$/.test(packet.data)) {
          try {
            // Try hex to JSON first
            console.log('[Dashboard] Attempting hex to JSON conversion...');
            const cleanHex = packet.data.replace(/\s/g, '');
            let decodedString = '';
            for (let i = 0; i < cleanHex.length; i += 2) {
              const char = String.fromCharCode(parseInt(cleanHex.substr(i, 2), 16));
              decodedString += char;
            }
            
            const decodedTrimmed = decodedString.trim();
            if (decodedTrimmed.startsWith('{')) {
              const jsonData = JSON.parse(decodedTrimmed);
              console.log('[Dashboard] ✓ Hex decoded to JSON:', jsonData);
              processedData = jsonData;
            } else {
              // Hex doesn't decode to JSON, try binary protocol
              console.log('[Dashboard] Hex does not decode to JSON, trying binary protocol...');
              const decrypted = PayloadDecryptor.parseEpcFromHex(packet.data);
              if (decrypted.EPC && decrypted.EPC !== 'UNKNOWN' && decrypted.EPC !== 'ERROR') {
                processedData = {
                  EPC: decrypted.EPC,
                  Frame_Hex: packet.data,
                };
                console.log('[Dashboard] ✓ Binary protocol decode succeeded:', processedData);
              }
            }
          } catch (error) {
            console.error('[Dashboard] Error in hex processing:', error);
          }
        }
      }
      
      // Filter out entries with unknown/error EPC to prevent clutter
      if (typeof processedData === 'object' && processedData !== null) {
        if (processedData.EPC === 'UNKNOWN' || processedData.EPC === 'ERROR') {
          console.log('[Dashboard] ⊘ Skipping entry with', processedData.EPC, 'EPC');
          return;
        }
      }
      
      // Also filter if packet data itself is already parsed as UNKNOWN/ERROR
      if (typeof packet.data === 'object' && packet.data !== null) {
        if (packet.data.EPC === 'UNKNOWN' || packet.data.EPC === 'ERROR') {
          console.log('[Dashboard] ⊘ Skipping raw packet with', packet.data.EPC, 'EPC');
          return;
        }
      }

      const newLog: RawPacket = {
        ...packet,
        data: processedData
      };
      
      console.log('[Dashboard] ✓ Adding to logs:', newLog);
      setLogs((prev) => [...prev.slice(-100), newLog]);
    };

    // subscribe to tag reads
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.onTagRead) {
      console.log('[Dashboard] ✓ Registering onTagRead listener');
      // @ts-ignore
      const unsubscribe = window.electronAPI.onTagRead(onTag);
      unsubscribeRef.current.tagReadUnsub = unsubscribe;
    } else {
      console.error('[Dashboard] ✗ electronAPI.onTagRead not available');
    }

    // subscribe to raw data
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.onRawData) {
      console.log('[Dashboard] ✓ Registering onRawData listener');
      // @ts-ignore
      const unsubscribe = window.electronAPI.onRawData(onRawData);
      unsubscribeRef.current.rawDataUnsub = unsubscribe;
    } else {
      console.warn('[Dashboard] ⚠ electronAPI.onRawData not available');
    }
  };

  const removeListeners = () => {
    console.log('[Dashboard] Removing listeners');
    // Unsubscribe using the stored unsubscribe functions
    if (unsubscribeRef.current.tagReadUnsub) {
      console.log('[Dashboard] Calling tagReadUnsub');
      unsubscribeRef.current.tagReadUnsub();
      unsubscribeRef.current.tagReadUnsub = undefined;
    }
    if (unsubscribeRef.current.rawDataUnsub) {
      console.log('[Dashboard] Calling rawDataUnsub');
      unsubscribeRef.current.rawDataUnsub();
      unsubscribeRef.current.rawDataUnsub = undefined;
    }
  };

  const handleRefresh = () => {
    console.log('[Dashboard] Refresh button clicked');
    removeListeners();
    setLogs([]);
    setupListeners();
  };

  // Subscribe to real tag stream via IPC on mount
  useEffect(() => {
    setupListeners();

    return () => {
      removeListeners();
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
            onClick={handleRefresh}
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
