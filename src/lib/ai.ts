/**
 * Client helper to call the structured conversation edge function
 */
const BASE = "https://yjfqfnmrsdfbvlyursdi.supabase.co";
const EDGE = `${BASE}/functions/v1/ai-generate`;

export async function callConversationAPI(
  message: string = "",
  state?: string,
  answers?: any,
  mode: "ping" | "chat" = "chat"
) {
  if (mode === "ping") {
    const r = await fetch(`${EDGE}?mode=ping`, { method: "GET" });
    if (!r.ok) throw new Error(`Edge ${r.status}`);
    return await r.json();
  }

  const r = await fetch(EDGE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqZnFmbm1yc2RmYnZseXVyc2RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU5Mjk2MDQsImV4cCI6MjA3MTUwNTYwNH0.gPkkIglRw7yz7z-XWB0ZOTfWb9jlOZkt_2wCRT4q_gQ",
      "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqZnFmbm1yc2RmYnZseXVyc2RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU5Mjk2MDQsImV4cCI6MjA3MTUwNTYwNH0.gPkkIglRw7yz7z-XWB0ZOTfWb9jlOZkt_2wCRT4q_gQ",
    },
    body: JSON.stringify({ 
      mode, 
      message,
      state,
      answers
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