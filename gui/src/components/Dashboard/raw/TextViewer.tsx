import React from "react";
import { RawPacket } from "./RawDataConsole";
import { TextFormatter } from "../../../utils/PayloadFormatter";

interface TextViewerProps {
  logs: RawPacket[];
  formatter?: typeof TextFormatter;
}

export default function TextViewer({ logs, formatter = TextFormatter }: TextViewerProps) {
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
            <div key={log.id} className="mb-3 p-2 bg-gray-50 border-l-2 border-gray-300 rounded">
              <div className="flex gap-2 mb-2 text-gray-600 text-xs font-semibold">
                <span>#{log.id}</span>
                <span className={log.direction === 'RX' ? 'text-green-600' : 'text-blue-600'}>
                  {log.direction}
                </span>
                <span>{log.timestamp}</span>
              </div>
              <div className="text-xs text-gray-700 whitespace-pre-wrap">
                {formatter.format(log.data)}
              </div>
            </div>
        ))}
    </>
  );
}