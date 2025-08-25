/**
 * Client helper to call the OpenAI-powered conversation edge function
 */
const BASE = "https://yjfqfnmrsdfbvlyursdi.supabase.co";
const EDGE = `${BASE}/functions/v1/ai-generate`;

type ExtractedData = {
  tone: "eli5" | "intermediate" | "developer" | null;
  idea: string | null;
  name: string | null;
  audience: string | null;
  features: string[];
  privacy: "Private" | "Share via link" | "Public" | null;
  auth: "Google OAuth" | "Magic email link" | "None (dev only)" | null;
  deep_work_hours: "0.5" | "1" | "2" | "4+" | null;
};

export async function callConversationAPI(
  prompt: string = "",
  answers: Partial<ExtractedData> = {},
  tone?: "eli5" | "intermediate" | "developer",
  mode: "ping" | "chat" | "extract" = "chat"
) {
  const r = await fetch(EDGE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqZnFmbm1yc2RmYnZseXVyc2RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU5Mjk2MDQsImV4cCI6MjA3MTUwNTYwNH0.gPkkIglRw7yz7z-XWB0ZOTfWb9jlOZkt_2wCRT4q_gQ",
      "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqZnFmbm1yc2RmYnZseXVyc2RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU5Mjk2MDQsImV4cCI6MjA3MTUwNTYwNH0.gPkkIglRw7yz7z-XWB0ZOTfWb9jlOZkt_2wCRT4q_gQ",
    },
    body: JSON.stringify({ 
      mode,
      prompt,
      answers,
      tone
    }),
  });

  const text = await r.text();
  try {
    const json = JSON.parse(text);
    if (!r.ok) throw new Error(json?.error || "Edge " + r.status);
    return json;
  } catch {
    throw new Error("Non-JSON from edge (status " + r.status + "): " + text.slice(0, 160));
  }
}