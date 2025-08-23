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
        model: 'gpt-4.1-2025-04-14',
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
    console.log('OpenAI response received');

    const generatedText = data.choices[0].message.content;

    return new Response(JSON.stringify({ 
      reply: generatedText,
      kv: {},
      milestones: []
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-generate function:', error);
    
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});