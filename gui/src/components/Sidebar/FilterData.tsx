import React from 'react';
import { useFilter } from '../../contexts/FilterContext';

export default function FilterData() {
  const { epcFilter, setEpcFilter } = useFilter();

  const handleClear = () => {
    setEpcFilter('');
  };

  return (
    <div className="mb-4 p-2 border border-gray-300 rounded bg-white shadow-sm">
      <h3 className="text-xs font-bold text-gray-700 mb-2">Filter Data</h3>
      <div className="flex gap-2">
        <input 
          type="text" 
          placeholder="Search JSON EPC..." 
          value={epcFilter}
          onChange={(e) => setEpcFilter(e.target.value)}
          className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
        />
        {epcFilter && (
          <button
            onClick={handleClear}
            className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-xs font-semibold transition"
            title="Clear filter"
          >
            ✕
          </button>
        )}
      </div>
      {epcFilter && (
        <p className="text-xs text-gray-500 mt-1">
          Filtering: <span className="font-mono font-semibold">{epcFilter}</span>
        </p>
      )}
    </div>
  );
}