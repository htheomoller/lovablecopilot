import 'jsr:@supabase/functions-js/edge-runtime';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { mode = 'chat', prompt = '', answer_style = 'eli5', answers } = await req.json();
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

    const sys = mode === 'nlu'
      ? "You extract structured fields from a single user message for an app-onboarding chat. Allowed fields: idea, name, audience, features (array), privacy, auth, deep_work_hours. Always return a short normalized value (one line). If unclear, guess politely and ask a concise confirm question."
      : mode === 'roadmap'
      ? "You are a product copilot. Produce a concise roadmap and 3-4 milestones using the provided answers."
      : "Be a succinct, friendly copilot.";

    const body = {
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: sys },
        ...(mode === 'roadmap' ? [{ role: 'user', content: `Answers JSON: ${JSON.stringify(answers)}` }] : [{ role: 'user', content: prompt }])
      ],
      max_completion_tokens: 600
    };

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!r.ok) {
      const t = await r.text();
      console.error('OpenAI error', t);
      return new Response(JSON.stringify({ success: false, error: 'upstream_error', details: t }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const j = await r.json();
    const text = j.choices?.[0]?.message?.content?.trim() || '';

    if (mode === 'nlu') {
      // very small, robust parser: look for a JSON blob first, else heuristic
      // Expected model behavior: first line plain echo, then JSON
      let field = null as string | null; let value: any = null;
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const obj = JSON.parse(match[0]);
          field = obj.field || null; value = obj.value ?? null;
        } catch {}
      }
      if (!field) {
        // Heuristic fallback
        const lower = prompt.toLowerCase();
        if (/(idea|build|app)/.test(lower)) { field = 'idea'; value = prompt; }
        else if (/name/.test(lower)) { field = 'name'; value = prompt; }
        else if (/(user|audience|customer)/.test(lower)) { field = 'audience'; value = prompt; }
        else if (/(feature|features)/.test(lower)) { field = 'features'; value = prompt.split(/,|;|\n/).map(s => s.trim()).filter(Boolean); }
      }
      const reply = field && value ? `Got it: **${field}** → "${Array.isArray(value) ? value.join(', ') : value}".` : 'Thanks — could you say that in one short line?';
      return new Response(JSON.stringify({ success: true, mode, field, value, reply }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (mode === 'roadmap') {
      // Try to pull a milestones JSON array from the output; otherwise return text only
      let milestones = [] as any[];
      const m = text.match(/\[[\s\S]*\]/);
      if (m) { try { milestones = JSON.parse(m[0]); } catch {} }
      return new Response(JSON.stringify({ success: true, mode, reply: text, milestones }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // chat
    return new Response(JSON.stringify({ success: true, mode, reply: text }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'unknown' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});