// gui/src/contexts/FilterContext.tsx
import React, { createContext, useState, useContext, ReactNode } from 'react';

interface FilterContextType {
  epcFilter: string;
  setEpcFilter: (filter: string) => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export const FilterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [epcFilter, setEpcFilter] = useState('');

  return (
    <FilterContext.Provider value={{ epcFilter, setEpcFilter }}>
      {children}
    </FilterContext.Provider>
  );
};

export const useFilter = () => {
  const context = useContext(FilterContext);
  if (!context) throw new Error('useFilter must be used within a FilterProvider');
  return context;
};
