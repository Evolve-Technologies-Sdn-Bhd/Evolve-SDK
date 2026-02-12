// gui/src/components/Sidebar/Sidebar.tsx
import React from 'react';
import FilterData from './FilterData';
import HardwareConnection from './HardwareConnection';
import ReadControl from './ReadControl';
import CumulativeCount from './CumulativeCount';

export default function Sidebar() {
  return (
    <div className="p-2 flex flex-col h-full overflow-y-auto">
      <FilterData />
      <HardwareConnection />
      {/* Removed Cumulative Display as requested */}
      <ReadControl />

      <CumulativeCount />
      
      {/* Spacer to push content up */}
      <div className="flex-1"></div>
      
      <div className="text-[10px] text-center text-gray-400 mt-4">
        &copy; 2026 EvolveTechnologyPlatform
      </div>
    </div>
  );
}