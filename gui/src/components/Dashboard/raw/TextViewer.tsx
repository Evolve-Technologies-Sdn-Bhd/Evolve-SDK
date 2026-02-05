import React from "react";
import { RawPacket } from "./RawDataConsole";

interface TextViewerProps {
  logs: RawPacket[];
}

export default function TextViewer({ logs }: TextViewerProps) {
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
            <div key={log.id} className="text-xs text-gray-800 mb-1 font-mono break-all">
                    [{log.timestamp}] [{log.direction}] {log.data}
            </div>
        ))}
    </>
  );
}