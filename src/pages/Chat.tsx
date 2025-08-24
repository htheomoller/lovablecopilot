import { useEffect, useState } from "react";
import { aiPing, aiChat, aiExtract, aiRoadmap } from "@/lib/ai";
import { Answers, mergeExtract, nextMissing, reflectPromptFor } from "@/lib/onboarding";

type Msg = { role: "assistant" | "user" | "system", text: string, ts: number };

const GREETING = `Hi — let's get started building your idea! I'm wired to an edge function. You can test it with the Ping Edge button. How should I talk to you? Say: ELI5 (very simple), Intermediate, or Developer.`;

const KEY = "cp_chat_session_v2";

type Session = {
  messages: Msg[];
  answers: Answers;
  style: "eli5" | "intermediate" | "developer";
};

function load(): Session {
  try {
    const j = localStorage.getItem(KEY);
    if (j) return JSON.parse(j) as Session;
  } catch {}
  return {
    messages: [{ role: "assistant", text: GREETING, ts: Date.now() }],
    answers: {},
    style: "eli5",
  };
}

function save(s: Session) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

export default function Chat() {
  const [s, setS] = useState(load());
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { save(s); }, [s]);

  async function pingEdge() {
    try {
      const r = await aiPing();
      push({ role: "system", text: `Endpoint OK → ${r.json?.reply}`, ts: Date.now() });
    } catch (e: any) {
      push({ role: "system", text: `Ping error: ${e?.message || e}`, ts: Date.now() });
    }
  }

  function push(m: Msg) {
    setS((prev) => ({ ...prev, messages: [...prev.messages, m] }));
  }

  function reset() {
    const fresh = load(); // resets to greeting
    setS(fresh);
  }

  async function handleSend() {
    const say = input.trim();
    if (!say) return;
    setInput("");
    push({ role: "user", text: say, ts: Date.now() });

    // quick style set
    if (/^eli5$/i.test(say)) {
      setS((prev) => ({ ...prev, style: "eli5" }));
      push({ role: "assistant", text: "Got it — I'll keep it very simple. What's your app idea in one short line?", ts: Date.now() });
      return;
    }
    if (/^intermediate$/i.test(say)) {
      setS((prev) => ({ ...prev, style: "intermediate" }));
      push({ role: "assistant", text: "Great — intermediate it is. What's your app idea in one short line?", ts: Date.now() });
      return;
    }
    if (/^developer$/i.test(say)) {
      setS((prev) => ({ ...prev, style: "developer" }));
      push({ role: "assistant", text: "Okay — I'll be specific and concise. What's your app idea in one short line?", ts: Date.now() });
      return;
    }

    // If we are missing a field → extract
    const missing = nextMissing(s.answers);
    if (missing) {
      setBusy(true);
      try {
        const r = await aiExtract(say);
        const fields = (r?.json?.fields ?? {}) as Partial<Answers>;
        const merged = mergeExtract(s.answers, fields);
        setS((prev) => ({ ...prev, answers: merged }));
        // reflect
        const reflect: string[] = [];
        for (const k of Object.keys(fields) as (keyof Answers)[]) {
          const v = (fields as any)[k];
          if (v == null) continue;
          const val = Array.isArray(v) ? v.join(", ") : String(v);
          reflect.push(`**${k}** → "${val}"`);
        }
        if (reflect.length) {
          push({ role: "assistant", text: `Noted: ${reflect.join("; ")}.`, ts: Date.now() });
        } else {
          // fallback small talk
          const chat = await aiChat(say);
          push({ role: "assistant", text: chat?.json?.reply || "Thanks — tell me more.", ts: Date.now() });
        }
        // ask next
        const nextKey = nextMissing(merged);
        if (nextKey) {
          push({ role: "assistant", text: reflectPromptFor(nextKey)!, ts: Date.now() });
        } else {
          // all captured → present summary
          const a = merged;
          const summary = [
            `Idea: ${a.idea || "-"}`,
            `Name: ${a.name || "-"}`,
            `Audience: ${a.audience || "-"}`,
            `Features: ${(a.features || []).join(", ") || "-"}`,
            `Privacy: ${a.privacy || "-"}`,
            `Auth: ${a.auth || "-"}`,
            `Daily hours: ${a.deep_work_hours || "-"}`,
          ].join("\n");
          push({ role: "assistant", text: `Great — I have everything. Please review:\n${summary}\n\nIf you're ready, say "generate roadmap".`, ts: Date.now() });
        }
      } catch (e: any) {
        push({ role: "assistant", text: `Error talking to AI: ${e?.message || e}`, ts: Date.now() });
      } finally {
        setBusy(false);
      }
      return;
    }

    // If user says generate roadmap
    if (/^generate\s+roadmap$/i.test(say)) {
      setBusy(true);
      try {
        const r = await aiRoadmap(s.answers);
        const roadmap = r?.json?.roadmap;
        if (roadmap?.summary) {
          push({ role: "assistant", text: roadmap.summary, ts: Date.now() });
        }
        if (Array.isArray(roadmap?.milestones)) {
          const list = roadmap.milestones.map((m: any, i: number) => `${i + 1}. ${m.name} (${m.duration_days}d) — ${m.description}`).join("\n");
          push({ role: "assistant", text: `Proposed milestones:\n${list}\n\nApprove? Say "looks good" or tell me what to change.`, ts: Date.now() });
        } else {
          push({ role: "assistant", text: "I drafted a roadmap. Tell me if you'd like tweaks.", ts: Date.now() });
        }
      } catch (e: any) {
        push({ role: "assistant", text: `Error generating roadmap: ${e?.message || e}`, ts: Date.now() });
      } finally {
        setBusy(false);
      }
      return;
    }

    // Otherwise, general chat
    try {
      const r = await aiChat(say);
      push({ role: "assistant", text: r?.json?.reply || "👍", ts: Date.now() });
    } catch (e: any) {
      push({ role: "assistant", text: `Error talking to AI: ${e?.message || e}`, ts: Date.now() });
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Chat with Copilot</h1>
        <button className="px-2 py-1 rounded bg-neutral-200 hover:bg-neutral-300" onClick={() => location.reload()}>Refresh</button>
        <button className="px-2 py-1 rounded bg-neutral-200 hover:bg-neutral-300" onClick={reset}>Reset</button>
        <button className="px-2 py-1 rounded bg-neutral-200 hover:bg-neutral-300" onClick={pingEdge}>Ping Edge</button>
      </div>

      <div className="border rounded p-3 space-y-2 bg-white">
        {s.messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div className={m.role === "user" ? "inline-block rounded px-3 py-2 bg-blue-50" : "inline-block rounded px-3 py-2 bg-neutral-100"}>
              {m.text}
            </div>
          </div>
        ))}
        {busy && <div className="text-sm text-neutral-500 italic">…thinking</div>}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 px-3 py-2 border rounded"
          placeholder="Type your message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => (e.key === "Enter" ? handleSend() : undefined)}
        />
        <button className="px-3 py-2 rounded bg-black text-white" onClick={handleSend}>Send</button>
      </div>
    </div>
  );
}
