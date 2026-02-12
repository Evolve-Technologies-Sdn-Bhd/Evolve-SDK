import React, { createContext, useState, useContext, ReactNode } from 'react';

interface TagData {
  epc: string;
  count: number;
  rssi: number;
  lastSeen: number;
}

interface TagContextType {
  tags: Map<string, TagData>; // Map ensures uniqueness by EPC
  totalReads: number;
  uniqueCount: number;
  addTag: (epc: string, rssi: number) => void;
  clearTags: () => void;
}

const TagContext = createContext<TagContextType | undefined>(undefined);

export const TagProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tags, setTags] = useState<Map<string, TagData>>(new Map());
  const [totalReads, setTotalReads] = useState(0);

  const addTag = (epc: string, rssi: number) => {
    setTotalReads((prev) => prev + 1);

    setTags((prevMap) => {
      const newMap = new Map(prevMap);
      const existing = newMap.get(epc);

      if (existing) {
        // Update existing tag
        newMap.set(epc, {
          ...existing,
          count: existing.count + 1,
          rssi: rssi,
          lastSeen: Date.now(),
        });
      } else {
        // New unique tag
        newMap.set(epc, {
          epc,
          count: 1,
          rssi,
          lastSeen: Date.now(),
        });
      }
      return newMap;
    });
  };

  const clearTags = () => {
    setTags(new Map());
    setTotalReads(0);
  };

  return (
    <TagContext.Provider value={{ 
      tags, 
      totalReads, 
      uniqueCount: tags.size, 
      addTag, 
      clearTags 
    }}>
      {children}
    </TagContext.Provider>
  );
};

export const useTags = () => {
  const context = useContext(TagContext);
  if (!context) throw new Error('useTags must be used within a TagProvider');
  return context;
};