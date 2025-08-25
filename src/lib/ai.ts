export type EdgeResult =
  | { success: true; mode: string; reply?: string; raw?: string; data?: unknown }
  | { success: false; error: string; message: string; details?: unknown };

const endpointFromEnv = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) return null;
  return `${url.replace(/\/$/, "")}/functions/v1/ai-generate`;
};

export async function callEdge(payload: Record<string, unknown>) {
  const endpoint = endpointFromEnv();
  const finalEndpoint = endpoint || "/functions/v1/ai-generate";

  let res: Response;
  try {
    res = await fetch(finalEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? {})
    });
  } catch (e: any) {
    return {
      ok: false,
      status: 0,
      endpoint: finalEndpoint,
      error: "network_error",
      message: e?.message || String(e)
    };
  }

  const raw = await res.text();
  if (!res.ok) {
    // Non‑JSON HTML or gateway error? Return raw to surface in UI
    return {
      ok: false,
      status: res.status,
      endpoint: finalEndpoint,
      error: "edge_non_200",
      raw
    };
  }

  try {
    const json = JSON.parse(raw) as EdgeResult;
    return { ok: true, status: res.status, endpoint: finalEndpoint, ...json, raw };
  } catch {
    return {
      ok: false,
      status: res.status,
      endpoint: finalEndpoint,
      error: "edge_invalid_json",
      raw
    };
  }
}

export async function edgePing() {
  return callEdge({ mode: "ping" });
}

export async function edgeChat(prompt: string, system?: string) {
  return callEdge({ mode: "chat", prompt, system });
}

export async function edgeExtract(userText: string, extractorSystemPrompt: string) {
  return callEdge({ mode: "extract", prompt: userText, system: extractorSystemPrompt });
}