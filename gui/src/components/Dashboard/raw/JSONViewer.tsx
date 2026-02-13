import React from "react";
import { RawPacket } from "./RawDataConsole";
import { JSONFormatter } from "../../../utils/PayloadFormatter";

interface JSONViewerProps {
  logs: RawPacket[];
  formatter?: typeof JSONFormatter;
}

export default function JSONViewer({ logs, formatter = JSONFormatter }: JSONViewerProps) {
  if (logs.length === 0) {
    return (
      <div className="text-gray-400 italic text-center mt-10">
        Waiting for data stream...
      </div>
    );
  }

  return (
    <>
      {logs.map((log) => (
        <div key={log.id} className="mb-4 p-2 bg-gray-100 rounded">
          <div className="flex gap-2 mb-2 text-gray-600 text-xs">
            <span className="font-bold">{log.id}</span>
            <span className={log.direction === 'RX' ? 'text-green-600' : 'text-blue-600'}>
              [{log.direction}]
            </span>
            <span>{log.timestamp}</span>
          </div>
          <pre className="text-xs overflow-auto bg-white p-2 rounded border border-gray-300">
            {formatter.format(log, 2)}
          </pre>
        </div>
      ))}
    </>
  );
}