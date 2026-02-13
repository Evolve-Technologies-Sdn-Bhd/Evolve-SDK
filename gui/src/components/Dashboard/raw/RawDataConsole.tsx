import React from 'react';
import RawHexView from './RawHexView';
import JSONViewer from './JSONViewer';
import TextViewer from './TextViewer';
import { HexFormatter, JSONFormatter, TextFormatter } from '../../../utils/PayloadFormatter';

export interface RawPacket {
  id: number;
  timestamp: string;
  direction: 'RX' | 'TX';
  data: string;
}

export type DataViewType = 'raw' | 'json' | 'text';

interface RawDataConsoleProps {
  logs: RawPacket[];
  scrollRef: React.RefObject<HTMLDivElement>;
  viewType: DataViewType;
}

export default function RawDataConsole({
  logs,
  scrollRef,
  viewType,
}: RawDataConsoleProps) {
  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1"
    >
      {viewType === 'raw' && <RawHexView logs={logs} formatter={HexFormatter} />}
      {viewType === 'json' && <JSONViewer logs={logs} formatter={JSONFormatter} />}
      {viewType === 'text' && <TextViewer logs={logs} formatter={TextFormatter} />}
    </div>
  );
}
