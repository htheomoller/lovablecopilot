export type EdgeReply =
  | { success: true; mode: string; reply: string }
  | { success: false; error: string };

const EDGE_PATH = "/functions/v1/ai-generate";

export async function callEdge(payload: any): Promise<EdgeReply> {
  const res = await fetch(EDGE_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON from edge (status ${res.status}): ${text.slice(0,120)}`);
  }
}

export async function pingEdge(): Promise<string> {
  const out = await callEdge({ mode: "ping" });
  if ((out as any).success) return (out as any).reply || "ok";
  throw new Error((out as any).error || "unknown edge error");
}