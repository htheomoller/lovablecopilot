/**
 * Minimal client helpers for calling the edge function and parsing JSON.
 * Keeps the interface tiny and resilient to odd responses.
 */
export type ExtractorEnvelope = {
  reply_to_user: string
  extracted: {
    tone: 'eli5' | 'intermediate' | 'developer' | null
    idea: string | null
    name: string | null
    audience: string | null
    features: string[]
    privacy: 'Private' | 'Share via link' | 'Public' | null
    auth: 'Google OAuth' | 'Magic email link' | 'None (dev only)' | null
    deep_work_hours: '0.5' | '1' | '2' | '4+' | null
  }
  status: {
    complete: boolean
    missing: string[]
    next_question: string | null
  }
  suggestions: string[]
}

export async function callExtractor(
  endpoint: string,
  apiKey: string | undefined,
  text: string,
  context: Partial<ExtractorEnvelope['extracted']> | null = null
): Promise<{ ok: boolean; data?: ExtractorEnvelope; raw?: string; error?: string }> {
  try {
    const body: any = {
      mode: 'extract',
      prompt: text
    }
    if (context) body.context = context

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { apikey: apiKey, Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify(body)
    })

    const raw = await res.text()

    if (!res.ok) {
      return { ok: false, raw, error: `upstream_error_${res.status}` }
    }

    // Lenient parse: trim noise, try/catch once
    let j: any = null
    try { j = JSON.parse(raw) } catch { return { ok: false, raw, error: 'parse_error' } }

    // Pass through if already envelope
    if (j && j.reply_to_user && j.extracted && j.status && Array.isArray(j.suggestions)) {
      return { ok: true, data: j as ExtractorEnvelope, raw }
    }

    // If the server wraps payload: { success, reply, data } etc. try to unwrap
    if (j?.data?.reply_to_user && j?.data?.extracted && j?.data?.status) {
      return { ok: true, data: j.data as ExtractorEnvelope, raw }
    }

    return { ok: false, raw, error: 'invalid_envelope' }

  } catch (e: any) {
    return { ok: false, error: e?.message || 'network_error' }
  }
}