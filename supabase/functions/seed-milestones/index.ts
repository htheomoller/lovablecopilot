import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the authorization header and extract the JWT token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: corsHeaders }
      )
    }

    // Verify the JWT token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      console.error('Auth error:', authError)
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: corsHeaders }
      )
    }

    console.log('Creating sample milestones for user:', user.id)

    // Create sample milestones matching the database schema
    const timestamp = Date.now()
    const sampleMilestones = [
      {
        id: `seed-setup-${timestamp}`,
        project: 'CoPilot',
        name: 'Setup & Auth',
        status: 'in_progress',
        start_date: new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
        duration_days: 5,
        owner_id: user.id
      },
      {
        id: `seed-chat-${timestamp}`,
        project: 'CoPilot', 
        name: 'Chat Onboarding',
        status: 'pending',
        start_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days from now
        duration_days: 7,
        owner_id: user.id
      }
    ]

    const { data, error } = await supabase
      .from('ledger_milestones')
      .insert(sampleMilestones)
      .select()

    if (error) {
      console.error('Database error:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: corsHeaders }
      )
    }

    console.log('Successfully created milestones:', data)

    return new Response(
      JSON.stringify({ 
        success: true, 
        milestones: data,
        message: 'Sample milestones created successfully'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})