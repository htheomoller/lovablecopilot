import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { prompt, state } = await req.json();
    if (!prompt) {
      throw new Error('Prompt is required');
    }

    console.log('Generating text for prompt:', prompt);

    // Create style instruction based on answer_style
    let styleInstruction = '';
    if (state?.answer_style) {
      switch (state.answer_style) {
        case 'eli5':
          styleInstruction = 'Explain very simply, with analogies, like I\'m 5.';
          break;
        case 'intermediate':
          styleInstruction = 'Explain practically, for a non-technical founder with some no-code experience.';
          break;
        case 'developer':
          styleInstruction = 'Explain technically, with precise code details, as if to a developer.';
          break;
      }
    }

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