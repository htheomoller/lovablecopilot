export async function callCopilot(prompt: string, snapshot: unknown) {
  const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-generate`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "chat", prompt, snapshot }),
  });
  return res.json();
}