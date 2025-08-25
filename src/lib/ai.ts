export type Extracted = {
  tone: "eli5" | "intermediate" | "developer" | null;
  idea: string | null;
  name: string | null;
  audience: string | null;
  features: string[];
  privacy: "Private" | "Share via link" | "Public" | null;
  auth: "Google OAuth" | "Magic email link" | "None (dev only)" | null;
  deep_work_hours: "0.5" | "1" | "2" | "4+" | null;
};

export type Envelope = {
  reply_to_user: string;
  extracted: Extracted;
  status: {
    complete: boolean;
    missing: string[];
    next_question: string;
  };
  suggestions: string[];
};

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-generate`;

async function callEdge(payload: any) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON from edge (status ${res.status}): ${text}`);
  }
  if (!res.ok) throw new Error(json?.error || `Edge error ${res.status}`);
  return json;
}

export async function aiChat(prompt: string, mode: "chat" | "extract" = "chat", answers?: Partial<Extracted>) {
  const data = await callEdge({ mode, prompt, answers });
  if (data?.envelope) return data.envelope as Envelope;

  // graceful fallback when edge couldn't parse the LLM output
  return {
    reply_to_user: data?.reply ?? "Thanks — tell me a bit more and I'll keep going.",
    extracted: {
      tone: null, idea: null, name: null, audience: null, features: [],
      privacy: null, auth: null, deep_work_hours: null
    },
    status: { complete: false, missing: ["idea"], next_question: "What's your app idea in one short line?" },
    suggestions: [],
  } as Envelope;
}