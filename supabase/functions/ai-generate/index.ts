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
    
    // Handle different modes
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

      const styleInstruction = getStyleInstruction(answerStyle);
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
    
    // Handle NLU mode (normalize user input)
    if (mode === 'nlu') {
      const nluPrompt = `Extract structured data from this user response: "${prompt}"

Based on context, determine which field they're answering and extract a clean value:
- idea: app concept in one line
- name: app name or "auto-generate" if they want one created
- audience: target user type
- features: comma-separated list of 2-3 features
- privacy: exactly "Private", "Share via link", or "Public"
- auth: exactly "Google OAuth", "Magic email link", or "None (dev only)"
- deep_work_hours: exactly "0.5", "1", "2", or "4+"

Return JSON: {"field": "idea", "value": "AI photo restoration app", "confidence": 0.9, "reply": "Got it: AI photo restoration app"}`;

      const messages = [
        { role: 'system', content: 'You extract structured data from conversational input. Always return valid JSON.' },
        { role: 'user', content: nluPrompt }
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
          max_completion_tokens: 200,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const raw = data?.choices?.[0]?.message?.content || '';
      
      try {
        const parsed = JSON.parse(raw);
        return new Response(JSON.stringify({ 
          success: true,
          mode: 'nlu',
          ...parsed
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch {
        return new Response(JSON.stringify({ 
          success: false,
          mode: 'nlu',
          reply: "Could you rephrase that more clearly?"
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    
    // Chat mode (conversational responses)
    if (!prompt) {
      throw new Error('Prompt is required');
    }

    const styleInstruction = getStyleInstruction(answerStyle);
    const messages = [
      { 
        role: 'system', 
        content: `You are Copilot's conversational assistant. Keep responses short, friendly, and helpful. ${styleInstruction}` 
      },
      { role: 'user', content: prompt }
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
    const reply = data?.choices?.[0]?.message?.content || '';

    return new Response(JSON.stringify({ 
      success: true,
      reply,
      mode: 'chat'
    }), {
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