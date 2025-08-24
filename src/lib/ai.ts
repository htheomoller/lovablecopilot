export async function callEdge(prompt: string) {
  const res = await fetch("/functions/v1/ai-generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  // Always attempt JSON; if HTML, throw
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return json;
  } catch {
    throw new Error("Non-JSON response from edge (likely a 404/HTML).");
  }
}