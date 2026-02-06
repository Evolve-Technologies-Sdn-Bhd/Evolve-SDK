import React, { useEffect, useState, useRef } from 'react';
import Sidebar from '../Sidebar/Sidebar';
import Header from '../Header/Header';
import SettingsModal from '../Settings/SettingsModal';
import { useLogs } from '../../contexts/LogsContext'; // Import the context

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // 1. Get logs and actions from Context
  const { logs, addLog, clearLogs } = useLogs(); 
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    // 2. Listen for "Settings" Menu
    // @ts-ignore
    const settingsRemove = window.electronAPI.onOpenSettings(() => {
      setIsSettingsOpen(true);
    });

    // 3. Listen for "File > History" Export Trigger
    // @ts-ignore
    const exportRemove = window.electronAPI.onExportLogsTrigger(async () => {
      if (logs.length === 0) {
        addLog("No logs to export.", "WARNING");
        return;
      }

      // Format logs for .txt file
      const content = logs.map(l => `[${l.timestamp}] [${l.type}] ${l.message}`).join('\n');
      
      // Send to Electron
      // @ts-ignore
      const res = await window.electronAPI.saveLogs(content);
      
      if (res.success) addLog("Logs exported successfully.", "SUCCESS");
      else addLog(`Export failed: ${res.error}`, "ERROR");
    });

    // return () => { settingsRemove(); exportRemove(); } // Cleanup if supported
  }, [logs, addLog]);
  
  return (
    // Changed to flex-col so Header sits on top of the body
    <div className="flex flex-col h-screen w-screen bg-gray-100 overflow-hidden font-sans text-sm">

      {/* Header (Top Bar) */}
      <Header />

      {/* Main Body (Sidebar + Content) */}
      <div className="flex flex-1 overflow-hidden">

          {/* Left Sidebar */}
          <aside className="w-72 flex-shrink-0 bg-gray-50 border-r border-gray-300 flex flex-col">
              <Sidebar />
          </aside>

          {/* Right Content Area */}
          <main className="flex-1 flex flex-col min-w-0 bg-white">
              
              {/* Middle: Dashboard/Children */}
              <div className="flex-1 relative overflow-hidden p-4 bg-gray-100">
                {children}
              </div>

              {/* Bottom: System Logs */}
              <div className="h-48 border-t border-gray-300 bg-gray-50 flex flex-col">
                <div className="bg-gray-200 px-2 py-1 text-xs font-bold text-gray-600 border-b border-gray-300 flex justify-between items-center">
                    <span>Error Log / System Messages</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500">{logs.length} Events</span>
                      <button
                        onClick={() => {
                          // Clear logs action
                          clearLogs();
                        }}
                        className="px-2 py-0.5 text-[10px] bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        Clear Logs
                      </button>
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-2 font-mono text-xs bg-white space-y-1">
                    {/* Dynamic Log Rendering */}
                    {logs.map((log) => (
                      <div key={log.id} className="break-words">
                        <span className="text-gray-400 mr-2">[{log.timestamp}]</span>
                        <span className={`font-bold mr-2 
                          ${log.type === 'ERROR' ? 'text-red-600' : 
                            log.type === 'SUCCESS' ? 'text-green-600' : 
                            log.type === 'WARNING' ? 'text-orange-500' : 'text-blue-600'}`}>
                          [{log.type}]
                        </span>
                        <span className="text-gray-800">{log.message}</span>
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                </div>
                
                {/* Footer Status Bar */}
                <div className="bg-purple-600 text-white px-2 py-1 text-xs flex justify-between items-center">
                    <span>Connected to TCP/IP 192.168.1.100:8088</span>
                    <span>v1.0.0</span>
                </div>
              </div>
          </main>
      </div>

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </div>
  );
};

export default MainLayout;