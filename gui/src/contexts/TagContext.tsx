// src/contexts/TagContext.tsx
import { createContext, useState, ReactNode } from 'react';
import { RFIDTag } from '@evolve/sdk';

interface TagContextType {
  tags: RFIDTag[];
  addTag: (tag: RFIDTag) => void;
  clearTags: () => void;
}

export const TagContext = createContext<TagContextType>({
  tags: [],
  addTag: () => {},
  clearTags: () => {}
});

export const TagProvider = ({ children }: { children: ReactNode }) => {
  const [tags, setTags] = useState<RFIDTag[]>([]);

  const addTag = (tag: RFIDTag) => setTags((prev) => [...prev, tag]);
  const clearTags = () => setTags([]);

  return (
    <TagContext.Provider value={{ tags, addTag, clearTags }}>
      {children}
    </TagContext.Provider>
  );
};
