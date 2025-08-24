import React, { useEffect, useState } from "react";
import { edgePing, edgeChat, edgeNLU, edgeRoadmap } from "@/lib/ai";

type Msg = { role: "user" | "assistant"; text: string; ts: number };
type Style = "eli5" | "intermediate" | "developer";

const ORDER = ["idea","name","audience","features","privacy","auth","deep_work_hours"] as const;
type Answers = Partial<Record<(typeof ORDER)[number], any>>;

function nextQuestion(a: Answers): string {
  for (const k of ORDER) {
    const v = a[k];
    if (v == null || (Array.isArray(v) && v.length === 0)) {
      switch (k) {
        case "idea": return "What's your app idea in one short line?";
        case "name": return 'Do you have a working name? If not, say "invent one" or type a short name (e.g. PhotoFix).';
        case "audience": return "Who is it for (your ideal customer/user)?";
        case "features": return "Top 2–3 must‑have features (comma separated).";
        case "privacy": return "Data visibility: Private, Share via link, or Public?";
        case "auth": return "Sign‑in: Google OAuth, Magic email link, or None (dev only)?";
        case "deep_work_hours": return "Daily focused work hours: 0.5, 1, 2, or 4+?";
      }
    }
  }
  return "";
}

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [style, setStyle] = useState<Style>("eli5");
  const [answers, setAnswers] = useState<Answers>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        text:
          "Hi — let's get started building your idea! I'll ask a few quick questions, keep notes, and when I have enough, I'll propose a roadmap. " +
          "You can interrupt anytime with questions. First, how should I talk to you? Say: ELI5 (very simple), Intermediate, or Developer.",
        ts: Date.now(),
      },
    ]);
  }, []);

  async function onPing() {
    try {
      const res = await edgePing();
      setMessages((m) => [...m, { role: "assistant", text: `Ping → ${res.raw}`, ts: Date.now() }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", text: `Ping error: ${e.message}`, ts: Date.now() }]);
    }
  }

  async function send() {
    const say = input.trim();
    if (!say) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: say, ts: Date.now() }]);

    // quick style selection
    if (/^(eli5|intermediate|developer)$/i.test(say)) {
      const picked = say.toLowerCase() as Style;
      setStyle(picked);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text:
            picked === "eli5"
              ? "Got it — I'll keep it very simple. What's your app idea in one short line?"
              : picked === "intermediate"
              ? "Great — I'll keep things moderately technical. What's your app idea in one short line?"
              : "Cool — developer mode it is. What's your app idea in one short line?",
          ts: Date.now(),
        },
      ]);
      return;
    }

    // If not fully collected, use NLU
    const need = nextQuestion(answers);
    if (need) {
      try {
        setBusy(true);
        const { json } = await edgeNLU(say, style);
        if (json?.field) {
          setAnswers((prev) => {
            const next = { ...prev, [json.field]: json.value };
            const reflect = json?.reply || `Captured **${json.field}**.`;
            const nxtQ = nextQuestion(next) || "I have everything I need. Say: generate roadmap.";
            setMessages((m) => [
              ...m,
              { role: "assistant", text: reflect, ts: Date.now() },
              { role: "assistant", text: nxtQ, ts: Date.now() },
            ]);
            return next;
          });
        } else {
          setMessages((m) => [...m, { role: "assistant", text: json?.reply || "Could you rephrase that in one short line?", ts: Date.now() }]);
        }
      } catch (e: any) {
        setMessages((m) => [...m, { role: "assistant", text: `Error talking to AI: ${e.message}`, ts: Date.now() }]);
      } finally {
        setBusy(false);
      }
      return;
    }

    // Roadmap trigger
    if (/^generate roadmap$/i.test(say)) {
      try {
        setBusy(true);
        const { json } = await edgeRoadmap(answers, style);
        setMessages((m) => [...m, { role: "assistant", text: json?.reply || "Roadmap ready.", ts: Date.now() }]);
      } catch (e: any) {
        setMessages((m) => [...m, { role: "assistant", text: `Error generating roadmap: ${e.message}`, ts: Date.now() }]);
      } finally {
        setBusy(false);
      }
      return;
    }

    // Regular small talk
    try {
      const { json } = await edgeChat(say, style);
      setMessages((m) => [...m, { role: "assistant", text: json?.reply || "👍", ts: Date.now() }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", text: `Error talking to AI: ${e.message}`, ts: Date.now() }]);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Chat with Copilot</h1>
        <div className="flex gap-2">
          <button className="px-2 py-1 border rounded" onClick={() => window.location.reload()}>Refresh</button>
          <button className="px-2 py-1 border rounded" onClick={onPing}>Ping Edge</button>
        </div>
      </div>

      <div className="min-h-[400px] p-4 border rounded">
        <div className="space-y-2">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : ""}>
              <div className="inline-block px-3 py-2 rounded border">
                {m.text}
              </div>
            </div>
          ))}
          {busy && <div className="text-sm opacity-70">…thinking</div>}
        </div>
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => (e.key === "Enter" ? send() : undefined)}
          placeholder="Type your message…"
          className="flex-1 px-3 py-2 border rounded"
        />
        <button className="px-3 py-2 border rounded" onClick={send}>Send</button>
      </div>
    </div>
  );
}