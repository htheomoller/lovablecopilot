export type EdgeMode = "ping" | "chat" | "nlu" | "roadmap";

async function postEdge(mode: EdgeMode, payload: Record<string, unknown> = {}) {
  const res = await fetch("/functions/v1/ai-generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, ...payload }),
  });
  const raw = await res.text();
  let json: any = null;
  try { json = JSON.parse(raw); } catch { /* fallthrough */ }
  if (!res.ok || !json) {
    const note = `Non-JSON from edge (status ${res.status}):`;
    throw new Error(`${note}\n${raw}`);
  }
  return { ok: true, status: res.status, json, raw };
}

export const edgePing = () => postEdge("ping");
export const edgeChat = (prompt: string, answer_style: string) => postEdge("chat", { prompt, answer_style });
export const edgeNLU  = (prompt: string, answer_style: string) => postEdge("nlu",  { prompt, answer_style });
export const edgeRoadmap = (answers: Record<string, unknown>, answer_style: string) =>
  postEdge("roadmap", { answers, answer_style });