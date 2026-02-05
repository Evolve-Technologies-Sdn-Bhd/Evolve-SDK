import React from "react";
import { RawPacket } from "./RawDataConsole";

interface JSONViewerProps {
  logs: RawPacket[];
}   

export default function JSONViewer({ logs }: JSONViewerProps) {
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
        <pre
            key={log.id}
            className="bg-gray-50 border border-gray-100 p-2 rounded text-xs break-words md-1"
        >
            {JSON.stringify(log, null, 2)}
            </pre>
      ))}
    </>
   );
}