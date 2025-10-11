import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // Check all relevant environment variables
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    const envStatus = {
      openai_key_exists: !!openaiKey,
      openai_key_length: openaiKey ? openaiKey.length : 0,
      openai_key_prefix: openaiKey ? openaiKey.substring(0, 7) + '...' : 'NOT_SET',
      supabase_url_exists: !!supabaseUrl,
      supabase_service_key_exists: !!supabaseServiceKey,
      all_env_vars: Object.keys(Deno.env.toObject()).sort()
    };

    console.log('Environment check:', envStatus);

    return new Response(
      JSON.stringify({
        status: 'Environment check complete',
        environment: envStatus,
        message: openaiKey ? 'OpenAI key is configured' : 'OpenAI key is NOT configured'
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );

  } catch (error) {
    console.error('Error in test function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Test failed',
        details: error.message 
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  }
});
