import React from 'react';

export default function FilterData() {
  return (
    <div className="mb-4 p-2 border border-gray-300 rounded bg-white shadow-sm">
      <h3 className="text-xs font-bold text-gray-700 mb-2">Filter Data</h3>
      <input 
        type="text" 
        placeholder="Search EPC..." 
        className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}