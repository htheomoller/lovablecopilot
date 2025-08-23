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

    const { prompt, state, mode, answer_style, answers } = await req.json();
    
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
        content: 'You are a helpful assistant that generates high-quality content based on user prompts. Be creative and detailed in your responses.' 
      }
    ];

    // Add style instruction if provided
    if (styleInstruction) {
      messages.push({ role: 'system', content: styleInstruction });
    }

    // Add user prompt
    messages.push({ role: 'user', content: prompt });

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
    // Normalize message content across models
    const reply = data?.choices?.[0]?.message?.content || data?.generatedText || '';
    console.log('OpenAI response received');

    return new Response(JSON.stringify({ 
      success: true,
      reply,
      generatedText: reply,  // backward‑compat for current UI
      model: 'gpt-4o-mini'
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