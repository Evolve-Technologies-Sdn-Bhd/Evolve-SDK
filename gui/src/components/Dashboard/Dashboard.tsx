import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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

// Maximum number of logs to keep in memory (keeps UI performant)
const MAX_LOGS = 2000;

export default function Dashboard() {
  const [logs, setLogs] = useState<RawPacket[]>([]);
  const [viewType, setViewType] = useState<DataViewType>('raw');
  const scrollRef = useRef<HTMLDivElement>(null);
  const unsubscribeRef = useRef< { tagReadUnsub?: () => void; rawDataUnsub?: () => void } >({});
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();
  const { epcFilter } = useFilter();

  // Debounced auto-scroll - only scroll every 100ms maximum, not on every log
  useEffect(() => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 50); // Debounce by 50ms

    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [logs]);

  // Create memoized tag handler that doesn't have stale closures
  const handleTagReceived = useCallback((tag: any) => {
    // Use PayloadFormatter to format the tag data
    const formattedTag = PayloadFormatter.formatTagForDisplay(tag);

    const newLog: RawPacket = {
      id: formattedTag.id,
      timestamp: formattedTag.timestamp,
      direction: formattedTag.direction,
      data: formattedTag.data,
    };

    setLogs((prev) => {
      // Keep last 1999 logs + new one = 2000 max
      const updated = [...prev.slice(-1999), newLog];
      return updated;
    });
  }, []);

  // Create memoized raw data handler
  const handleRawDataReceived = useCallback((packet: RawPacket) => {
    // Skip TX (command) packets and very short packets that are likely control frames
    if (packet.direction === 'TX') {
      return;
    }
    
    // Skip very short hex strings (likely ACK/control frames, not tag data)
    if (typeof packet.data === 'string') {
      const cleanHex = packet.data.replace(/\s/g, '');
      if (cleanHex.length < 20) {
        return;
      }
    }
    
    // Check if packet data needs processing
    let processedData: any = packet.data;
    
    if (typeof packet.data === 'string') {
      // First check if it's direct JSON
      if (packet.data.trim().startsWith('{') || packet.data.trim().startsWith('[')) {
        try {
          processedData = JSON.parse(packet.data);
        } catch (error) {
          // Fall back to hex decoding
          if (/^[0-9A-Fa-f\s]+$/.test(packet.data)) {
            try {
              const cleanHex = packet.data.replace(/\s/g, '');
              let decodedString = '';
              for (let i = 0; i < cleanHex.length; i += 2) {
                const char = String.fromCharCode(parseInt(cleanHex.substr(i, 2), 16));
                decodedString += char;
              }
              
              const decodedTrimmed = decodedString.trim();
              if (decodedTrimmed.startsWith('{')) {
                processedData = JSON.parse(decodedTrimmed);
              } else {
                // Hex decode didn't give JSON, try binary protocol
                const decrypted = PayloadDecryptor.parseEpcFromHex(packet.data);
                if (decrypted.EPC && decrypted.EPC !== 'UNKNOWN' && decrypted.EPC !== 'ERROR') {
                  processedData = {
                    EPC: decrypted.EPC,
                    Frame_Hex: packet.data,
                  };
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
          const cleanHex = packet.data.replace(/\s/g, '');
          let decodedString = '';
          for (let i = 0; i < cleanHex.length; i += 2) {
            const char = String.fromCharCode(parseInt(cleanHex.substr(i, 2), 16));
            decodedString += char;
          }
          
          const decodedTrimmed = decodedString.trim();
          if (decodedTrimmed.startsWith('{')) {
            processedData = JSON.parse(decodedTrimmed);
          } else {
            // Hex doesn't decode to JSON, try binary protocol
            const decrypted = PayloadDecryptor.parseEpcFromHex(packet.data);
            if (decrypted.EPC && decrypted.EPC !== 'UNKNOWN' && decrypted.EPC !== 'ERROR') {
              processedData = {
                EPC: decrypted.EPC,
                Frame_Hex: packet.data,
              };
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
        return;
      }
    }
    
    // Also filter if packet data itself is already parsed as UNKNOWN/ERROR
    if (typeof packet.data === 'object' && packet.data !== null) {
      if (packet.data.EPC === 'UNKNOWN' || packet.data.EPC === 'ERROR') {
        return;
      }
    }

    const newLog: RawPacket = {
      ...packet,
      data: processedData
    };
    
    setLogs((prev) => {
      // Keep last 1999 logs + new one = 2000 max
      const updated = [...prev.slice(-1999), newLog];
      return updated;
    });
  }, []);

  const setupListeners = useCallback(() => {
    let tagReadRegistered = false;
    let rawDataRegistered = false;

    // subscribe to tag reads
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.onTagRead) {
      try {
        // @ts-ignore
        const unsubscribe = window.electronAPI.onTagRead(handleTagReceived);
        unsubscribeRef.current.tagReadUnsub = unsubscribe;
        tagReadRegistered = true;
      } catch (err) {
        console.error('[Dashboard] Error registering tag read listener:', err);
      }
    } else {
      console.error('[Dashboard] electronAPI.onTagRead not available');
    }

    // subscribe to raw data
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.onRawData) {
      try {
        // @ts-ignore
        const unsubscribe = window.electronAPI.onRawData(handleRawDataReceived);
        unsubscribeRef.current.rawDataUnsub = unsubscribe;
        rawDataRegistered = true;
      } catch (err) {
        console.error('[Dashboard] Error registering raw data listener:', err);
      }
    } else {
      console.warn('[Dashboard] electronAPI.onRawData not available');
    }

    if (tagReadRegistered || rawDataRegistered) {
      console.log('[Dashboard] Listeners registered successfully');
    }
  }, [handleTagReceived, handleRawDataReceived]);

  // Setup and teardown listeners
  const removeListeners = useCallback(() => {
    let unsubscribed = false;

    // Unsubscribe from tag reads
    if (unsubscribeRef.current.tagReadUnsub) {
      try {
        unsubscribeRef.current.tagReadUnsub();
        unsubscribed = true;
      } catch (err) {
        console.error('[Dashboard] Error unsubscribing tag listener:', err);
      }
    }
    
    // Unsubscribe from raw data
    if (unsubscribeRef.current.rawDataUnsub) {
      try {
        unsubscribeRef.current.rawDataUnsub();
        unsubscribed = true;
      } catch (err) {
        console.error('[Dashboard] Error unsubscribing raw data listener:', err);
      }
    }
    
    // Force remove all listeners on the IPC side as final safety measure
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.clearAllDataListeners) {
      try {
        window.electronAPI.clearAllDataListeners();
      } catch (err) {
        console.error('[Dashboard] Error clearing IPC listeners:', err);
      }
    }

    if (unsubscribed) {
      console.log('[Dashboard] Listeners unsubscribed successfully');
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    // Step 1: Remove all listeners to stop incoming data.
    // `removeListeners` also handles telling the main process to clear listeners.
    removeListeners();

    // Step 2: Clear the logs from the UI.
    setLogs([]);

    // Step 3: Clear the local unsubscribe function references for a clean slate.
    unsubscribeRef.current.tagReadUnsub = undefined;
    unsubscribeRef.current.rawDataUnsub = undefined;

    // Step 4: Wait briefly to allow any in-flight IPC messages to be discarded
    // before we re-subscribe.
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Step 5: Re-register listeners to start a fresh data stream.
    setupListeners();
  }, [removeListeners, setupListeners]);

  // Filter logs based on EPC filter (memoized to prevent unnecessary recalculations)
  // Only applies when viewType is 'json'
  const filteredLogs = useMemo(() => {
    // If not in JSON view, show all logs without filtering
    if (viewType !== 'json') {
      return logs;
    }

    // In JSON view, apply EPC filter
    if (epcFilter.trim() === '') {
      // No filter - return all logs
      return logs;
    }

    // Apply strict EPC filter in JSON view
    const filtered = logs.filter((log) => {
      // Only process logs with valid data
      if (!log || !log.data) {
        return false;
      }

      // Check if log.data is an object (already parsed with EPC field)
      if (typeof log.data === 'object' && log.data !== null) {
        const dataObj = log.data as Record<string, any>;
        
        // Only check EPC field - must match exactly (case-sensitive)
        if (dataObj.EPC && typeof dataObj.EPC === 'string') {
          const epcStr = dataObj.EPC.trim();
          // Case-sensitive substring match on EPC field only
          const matches = epcStr.includes(epcFilter);
          console.log(`[Dashboard] EPC "${epcStr}" vs filter "${epcFilter}": ${matches ? 'MATCH ✓' : 'no match'}`);
          return matches;
        }
        // Object without EPC field - doesn't match
        console.log(`[Dashboard] Log data object has no EPC field`);
        return false;
      }
      
      // Also check the raw data if it's a string (hex encoded)
      // But we must extract/parse the EPC first - don't match random hex parts
      if (typeof log.data === 'string') {
        const dataStr = log.data;
        
        // Only process if it looks like hex format
        if (/^[0-9A-Fa-f\s]+$/.test(dataStr)) {
          try {
            // Extract EPC from hex
            const decrypted = PayloadDecryptor.parseEpcFromHex(dataStr);
            
            // Verify EPC is valid (case-sensitive)
            if (decrypted.EPC && typeof decrypted.EPC === 'string' && decrypted.EPC !== 'UNKNOWN' && decrypted.EPC !== 'ERROR') {
              const extractedEpc = decrypted.EPC.trim();
              // Only match against extracted EPC, not the entire hex string
              // Case-sensitive match
              const matches = extractedEpc.includes(epcFilter);
              console.log(`[Dashboard] Hex EPC "${extractedEpc}" vs filter "${epcFilter}": ${matches ? 'MATCH ✓' : 'no match'}`);
              return matches;
            }
          } catch (error) {
            // Silently fail if EPC extraction doesn't work
            console.log(`[Dashboard] Error parsing hex: ${error}`);
          }
        }
      }
      
      // No match
      return false;
    });
    
    console.log(`[Dashboard] Filter result: ${filtered.length} matches found out of ${logs.length} logs`);
    return filtered;
  }, [logs, epcFilter, viewType]);

  // Log filter status for debugging (only when in JSON view and when filter or log count changes)
  useEffect(() => {
    if (viewType === 'json') {
      const matchedEpcs = filteredLogs.slice(0, 5).map((log) => {
        if (typeof log.data === 'object' && log.data?.EPC) {
          return log.data.EPC;
        }
        return 'N/A';
      });
      console.log(`[Dashboard] === FILTER STATUS ===`, {
        filterText: epcFilter || '(empty)',
        totalLogs: logs.length,
        filteredLogsCount: filteredLogs.length,
        filterActive: epcFilter.trim() !== '',
        matchedEpcs: matchedEpcs,
        caseSensitive: true,
        matchType: 'EPC field only (substring, case-sensitive)'
      });
    } else {
      console.log(`[Dashboard] View Type: ${viewType} - Filter disabled (showing all ${logs.length} logs)`);
    }
  }, [logs.length, filteredLogs.length, epcFilter, viewType]);

  // Subscribe to real tag stream via IPC on mount
  useEffect(() => {
    // ensure any old listeners are cleared before registering
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.clearAllDataListeners) {
      try {
        // clear old IPC listeners immediately on mount
        window.electronAPI.clearAllDataListeners();
        console.log('[Dashboard] ✓ Cleared IPC listeners on mount');
      } catch (err) {
        console.error('[Dashboard] Error clearing IPC listeners on mount:', err);
      }
    }

    setupListeners();

    return () => {
      removeListeners();
    };
  }, [setupListeners, removeListeners]);

  return (
    <div className="h-full flex flex-col bg-white rounded-lg shadow border border-gray-200">

      {/* Header */}
      <div className="bg-gray-100 px-3 py-2 flex justify-between items-center border-b border-gray-200 rounded-t-lg">
        <div className="flex items-center gap-3">
          <span className="text-gray-700 font-mono text-sm font-bold">
            Data Stream
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
      {/* Verify filtered logs are being passed correctly */}
      {viewType === 'json' && epcFilter.trim() && (
        <div className={`border-l-4 p-2 text-xs font-semibold ${
          filteredLogs.length === 0 
            ? 'bg-red-50 border-red-400 text-red-700' 
            : 'bg-green-50 border-green-400 text-green-700'
        }`}>
          {filteredLogs.length === 0 
            ? `⚠ Filter "${epcFilter}" - No matching logs found in ${logs.length} total`
            : `✓ Filter "${epcFilter}" - Showing ${filteredLogs.length} matching log(s) out of ${logs.length} total`
          }
        </div>
      )}
      <RawDataConsole
        logs={filteredLogs}
        scrollRef={scrollRef}
        viewType={viewType}
        key={`${viewType}-${epcFilter}`}
      />
    </div>
  );
}
