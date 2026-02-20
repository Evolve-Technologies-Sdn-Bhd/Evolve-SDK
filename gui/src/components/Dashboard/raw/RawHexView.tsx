import React from 'react';
import { RawPacket } from './RawDataConsole';
import { HexFormatter, JSONFormatter } from '../../../utils/PayloadFormatter';

interface RawHexViewProps {
  logs: RawPacket[];
  formatter?: typeof HexFormatter;
}

export default function RawHexView({ logs, formatter = HexFormatter }: RawHexViewProps) {
    if (logs.length === 0) {
        return (
            <div className="text-gray-400 italic text-center mt-10">
                Waiting for data stream...
            </div>
        );
    }

    return (
        <>
            {logs.map((log) => {
                // Use HexFormatter's getDisplayHex to properly convert data
                const displayData = formatter.getDisplayHex(log.data);

                return (
                    <div
                        key={log.id}
                        className="flex gap-4 border-b border-gray-100 pb-1 hover:bg-gray-50"
                    >
                        <span className="text-gray-500 w-20 shrink-0">
                            {log.timestamp}
                        </span>
                        <span className={`w-8 font-bold shrink-0 ${log.direction === 'TX' ? 'text-blue-600' : 'text-green-600'}`}
                    >
                            [{log.direction}]
                        </span>
                        <code className="text-gray-800 break-all">
                            {displayData}
                        </code>
                    </div>
                );
            })}
        </>
    );
}
