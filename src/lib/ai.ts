import type { EdgeResponse, Extracted } from './types';

export async function callEdgeChat(endpoint: string, prompt: string, answers: Extracted): Promise<EdgeResponse> {
  const body = { mode: 'chat', prompt, answers };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  let json: any;
  try { json = await res.json(); } catch {
    return { success: false, error: `Non-JSON from edge (status ${res.status})` };
  }
  return json as EdgeResponse;
}

export async function callEdgePing(endpoint: string) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'ping', prompt: 'ping' })
  });
  try { return await res.json(); } catch { return { success: false, error: 'Non-JSON' }; }
}