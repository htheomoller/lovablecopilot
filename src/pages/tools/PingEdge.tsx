import { useState } from "react";
import { callEdge } from "@/lib/edgeClient";

export default function PingEdge() {
  const [out, setOut] = useState("");

  async function ping() {
    const r = await callEdge({ mode: "ping" });
    setOut(JSON.stringify(r, null, 2));
  }
  
  async function echo() {
    const r = await callEdge({ mode: "chat", prompt: "hello from UI" });
    setOut(JSON.stringify(r, null, 2));
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Edge Self-Test</h1>
      <div className="space-x-2">
        <button onClick={ping} className="px-4 py-2 bg-primary text-primary-foreground rounded">
          Ping
        </button>
        <button onClick={echo} className="px-4 py-2 bg-secondary text-secondary-foreground rounded">
          Echo
        </button>
      </div>
      <pre className="bg-muted p-4 rounded text-sm overflow-auto">
        {out || "No output yet."}
      </pre>
      <p className="text-sm text-muted-foreground">
        This page never crashes on HTML/404—if the function path or headers are wrong,
        you'll see the raw response under raw.
      </p>
    </div>
  );
}