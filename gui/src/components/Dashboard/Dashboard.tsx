import React, { useState, useEffect, useRef } from 'react';
import RawDataConsole, {
  RawPacket,
  DataViewType,
} from '../Dashboard/raw/RawDataConsole';
import { PayloadFormatter } from '../../utils/PayloadFormatter';
import { PayloadDecryptor } from '../../utils/PayloadDecryptor';
import { useFilter } from '../../contexts/FilterContext';

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
  const { epcFilter } = useFilter();

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Setup and teardown listeners
  const setupListeners = () => {
    // Clean up any existing listeners first to prevent duplicates
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.clearAllDataListeners) {
      window.electronAPI.clearAllDataListeners();
    }
    
    console.log('[Dashboard] Setting up tag listener - electronAPI exists:', !!window.electronAPI);
    
    const onTag = (tag: any) => {
      console.log('[Dashboard] ✓ Received tag event:', JSON.stringify(tag, null, 2));
      
      // Use PayloadFormatter to format the tag data
      const formattedTag = PayloadFormatter.formatTagForDisplay(tag);
      console.log('[Dashboard] ✓ Formatted tag:', JSON.stringify(formattedTag, null, 2));

      const newLog: RawPacket = {
        id: formattedTag.id,
        timestamp: formattedTag.timestamp,
        direction: formattedTag.direction,
        data: formattedTag.data,
      };

      console.log('[Dashboard] ✓ New log object:', JSON.stringify(newLog, null, 2));
      console.log('[Dashboard] ✓ Log data type:', typeof newLog.data, 'Content:', newLog.data);
      setLogs((prev) => {
        const updated = [...prev.slice(-100), newLog];
        console.log('[Dashboard] ✓ Updated logs count:', updated.length);
        return updated;
      });
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
      
      console.log('[Dashboard] ✓ Adding raw data log:', { 
        dataType: typeof newLog.data,
        data: newLog.data,
        fullLog: JSON.stringify(newLog, null, 2)
      });
      setLogs((prev) => {
        const updated = [...prev.slice(-100), newLog];
        console.log('[Dashboard] ✓ Updated logs count after raw data:', updated.length);
        return updated;
      });
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
    console.log('[Dashboard] Removing all listeners');
    // Try unsubscribe functions first
    if (unsubscribeRef.current.tagReadUnsub) {
      unsubscribeRef.current.tagReadUnsub();
      unsubscribeRef.current.tagReadUnsub = undefined;
    }
    if (unsubscribeRef.current.rawDataUnsub) {
      unsubscribeRef.current.rawDataUnsub();
      unsubscribeRef.current.rawDataUnsub = undefined;
    }
    
    // Also force remove all listeners to ensure complete cleanup
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.clearAllDataListeners) {
      window.electronAPI.clearAllDataListeners();
    }
  };

  const handleRefresh = async () => {
    console.log('[Dashboard] Refresh button clicked');
    removeListeners();
    setLogs([]);
    
    // Small delay to ensure listeners are fully cleaned before re-registering
    await new Promise(resolve => setTimeout(resolve, 100));
    setupListeners();
  };

  // Filter logs based on EPC filter
  const filteredLogs = epcFilter.trim() === '' 
    ? logs  // If no filter, return all logs
    : logs.filter((log, idx) => {
        const filterLower = epcFilter.toLowerCase();
        
        // Check if log.data is an object (not a string)
        if (typeof log.data === 'object' && log.data !== null) {
          const dataObj = log.data as Record<string, any>;
          
          // Check all fields in the data object for matching
          for (const [key, value] of Object.entries(dataObj)) {
            if (value != null) {
              const valueStr = String(value).toLowerCase();
              if (valueStr.includes(filterLower)) {
                console.log(`[Dashboard] ✓ Filter HIT on log[${idx}]`, { 
                  field: key, 
                  value: value,
                  filter: epcFilter 
                });
                return true;
              }
            }
          }
          console.log(`[Dashboard] ✗ Filter MISS on log[${idx}]`, {
            dataObj,
            filter: epcFilter,
            allValues: Object.entries(dataObj).map(([k, v]) => `${k}: ${v}`)
          });
        }
        
        // Also check the raw data if it's a string
        if (typeof log.data === 'string' && log.data.toLowerCase().includes(filterLower)) {
          console.log(`[Dashboard] ✓ Filter HIT (string) on log[${idx}]`, { 
            data: log.data,
            filter: epcFilter 
          });
          return true;
        }
        
        return false;
      });

  // Log filter status for debugging
  useEffect(() => {
    console.log(`[Dashboard] Filter Status:`, {
      totalLogs: logs.length,
      filterText: epcFilter,
      filteredCount: filteredLogs.length,
      filterActive: epcFilter.trim() !== '',
      sampleLogs: logs.slice(0, 3).map(l => ({ type: typeof l.data, data: l.data }))
    });
  }, [logs, filteredLogs, epcFilter]);

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
        <div className="flex items-center gap-3">
          <span className="text-gray-700 font-mono text-sm font-bold">
            Data Stream
          </span>
          
          {/* Status indicator */}
          <span className="text-xs text-gray-600 px-2 py-1 bg-white rounded border border-gray-300">
            {epcFilter.trim() ? 
              `${filteredLogs.length}/${logs.length} logs (filtered)` 
              : `${logs.length} logs`
            }
          </span>
        </div>

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
        logs={filteredLogs}
        scrollRef={scrollRef}
        viewType={viewType}
      />
    </div>
  );
}
