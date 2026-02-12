import React from 'react';
import { useTags } from '../../contexts/TagContext';
import { RotateCcw, Hash, Tags } from 'lucide-react'; // Ensure lucide-react is installed, or use text

export default function CumulativeCount() {
  const { totalReads, uniqueCount, clearTags } = useTags();

  return (
    <div className="mb-4 p-3 border border-gray-300 rounded bg-white shadow-sm">
      <h3 className="text-xs font-bold text-gray-700 mb-3 border-b border-gray-100 pb-2">
        Cumulative Display
      </h3>
      
      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* Total Count Box */}
        <div className="bg-blue-50 p-2 rounded border border-blue-100 flex flex-col items-center">
          <div className="flex items-center gap-1 text-[10px] text-blue-600 font-bold uppercase">
            <Hash className="w-3 h-3" /> Total
          </div>
          <span className="text-xl font-bold text-blue-700">
            {totalReads.toLocaleString()}
          </span>
        </div>

        {/* Unique Count Box */}
        <div className="bg-purple-50 p-2 rounded border border-purple-100 flex flex-col items-center">
          <div className="flex items-center gap-1 text-[10px] text-purple-600 font-bold uppercase">
            <Tags className="w-3 h-3" /> Unique
          </div>
          <span className="text-xl font-bold text-purple-700">
            {uniqueCount.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Reset Button */}
      <button 
        onClick={clearTags}
        className="w-full flex items-center justify-center gap-2 py-1.5 rounded text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300 transition-colors"
      >
        <RotateCcw className="w-3 h-3" />
        Reset
      </button>
    </div>
  );
}