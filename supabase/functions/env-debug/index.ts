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
    // Get all environment variables
    const allEnvVars = Deno.env.toObject();
    const envKeys = Object.keys(allEnvVars).sort();
    
    // Check for OpenAI related keys
    const openaiKeys = envKeys.filter(key => 
      key.toLowerCase().includes('openai') || 
      key.toLowerCase().includes('api_key') ||
      key.toLowerCase().includes('key')
    );
    
    // Check standard keys
    const standardKeys = {
      'OPENAI_API_KEY': Deno.env.get('OPENAI_API_KEY'),
      'OPENAI_KEY': Deno.env.get('OPENAI_KEY'), 
      'API_KEY': Deno.env.get('API_KEY'),
      'SUPABASE_URL': Deno.env.get('SUPABASE_URL'),
      'SUPABASE_SERVICE_ROLE_KEY': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      'SUPABASE_ANON_KEY': Deno.env.get('SUPABASE_ANON_KEY')
    };
    
    const result = {
      total_env_vars: envKeys.length,
      all_keys: envKeys,
      openai_related_keys: openaiKeys,
      standard_keys: Object.fromEntries(
        Object.entries(standardKeys).map(([key, value]) => [
          key, 
          value ? `${value.substring(0, 8)}...` : 'NOT_SET'
        ])
      ),
      has_openai_key: !!Deno.env.get('OPENAI_API_KEY'),
      timestamp: new Date().toISOString()
    };
    
    console.log('Environment debug result:', result);
    
    return new Response(
      JSON.stringify(result, null, 2),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );

  } catch (error) {
    console.error('Error in env debug function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to check environment',
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
