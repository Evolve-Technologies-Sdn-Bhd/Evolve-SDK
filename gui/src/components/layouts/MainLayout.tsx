import React, { useEffect, useState, useRef } from 'react';
import Sidebar from '../Sidebar/Sidebar';
import Header from '../Header/Header';
import SettingsModal from '../Settings/SettingsModal';
import { useLogs } from '../../contexts/LogsContext';
import { useTags } from '../../contexts/TagContext';

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { logs, addLog, clearLogs } = useLogs(); 
  const { tags } = useTags();

  const logsEndRef = useRef<HTMLDivElement>(null);
  const tagsRef = useRef(tags);
  const logsRef = useRef(logs);

  // Keep Refs Synced
  useEffect(() => { tagsRef.current = tags; }, [tags]);
  useEffect(() => { 
    logsRef.current = logs; 
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // --- MAIN LISTENERS (With Cleanup) ---
  useEffect(() => {
    // 1. Settings Listener
    // @ts-ignore
    const removeSettingsListener = window.electronAPI.onOpenSettings(() => {
      setIsSettingsOpen(true);
    });

    // 2. Export Logs Listener
    // @ts-ignore
    const removeLogsListener = window.electronAPI.onExportLogsTrigger(async () => {
      const currentLogs = logsRef.current;
      if (currentLogs.length === 0) {
        addLog("No logs to export.", "WARNING");
        return;
      }
      const content = currentLogs.map(l => `[${l.timestamp}] [${l.type}] ${l.message}`).join('\n');
      // @ts-ignore
      const res = await window.electronAPI.saveLogs(content);
      if (res.success) addLog("Logs exported successfully.", "SUCCESS");
      else addLog(`Export failed: ${res.error}`, "ERROR");
    });

    // 3. Export Data Listener
    // @ts-ignore
    const removeDataListener = window.electronAPI.onExportDataTrigger(async (daysString: string) => {
      const days = parseInt(daysString);

      // Get data from database
      // @ts-ignore
      const dbResult = await window.electronAPI.getExportData(days);

      if (!dbResult.success) {
        addLog(dbResult.error || `No tag data found for the last ${days} days.`, "WARNING");
        return;
      }

      // Save the CSV file
      // @ts-ignore
      const saveResult = await window.electronAPI.saveExportedCSV(dbResult.content, days);
      if (saveResult.success) {
        addLog(`Successfully exported ${dbResult.count} tag records.`, "SUCCESS");
      } else {
        addLog(`Export failed: ${saveResult.error}`, "ERROR");
      }
    });

    // 4. System Messages Listener
    // @ts-ignore
    const removeSystemMessageListener = window.electronAPI.onSystemMessage((message: string, level: string) => {
      // Map level to LogEntry type
      const logType = level === 'error' ? 'ERROR' : level === 'warn' ? 'WARNING' : 'INFO';
      addLog(message, logType);
    });

    // --- CLEANUP FUNCTION ---
    // This runs when the component unmounts or re-renders, removing the old listeners
    return () => {
      removeSettingsListener();
      removeLogsListener();
      removeDataListener();
      removeSystemMessageListener();
    };

  }, []); // Run once on mount

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-100 overflow-hidden font-sans text-sm">
      <Header />
      <div className="flex flex-1 overflow-hidden">
          <aside className="w-72 flex-shrink-0 bg-gray-50 border-r border-gray-300 flex flex-col">
              <Sidebar />
          </aside>
          <main className="flex-1 flex flex-col min-w-0 bg-white">
              <div className="flex-1 relative overflow-hidden p-4 bg-gray-100">
                {children}
              </div>
              <div className="h-48 border-t border-gray-300 bg-gray-50 flex flex-col">
                <div className="bg-gray-200 px-2 py-1 text-xs font-bold text-gray-600 border-b border-gray-300 flex justify-between items-center">
                    <span>Error Log / System Messages</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500">{logs.length} Events</span>
                      <button onClick={clearLogs} className="px-2 py-0.5 text-[10px] bg-red-500 text-white rounded hover:bg-red-600 transition-colors">
                        Clear Logs
                      </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 font-mono text-xs bg-white space-y-1">
                    {logs.map((log) => (
                      <div key={log.id} className="break-words">
                        <span className="text-gray-400 mr-2">[{log.timestamp}]</span>
                        <span className={`font-bold mr-2 ${log.type === 'ERROR' ? 'text-red-600' : log.type === 'SUCCESS' ? 'text-green-600' : log.type === 'WARNING' ? 'text-orange-500' : 'text-blue-600'}`}>
                          [{log.type}]
                        </span>
                        <span className="text-gray-800">{log.message}</span>
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                </div>
              </div>
          </main>
      </div>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};

export default MainLayout;