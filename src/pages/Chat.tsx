import { useEffect, useMemo, useRef, useState } from "react";
import { edgePing, edgeChat, edgeExtract } from "@/lib/ai";

type Msg = { role: "assistant" | "user" | "system"; text: string; ts: number };
type Answers = {
  tone: "eli5" | "intermediate" | "developer" | null;
  idea: string | null;
  name: string | null;
  audience: string | null;
  features: string[];
  privacy: "Private" | "Share via link" | "Public" | null;
  auth: "Google OAuth" | "Magic email link" | "None (dev only)" | null;
  deep_work_hours: "0.5" | "1" | "2" | "4+" | null;
};

const EXTRACTOR_SPEC = `
You are Lovable Copilot. Always output ONLY a single JSON object with this shape:
{
  "reply_to_user": "string",
  "extracted": {
    "tone": "eli5|intermediate|developer|null",
    "idea": "string|null",
    "name": "string|null",
    "audience": "string|null",
    "features": "string[]",
    "privacy": "Private|Share via link|Public|null",
    "auth": "Google OAuth|Magic email link|None (dev only)|null",
    "deep_work_hours": "0.5|1|2|4+|null"
  },
  "status": {
    "complete": "boolean",
    "missing": "string[]",
    "next_question": "string"
  },
  "suggestions": "string[]"
}
Rules:
	•	Be warm and succinct. Don't sound like a form. No bullet lists.
	•	Never store literal non-answers like "I don't know"; use null and ask a clarifier later.
	•	If a field changes, confirm the update in reply_to_user.
	•	If all required fields (except tone) are filled, summarize in a short paragraph and ask for confirmation.
`;

function emptyAnswers(): Answers {
  return {
    tone: null,
    idea: null,
    name: null,
    audience: null,
    features: [],
    privacy: null,
    auth: null,
    deep_work_hours: null
  };
}

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState(() => {
    try {
      const s = localStorage.getItem("cp_answers_v2");
      return s ? JSON.parse(s) : emptyAnswers();
    } catch { return emptyAnswers(); }
  });

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        { role: "assistant", text: "Hi — let's get started building your idea! I'm wired to an edge function. You can test it with the Ping Edge button. How should I talk to you? Say: Explain like I'm 5 (very simple), Intermediate, or Developer.", ts: Date.now() }
      ]);
      setSuggestions(["Explain like I'm 5", "Intermediate", "Developer"]);
    }
  }, []);

  useEffect(() => {
    try { localStorage.setItem("cp_answers_v2", JSON.stringify(answers)); } catch {}
  }, [answers]);

  async function onPing() {
    setErr(null);
    const r = await edgePing();
    if (!(r as any).ok) {
      setErr(`Ping error: ${(r as any).error || "unknown"} ${String((r as any).status || "")}`);
      return;
    }
    const last = (r as any).raw || JSON.stringify(r);
    setMessages(m => [...m, { role: "assistant", text: `Endpoint: ${(r as any).endpoint}\nPing → ok:${(r as any).ok} status:${(r as any).status} reply:${(r as any).raw || ""}`, ts: Date.now() }]);
  }

  async function send(chipText?: string) {
    const say = (chipText ?? input).trim();
    if (!say) return;
    setInput("");
    setErr(null);
    setMessages(m => [...m, { role: "user", text: say, ts: Date.now() }]);

    // Use extractor mode for all onboarding turns
    const r = await edgeExtract(say, EXTRACTOR_SPEC);

    if (!(r as any).ok) {
      const e = r as any;
      // surface meaningful errors
      if (e.error === "missing_openai_key") {
        setMessages(m => [...m, { role: "assistant", text: "Server is missing OPENAI_API_KEY. Please add it to Supabase Edge Function secrets and redeploy.", ts: Date.now() }]);
      } else if (e.error === "upstream_error" || e.error === "upstream_invalid_json" || e.error === "edge_non_200") {
        setMessages(m => [...m, { role: "assistant", text: `Upstream issue. Status: ${e.status || "?"}. Raw: ${e.raw ? String(e.raw).slice(0, 280) : "n/a"}`, ts: Date.now() }]);
      } else {
        setMessages(m => [...m, { role: "assistant", text: `Error talking to AI: ${e.error || "unknown"}`, ts: Date.now() }]);
      }
      setSuggestions([]);
      return;
    }

    const jr = r as any;
    // Expect { success:true, mode:"extract", data: {...}, raw: "..." }
    const data = jr?.data;
    if (!data || typeof data !== "object") {
      setMessages(m => [...m, { role: "assistant", text: "Parse error: AI did not return the expected JSON envelope.", ts: Date.now() }]);
      setSuggestions([]);
      return;
    }

    const reply = data.reply_to_user ?? "(no reply)";
    const extracted = data.extracted ?? {};
    const nextAnswers: Answers = {
      tone: extracted.tone ?? answers.tone ?? null,
      idea: extracted.idea ?? answers.idea ?? null,
      name: extracted.name ?? answers.name ?? null,
      audience: extracted.audience ?? answers.audience ?? null,
      features: Array.isArray(extracted.features) ? extracted.features : (answers.features ?? []),
      privacy: extracted.privacy ?? answers.privacy ?? null,
      auth: extracted.auth ?? answers.auth ?? null,
      deep_work_hours: extracted.deep_work_hours ?? answers.deep_work_hours ?? null
    };

    setAnswers(nextAnswers);
    setMessages(m => [...m, { role: "assistant", text: String(reply), ts: Date.now() }]);

    const nextQ = data?.status?.next_question;
    const sugg = Array.isArray(data?.suggestions) ? data.suggestions : [];
    
    // Update suggestions state
    if (sugg.length > 0) {
      setSuggestions(sugg.slice(0, 6)); // Limit to 6 chips
    } else if (!nextAnswers.tone) {
      setSuggestions(["Explain like I'm 5", "Intermediate", "Developer"]);
    } else {
      setSuggestions([]);
    }
    
    if (nextQ) {
      setMessages(m => [...m, { role: "assistant", text: nextQ, ts: Date.now() }]);
    }
  }

  function onChipClick(label: string) {
    // Map friendly tone labels to internal tokens
    const normalized = 
      /^explain like i'?m 5$/i.test(label) ? 'eli5'
      : /^intermediate$/i.test(label) ? 'intermediate' 
      : /^developer$/i.test(label) ? 'developer'
      : label;
    
    send(normalized);
  }

  function QuickChips() {
    if (!suggestions.length) return null;
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        {suggestions.map((chip, i) => (
          <button
            key={`${chip}-${i}`}
            onClick={() => onChipClick(chip)}
            className="px-3 py-1 rounded-full border text-sm hover:bg-muted transition-colors"
          >
            {chip}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex gap-2">
        <button className="px-3 py-1 rounded border" onClick={onPing}>Ping Edge</button>
        {err && <div className="text-red-600 text-sm">{err}</div>}
      </div>

      <div className="space-y-2 bg-white border rounded p-3 min-h-[200px]">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div className={`inline-block px-3 py-2 rounded ${m.role === "user" ? "bg-blue-50" : m.role === "assistant" ? "bg-gray-50" : "bg-amber-50"}`}>
              {m.text}
            </div>
          </div>
        ))}
      </div>

      <QuickChips />

      <div className="flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" ? send() : undefined}
          placeholder="Type your message…"
        />
        <button className="px-3 py-2 rounded bg-black text-white" onClick={() => send()}>Send</button>
      </div>
    </div>
  );
}