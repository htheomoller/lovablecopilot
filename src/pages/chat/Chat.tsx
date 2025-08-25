import React from "react";

type Extracted = {
  tone: "eli5" | "intermediate" | "developer" | null;
  idea: string | null;
  name: string | null;
  audience: string | null;
  features: string[];
  privacy: "Private" | "Share via link" | "Public" | null;
  auth: "Google OAuth" | "Magic email link" | "None (dev only)" | null;
  deep_work_hours: "0.5" | "1" | "2" | "4+" | null;
};
type AIEnvelope = {
  success: boolean;
  mode: "chat";
  reply_to_user: string;
  extracted: Extracted;
  status: { complete: boolean; missing: string[]; next_question: string };
  suggestions: string[];
  error?: string;
  message?: string;
};

const EDGE = import.meta.env.VITE_SUPABASE_URL + "/functions/v1/ai-generate";

export default function Chat() {
  const [messages, setMessages] = React.useState<{role:"user"|"assistant", text:string}[]>([]);
  const [input, setInput] = React.useState("");
  const [answers, setAnswers] = React.useState<Extracted>({
    tone:null, idea:null, name:null, audience:null, features:[], privacy:null, auth:null, deep_work_hours:null
  });
  const [chips, setChips] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function send(prompt: string) {
    setError(null);
    setBusy(true);
    setMessages(m => [...m, { role:"user", text: prompt }]);
    try {
      const r = await fetch(EDGE, {
        method: "POST",
        headers: { "Content-Type":"application/json", apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ mode:"chat", prompt })
      });
      const raw = await r.text();
      let data: AIEnvelope;
      try { data = JSON.parse(raw); } catch {
        throw new Error(`non_json_edge:${raw.slice(0,200)}`);
      }
      if (!data?.success) throw new Error(data?.message || data?.error || "edge_error");

      // Assistant turn
      setMessages(m => [...m, { role:"assistant", text: data.reply_to_user }]);

      // Merge extracted answers (only overwrite keys present)
      setAnswers(prev => ({
        tone: data.extracted.tone ?? prev.tone,
        idea: data.extracted.idea ?? prev.idea,
        name: data.extracted.name ?? prev.name,
        audience: data.extracted.audience ?? prev.audience,
        features: Array.isArray(data.extracted.features) ? data.extracted.features : prev.features,
        privacy: data.extracted.privacy ?? prev.privacy,
        auth: data.extracted.auth ?? prev.auth,
        deep_work_hours: data.extracted.deep_work_hours ?? prev.deep_work_hours
      }));

      setChips(Array.isArray(data.suggestions) ? data.suggestions.slice(0,6) : []);
    } catch (e:any) {
      setError(String(e?.message || e));
      setMessages(m => [...m, { role:"assistant", text: "I hit an error talking to the edge. Try again in a moment." }]);
    } finally {
      setBusy(false);
      setInput("");
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="text-sm text-gray-500">Endpoint: {EDGE}</div>

      <div className="space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div className={`inline-block rounded-xl px-3 py-2 ${m.role==="user" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
              {m.text}
            </div>
            {m.role==="assistant" && chips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {chips.map((c, idx) => (
                  <button
                    key={idx}
                    onClick={()=> send(c)}
                    className="text-sm rounded-full border px-3 py-1 hover:bg-gray-50"
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <div className="text-xs text-red-600 break-words">Error: {error}</div>}

      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); if (!busy && input.trim()) send(input.trim()); }}
      >
        <input
          className="flex-1 border rounded-lg px-3 py-2"
          placeholder="Type your message…"
          value={input}
          onChange={(e)=> setInput(e.target.value)}
        />
        <button disabled={busy} className="rounded-lg bg-black text-white px-4 py-2">{busy ? "…" : "Send"}</button>
      </form>

      <div className="text-xs text-gray-500">Answers: {JSON.stringify(answers)}</div>
    </div>
  );
}