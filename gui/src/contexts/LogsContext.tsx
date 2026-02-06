// gui/src/contexts/LogsContext.tsx
import React, { createContext, useState, useContext, ReactNode } from 'react';

export interface LogEntry {
  id: number;
  timestamp: string;
  type: 'INFO' | 'ERROR' | 'SUCCESS' | 'WARNING';
  message: string;
}

interface LogsContextType {
  logs: LogEntry[];
  addLog: (message: string, type?: LogEntry['type']) => void;
  clearLogs: () => void;
}

const LogsContext = createContext<LogsContextType | undefined>(undefined);

export const LogsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = (message: string, type: LogEntry['type'] = 'INFO') => {
    const newLog: LogEntry = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
    };
    // Keep last 1000 logs to prevent memory overflow
    setLogs((prev) => [...prev.slice(-999), newLog]);
  };

  const clearLogs = () => setLogs([]);

  return (
    <LogsContext.Provider value={{ logs, addLog, clearLogs }}>
      {children}
    </LogsContext.Provider>
  );
};

export const useLogs = () => {
  const context = useContext(LogsContext);
  if (!context) throw new Error('useLogs must be used within a LogsProvider');
  return context;
};