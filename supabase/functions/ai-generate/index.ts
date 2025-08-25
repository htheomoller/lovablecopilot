/**
 * Supabase Edge Function: ai-generate
 * Implements structured conversation flow with state machine
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Vary": "Origin",
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}), ...corsHeaders },
  });
}

type ChatPayload = {
  mode?: "ping" | "chat";
  project_id?: string;
  message?: string;
  client_time?: string;
};

// Load conversation flow spec
const CONVERSATION_FLOW = {
  "fields": {
    "tone": { "type": "enum", "values": ["explain_like_im_5","intermediate","developer"] },
    "idea": { "type": "string", "min": 3, "max": 180 },
    "name": { "type": "string", "min": 3, "max": 40 },
    "audience": { "type": "string", "min": 3, "max": 140 },
    "features": { "type": "string[]", "minItems": 1, "maxItems": 5 },
    "privacy": { "type": "enum", "values": ["private","share_link","public"] },
    "auth": { "type": "enum", "values": ["google_oauth","magic_link","none_dev_only"] }
  },
  "order": ["tone","idea","name","audience","features","privacy","auth"],
  "normalizers": {
    "tone": [
      { "match": "(^|\\b)(eli5|explain like i'?m 5|very simple)\\b", "value": "explain_like_im_5" },
      { "match": "(^|\\b)intermediate\\b", "value": "intermediate" },
      { "match": "(^|\\b)dev(eloper)?\\b", "value": "developer" }
    ],
    "privacy": [
      { "match": "\\bprivate\\b", "value": "private" },
      { "match": "share", "value": "share_link" },
      { "match": "\\bpublic\\b", "value": "public" }
    ],
    "auth": [
      { "match": "google|oauth", "value": "google_oauth" },
      { "match": "magic|email\\s*link", "value": "magic_link" },
      { "match": "(^|\\b)(none|no auth|dev only)\\b", "value": "none_dev_only" }
    ],
    "features": {
      "split": "[,;\\n]+",
      "map": [
        { "match": "roadmap", "value": "generate_roadmap" },
        { "match": "prd|spec", "value": "draft_prd" },
        { "match": "health|lint|quality|coverage", "value": "code_health" },
        { "match": "auth|login|signup", "value": "setup_auth" },
        { "match": "image|photo|restore|process", "value": "image_processing" },
        { "match": "pay|stripe|checkout", "value": "payments" }
      ],
      "fallback": "free_text"
    }
  },
  "blurbs": {
    "tone": [
      { "label": "Explain like I'm 5", "value": "explain_like_im_5" },
      { "label": "Intermediate", "value": "intermediate" },
      { "label": "Developer", "value": "developer" }
    ],
    "features": [
      { "label": "Generate roadmap", "value": "generate_roadmap" },
      { "label": "Draft PRD", "value": "draft_prd" },
      { "label": "Code health checks", "value": "code_health" },
      { "label": "Setup auth", "value": "setup_auth" },
      { "label": "Image processing", "value": "image_processing" },
      { "label": "Payments", "value": "payments" }
    ],
    "privacy": [
      { "label": "Private", "value": "private" },
      { "label": "Share via link", "value": "share_link" },
      { "label": "Public", "value": "public" }
    ],
    "auth": [
      { "label": "Google OAuth", "value": "google_oauth" },
      { "label": "Magic email link", "value": "magic_link" },
      { "label": "None (dev only)", "value": "none_dev_only" }
    ]
  }
};

const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Normalize user input based on field type
function normalizeInput(message: string, field: string): any {
  const lower = message.toLowerCase();
  const normalizers = CONVERSATION_FLOW.normalizers[field];
  
  if (!normalizers) return null;
  
  if (Array.isArray(normalizers)) {
    for (const norm of normalizers) {
      if (new RegExp(norm.match, 'i').test(lower)) {
        return norm.value;
      }
    }
  } else if (field === 'features') {
    // Handle features array normalization
    const parts = message.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    const normalized = [];
    
    for (const part of parts) {
      let found = false;
      for (const norm of normalizers.map) {
        if (new RegExp(norm.match, 'i').test(part)) {
          normalized.push(norm.value);
          found = true;
          break;
        }
      }
      if (!found && normalizers.fallback === 'free_text') {
        normalized.push(part.slice(0, 30)); // Limit length
      }
    }
    return normalized.slice(0, 5); // Max 5 features
  }
  
  return null;
}

// Get next missing field
function getNextMissingField(answers: Record<string, any>): string | null {
  for (const field of CONVERSATION_FLOW.order) {
    const value = answers[field];
    if (!value || (Array.isArray(value) && value.length === 0)) {
      return field;
    }
  }
  return null;
}

// Generate state machine response
function getStateResponse(state: string, answers: Record<string, any>): { prompt: string, blurbs?: any[] } {
  switch (state) {
    case 'ASK_TONE':
      return { 
        prompt: "How should I talk to you? Choose a style.", 
        blurbs: CONVERSATION_FLOW.blurbs.tone 
      };
    case 'ASK_IDEA':
      return { prompt: "What's your app idea in one short line?" };
    case 'ASK_NAME':
      return { prompt: "Do you already have a name? If not, say 'invent one' and I'll suggest a provisional working name." };
    case 'ASK_AUDIENCE':
      return { prompt: "Who is it for? Describe your ideal user or customer." };
    case 'ASK_FEATURES':
      return { 
        prompt: "List 2–5 must‑have features, or tap to pick.", 
        blurbs: CONVERSATION_FLOW.blurbs.features 
      };
    case 'ASK_PRIVACY':
      return { 
        prompt: "Data visibility preference?", 
        blurbs: CONVERSATION_FLOW.blurbs.privacy 
      };
    case 'ASK_AUTH':
      return { 
        prompt: "Sign‑in method?", 
        blurbs: CONVERSATION_FLOW.blurbs.auth 
      };
    case 'CONFIRM':
      const summary = `Summary\n- Tone: ${answers.tone || '—'}\n- Idea: ${answers.idea || '—'}\n- Name: ${answers.name || '—'}\n- Audience: ${answers.audience || '—'}\n- Features: ${(answers.features || []).join(', ') || '—'}\n- Privacy: ${answers.privacy || '—'}\n- Auth: ${answers.auth || '—'}`;
      return { prompt: `${summary}\n\nIs this correct? Reply Yes to proceed or type what to change.` };
    default:
      return { prompt: "I'm not sure what to ask next. Can you help me understand?" };
  }
}

// Generate roadmap using OpenAI
async function generateRoadmap(answers: Record<string, any>): Promise<any> {
  const prompt = `Generate a 3-phase roadmap for this project: ${JSON.stringify(answers)}. Return JSON with phases[].milestones[] structure.`;
  
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a product roadmap expert. Return only valid JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    }),
  });

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content);
  } catch {
    return { phases: [] };
  }
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Handle ping requests
    const url = new URL(req.url);
    if (req.method === "GET" && url.searchParams.get("mode") === "ping") {
      return jsonResponse({ success: true, mode: "ping", reply: "pong" });
    }

    const body = (req.method === "POST") ? await req.json().catch(() => ({})) as ChatPayload : {};
    const mode = body.mode ?? "chat";

    if (mode === "ping") {
      return jsonResponse({ success: true, mode: "ping", reply: "pong" });
    }

    if (!OPENAI_KEY) {
      return jsonResponse({ success: false, error: "OPENAI_API_KEY is not set" }, { status: 500 });
    }

    // Extract user from auth header
    const authHeader = req.headers.get('authorization');
    let userId = null;
    if (authHeader) {
      try {
        const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
        userId = user?.id;
      } catch (e) {
        console.log('Auth error:', e);
      }
    }

    // Get or create project
    let project;
    if (body.project_id && userId) {
      const { data } = await supabase
        .from('cp_projects')
        .select('*')
        .eq('id', body.project_id)
        .eq('user_id', userId)
        .single();
      project = data;
    }

    if (!project && userId) {
      const { data, error } = await supabase
        .from('cp_projects')
        .insert({
          user_id: userId,
          answers: {},
          state: 'ASK_TONE'
        })
        .select()
        .single();
      
      if (error) {
        console.error('Failed to create project:', error);
      } else {
        project = data;
      }
    }

    // If no project and no user, use session storage approach
    if (!project) {
      project = {
        id: 'session',
        answers: {},
        state: 'ASK_TONE'
      };
    }

    let currentState = project.state;
    let currentAnswers = project.answers || {};
    let reply = "";
    let blurbs = undefined;

    // Handle user message
    if (body.message) {
      const message = body.message.trim();
      
      // Special handling for confirmation state
      if (currentState === 'CONFIRM') {
        if (/^(yes|y|ok|sure|proceed|continue)$/i.test(message)) {
          currentState = 'GENERATE_ROADMAP';
        } else {
          // User wants to change something, stay in confirm but provide feedback
          reply = "What would you like to change? Please describe it.";
        }
      } 
      // Handle roadmap generation
      else if (currentState === 'GENERATE_ROADMAP') {
        try {
          const roadmap = await generateRoadmap(currentAnswers);
          if (project.id !== 'session' && userId) {
            await supabase
              .from('cp_projects')
              .update({ 
                roadmap: roadmap,
                state: 'DONE'
              })
              .eq('id', project.id);
          }
          currentState = 'DONE';
          reply = "Great! I've generated your roadmap. Here's your 3-phase plan to bring your idea to life.";
        } catch (e) {
          reply = "I had trouble generating the roadmap. Let me try again.";
        }
      }
      // Normal field processing
      else {
        const nextField = getNextMissingField(currentAnswers);
        
        if (nextField) {
          // Try to normalize the input for the current field
          const normalized = normalizeInput(message, nextField);
          
          if (normalized !== null) {
            // Successfully normalized, update answers
            currentAnswers[nextField] = normalized;
            
            // Generate reflection message
            const fieldLabel = nextField.replace(/_/g, ' ');
            const value = Array.isArray(normalized) ? normalized.join(', ') : normalized.replace(/_/g, ' ');
            reply = `Got it — ${fieldLabel} set to "${value}".`;
            
            // Check if all fields are filled
            const stillMissing = getNextMissingField(currentAnswers);
            if (!stillMissing) {
              currentState = 'CONFIRM';
            } else {
              currentState = `ASK_${stillMissing.toUpperCase()}`;
            }
          } else {
            // Couldn't normalize, ask for clarification
            reply = `I'm not sure I understood that for ${nextField.replace(/_/g, ' ')}. Could you rephrase?`;
            currentState = `ASK_${nextField.toUpperCase()}`;
          }
        }
      }
    }

    // Get the appropriate response for current state
    if (!reply) {
      const stateResponse = getStateResponse(currentState, currentAnswers);
      reply = stateResponse.prompt;
      blurbs = stateResponse.blurbs;
    }

    // Update project in database if we have a real project
    if (project.id !== 'session' && userId) {
      await supabase
        .from('cp_projects')
        .update({ 
          answers: currentAnswers, 
          state: currentState,
          updated_at: new Date().toISOString()
        })
        .eq('id', project.id);
    }

    return jsonResponse({
      success: true,
      reply,
      state: currentState,
      answers: currentAnswers,
      blurbs,
      project_id: project.id
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Error in ai-generate function:', msg);
    return jsonResponse({ success: false, error: msg }, { status: 500 });
  }
});