import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getStyleInstruction(answerStyle?: string): string {
  switch (answerStyle) {
    case 'eli5':
      return 'Explain very simply, with analogies, like I\'m 5.';
    case 'intermediate':
      return 'Explain practically, for a non-technical founder with some no-code experience.';
    case 'developer':
      return 'Explain technically, with precise code details, as if to a developer.';
    default:
      return 'Explain clearly and practically.';
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const body = await req.json();
    const mode = body.mode || 'chat';
    const prompt = body.prompt;
    const answerStyle = body.answer_style || 'eli5';
    const answers = body.answers || {};
    
    // Handle roadmap mode
    if (mode === 'roadmap') {
      if (!answers) {
        throw new Error('Answers are required for roadmap mode');
      }
      
      console.log('Generating roadmap for:', answers);
      
      // Build roadmap prompt
      const roadmapPrompt = `Create a detailed project roadmap based on these answers:
- App idea: ${answers.idea}
- Target audience: ${answers.audience}  
- Key features: ${Array.isArray(answers.features) ? answers.features.join(', ') : answers.features}
- Privacy level: ${answers.privacy}
- Authentication: ${answers.auth}
- Daily work capacity: ${answers.deep_work_hours} hours

Generate a friendly roadmap explanation that outlines the development phases, key milestones, and realistic timeline. Be encouraging and specific about what each phase involves.`;

      const styleInstruction = getStyleInstruction(answer_style);
      const messages = [
        { role: 'system', content: 'You are a technical project advisor creating personalized development roadmaps.' },
        { role: 'system', content: styleInstruction },
        { role: 'user', content: roadmapPrompt }
      ];

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: messages,
          max_completion_tokens: 1500,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('OpenAI API error:', errorData);
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const reply = data?.choices?.[0]?.message?.content || '';
      
      return new Response(JSON.stringify({ 
        success: true,
        reply,
        mode: 'roadmap'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Original prompt mode
    if (!prompt) {
      throw new Error('Prompt is required');
    }

    console.log('Generating text for prompt:', prompt);

    // Get style instruction
    const styleInstruction = getStyleInstruction(state?.answer_style || answer_style);

    // Build messages array with optional style instruction
    const messages = [
      {
        role: 'system',
        content: `You are Copilot's backend brain. You support three modes:
- chat: produce a short, friendly reply that advances onboarding.
- nlu: compress the last user answer into a single clean one-liner JSON {field, value, confidence}. Keep it factual, concise, safe for DB.
- roadmap: synthesize milestones from 'answers' and 'answer_style', returning JSON {reply, milestones:[{name,duration_days,status,description}]}.
Always return short, actionable content. Avoid long essays in chat mode.`
      },
      {
        role: 'user',
        content: mode === 'roadmap'
          ? JSON.stringify({ mode, answer_style: answerStyle, answers })
          : mode === 'nlu'
            ? JSON.stringify({ mode, answer_style: answerStyle, text: prompt })
            : prompt
      }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        max_completion_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', errorData);
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '';
    let payload: any = { success: true, reply: raw, mode };
    try {
      if (mode === 'nlu' || mode === 'roadmap') {
        const maybeJson = raw.trim().startsWith('{') ? raw : raw.slice(raw.indexOf('{'));
        const parsed = JSON.parse(maybeJson);
        payload = { success: true, mode, ...parsed, reply: parsed.reply || raw };
      }
    } catch (_) {
      // fall back to text reply
    }
    const generatedText = payload.reply || raw;
    console.log('OpenAI response received');

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-generate function:', error);
    
    return new Response(JSON.stringify({ 
      success: false,
      error: (error as Error)?.message || 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});