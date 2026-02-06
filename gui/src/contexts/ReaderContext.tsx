import React, { createContext, useState, useContext } from 'react';
import { sdkService } from '../services/sdkService';

interface ReaderState {
  isConnected: boolean;
  connect: (ip: string, port: number) => Promise<void>;
  disconnect: () => Promise<void>;
}

const ReaderContext = createContext<ReaderState | null>(null);

export const ReaderProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);

  const connect = async (ip: string, port: number) => {
    try {
      const res = await sdkService.connect(ip, port);
      if (res.success) setIsConnected(true);
    } catch (e) {
      console.error(e);
    }
  };

  const disconnect = async () => {
    await sdkService.disconnect();
    setIsConnected(false);
  };

  return (
    <ReaderContext.Provider value={{ isConnected, connect, disconnect }}>
      {children}
    </ReaderContext.Provider>
  );
};

export const useReader = () => useContext(ReaderContext)!;