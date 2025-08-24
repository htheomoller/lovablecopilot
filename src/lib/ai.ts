export async function callEdge(prompt: string, mode: "chat" | "ping" = "chat") {
  const url = "/functions/v1/ai-generate";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, prompt })
  });

  // If Supabase/Lovable returns HTML (404 proxy), surface a clear error
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (!ct.includes("application/json")) {
    const snippet = text.slice(0, 200);
    throw new Error(`Non-JSON from edge (status ${res.status}): ${snippet}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Malformed JSON from edge (status ${res.status}): ${text.slice(0, 200)}`);
  }
}