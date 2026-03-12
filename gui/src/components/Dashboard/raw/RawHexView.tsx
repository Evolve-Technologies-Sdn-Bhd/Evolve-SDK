import React, { useMemo } from 'react';
import { RawPacket } from './RawDataConsole';
import { HexFormatter } from '../../../utils/PayloadFormatter';

interface RawHexViewProps {
  logs: RawPacket[];
  formatter?: typeof HexFormatter;
}

// Memoized log item to prevent re-renders of unchanged items
const LogItem = React.memo(({ log, formatter }: { log: RawPacket; formatter: typeof HexFormatter }) => {
  const displayData = formatter.getDisplayHex(log.data);
  return (
    <div
      key={log.id}
      className="flex gap-4 border-b border-gray-100 pb-1 hover:bg-gray-50"
    >
      <span className="text-gray-500 w-20 shrink-0">
        {log.timestamp}
      </span>
      <span className={`w-8 font-bold shrink-0 ${log.direction === 'TX' ? 'text-blue-600' : 'text-green-600'}`}>
        [{log.direction}]
      </span>
      <code className="text-gray-800 break-all">
        {displayData}
      </code>
    </div>
  );
});

LogItem.displayName = 'RawHexLogItem';

function RawHexView({ logs, formatter = HexFormatter }: RawHexViewProps) {
  if (logs.length === 0) {
    return (
      <div className="text-gray-400 italic text-center mt-10">
        Waiting for data stream...
      </div>
    );
  }

  // Only show last 200 logs (raw view can handle more than JSON due to simpler rendering)
  const visibleLogs = useMemo(() => logs.slice(-200), [logs]);

  return (
    <>
      {visibleLogs.map((log) => (
        <LogItem key={log.id} log={log} formatter={formatter} />
      ))}
    </>
  );
}

export default React.memo(RawHexView);
