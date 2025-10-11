import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ChatRequest {
  message: string;
  sessionId: string;
  openaiApiKey?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { message, sessionId, openaiApiKey }: ChatRequest = await req.json();
    console.log('🚀 Debug: Received request', { 
      message: message.substring(0, 50), 
      sessionId, 
      hasApiKey: !!openaiApiKey,
      apiKeyPrefix: openaiApiKey ? openaiApiKey.substring(0, 7) + '...' : 'none'
    });

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Save user message first
    const { error: userMsgError } = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        role: 'user',
        content: message,
      });

    if (userMsgError) {
      console.error('❌ Error saving user message:', userMsgError);
      throw new Error('Failed to save user message');
    }
    console.log('✅ User message saved');

    // Get API key (prioritize request parameter for testing)
    let apiKey = openaiApiKey || Deno.env.get('OPENAI_API_KEY');
    
    console.log('🔑 API Key Debug:', {
      fromRequest: !!openaiApiKey,
      fromEnv: !!Deno.env.get('OPENAI_API_KEY'),
      hasKey: !!apiKey,
      keyValid: apiKey ? apiKey.startsWith('sk-') && apiKey.length > 20 : false,
      keyLength: apiKey ? apiKey.length : 0
    });
    
    // If we have a valid OpenAI key, try AI response
    if (apiKey && apiKey.startsWith('sk-') && apiKey.length > 20) {
      try {
        console.log('🤖 Attempting AI response generation...');
        
        // Simple test first - just initialize OpenAI without LangChain
        const testResponse = await testOpenAIConnection(apiKey);
        console.log('✅ OpenAI connection test passed:', testResponse);
        
        // Now try full AI response
        const response = await generateAIResponse(message, supabase, apiKey);
        
        // Save assistant response
        await supabase
          .from('chat_messages')
          .insert({
            session_id: sessionId,
            role: 'assistant',
            content: response,
          });
        
        console.log('✅ AI response generated and saved successfully');
        
        return new Response(
          JSON.stringify({ 
            response,
            debug: { 
              mode: 'ai_powered_success',
              testPassed: true,
              apiKeySource: openaiApiKey ? 'request' : 'environment'
            }
          }),
          {
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          },
        );
        
      } catch (aiError) {
        console.error('❌ AI Error Details:', {
          name: aiError.name,
          message: aiError.message,
          stack: aiError.stack?.substring(0, 500)
        });
        
        // Return detailed error for debugging
        const errorResponse = await generateErrorResponse(message, supabase, aiError);
        
        await supabase
          .from('chat_messages')
          .insert({
            session_id: sessionId,
            role: 'assistant',
            content: errorResponse,
          });
          
        return new Response(
          JSON.stringify({ 
            response: errorResponse,
            debug: { 
              mode: 'ai_error_debug',
              error: aiError.message,
              hasKey: true
            }
          }),
          {
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          },
        );
      }
    }
    
    // Fallback: No valid API key
    console.log('📊 No valid API key, using fallback...');
    const response = await generateIntelligentFallback(message, supabase, !!apiKey);
    
    await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        role: 'assistant',
        content: response,
      });
    
    return new Response(
      JSON.stringify({ 
        response,
        debug: { 
          mode: 'no_api_key_fallback',
          hasKey: !!apiKey,
          keyValid: apiKey ? apiKey.startsWith('sk-') && apiKey.length > 20 : false
        }
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );

  } catch (error) {
    console.error('❌ Function Error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Function execution error',
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

// Test OpenAI connection without LangChain
async function testOpenAIConnection(apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Say "OpenAI connection successful"' }],
      max_tokens: 10
    })
  });
  
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenAI API Error: ${response.status} - ${errorData}`);
  }
  
  const data = await response.json();
  return data.choices[0]?.message?.content || 'Connection successful';
}

// Generate AI response using LangChain
async function generateAIResponse(message: string, supabase: any, apiKey: string): Promise<string> {
  try {
    console.log('📦 Loading LangChain modules...');
    
    // Import modules with specific versions
    const [{ ChatOpenAI }, { PromptTemplate }, { RunnableSequence }, { StringOutputParser }] = await Promise.all([
      import("npm:@langchain/openai@0.6.14"),
      import("npm:langchain@0.3.35/prompts"),
      import("npm:@langchain/core@0.3.19/runnables"),
      import("npm:@langchain/core@0.3.19/output_parsers")
    ]);
    
    console.log('✅ LangChain modules loaded');
    
    // Get equipment data for context
    const { data: equipmentData, error: dbError } = await supabase
      .from('equipment_status_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
      
    if (dbError) {
      console.error('❌ Database error:', dbError);
    }
    console.log(`📊 Retrieved ${equipmentData?.length || 0} equipment records`);
      
    const equipmentSummary = equipmentData && equipmentData.length > 0 ? 
      `Recent Equipment Status (${equipmentData.length} records):\n${equipmentData.slice(0, 10).map((log: any) => 
        `- ${log.equipment_name}: ${log.status} on ${log.date} (${log.duration_minutes}min${log.reason ? `, Reason: ${log.reason}` : ''})`
      ).join('\n')}` : 'No equipment data available';
    
    console.log('🤖 Initializing OpenAI with LangChain...');
    
    // Initialize OpenAI with more conservative settings
    const llm = new ChatOpenAI({
      openAIApiKey: apiKey,
      modelName: "gpt-4o-mini",
      temperature: 0.2,
      maxTokens: 800,
      timeout: 30000, // 30 second timeout
    });
    
    const promptTemplate = PromptTemplate.fromTemplate(`
You are an expert OEE Manufacturing Copilot. Analyze this manufacturing question and provide actionable insights.

Equipment Data:
{equipmentSummary}

User Question: {question}

Provide a concise manufacturing analysis with:
1. Key insights from the data
2. Specific recommendations
3. Next steps

Response:
`);
    
    console.log('⛓️ Creating LangChain chain...');
    const chain = RunnableSequence.from([
      promptTemplate,
      llm,
      new StringOutputParser(),
    ]);
    
    console.log('🚀 Invoking AI chain...');
    const result = await chain.invoke({
      question: message,
      equipmentSummary: equipmentSummary.substring(0, 1000), // Limit context size
    });
    
    console.log('✅ AI response generated successfully');
    return `🤖 **AI-Powered OEE Analysis**\n\n${result}`;
    
  } catch (error) {
    console.error('❌ LangChain Error Details:', {
      name: error.name,
      message: error.message,
      cause: error.cause
    });
    throw error;
  }
}

// Generate error response with debugging info
async function generateErrorResponse(message: string, supabase: any, error: any): Promise<string> {
  return `🔧 **AI Integration Debug Mode**

❌ **Error Details:**
• **Type**: ${error.name || 'Unknown'}
• **Message**: ${error.message || 'No message'}
• **Likely Cause**: ${error.message?.includes('API key') ? 'Invalid API key' : error.message?.includes('timeout') ? 'Request timeout' : error.message?.includes('rate') ? 'Rate limit exceeded' : 'Integration issue'}

🔍 **Troubleshooting Steps:**
1. **Verify API Key**: Ensure it starts with 'sk-' and is valid
2. **Check OpenAI Account**: Verify you have credits/usage available
3. **Network Issues**: Check if OpenAI API is accessible
4. **Rate Limits**: Wait a moment and try again

📊 **Current Capabilities (Fallback Mode):**
• Equipment data analysis
• Basic OEE calculations
• Performance summaries
• Downtime analysis

💡 **Your Question**: "${message}"
**Status**: Processing in analytics mode while debugging AI integration...`;
}

// Fallback response without AI
async function generateIntelligentFallback(message: string, supabase: any, keyExists: boolean): Promise<string> {
  const { data: equipmentData } = await supabase
    .from('equipment_status_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
    
  if (!equipmentData || equipmentData.length === 0) {
    return `📊 **OEE Manufacturing Assistant**

⚠️ **Status**: ${keyExists ? 'API key detected but integration issues' : 'No API key configured'}

**Current Situation:**
• ${keyExists ? 'OpenAI integration encountering technical issues' : 'OPENAI_API_KEY not configured'}
• No equipment data available for analysis

**To Enable Full AI Features:**
1. Use the "Configure OpenAI API Key" button on the main screen
2. Import your manufacturing data via Data Import
3. Try your question again

**What I can help with now:**
• Basic manufacturing guidance
• OEE calculation formulas
• Industry best practices
• Equipment analysis (once data is imported)`;
  }
  
  // Provide basic analytics
  const uniqueEquipment = [...new Set(equipmentData.map((log: any) => log.equipment_name))];
  const downLogs = equipmentData.filter((log: any) => log.status?.toLowerCase() === 'down');
  const runningLogs = equipmentData.filter((log: any) => log.status?.toLowerCase() === 'running');
  const totalDowntime = downLogs.reduce((sum: number, log: any) => sum + (log.duration_minutes || 0), 0);
  const totalRuntime = runningLogs.reduce((sum: number, log: any) => sum + (log.duration_minutes || 0), 0);
  const availability = totalRuntime + totalDowntime > 0 ? (totalRuntime / (totalRuntime + totalDowntime) * 100) : 0;
  
  return `📊 **Manufacturing Analytics Dashboard**

🎯 **Current Mode**: Advanced Data Analytics
🚀 **AI Status**: ${keyExists ? '🔑 Key detected - troubleshooting integration' : '🔑 Configure API key to enable AI'}

## 📈 System Performance:
• **Equipment Count**: ${uniqueEquipment.length} machines
• **System Availability**: ${availability.toFixed(1)}% ${availability >= 85 ? '✅ Excellent' : availability >= 70 ? '⚠️ Needs Improvement' : '🔴 Critical'}
• **Active Data Records**: ${equipmentData.length} logs
• **Recent Downtime Events**: ${downLogs.length} incidents (${totalDowntime} min total)

## 🔧 Equipment Status:
${uniqueEquipment.slice(0, 5).map(name => {
  const equipLogs = equipmentData.filter((log: any) => log.equipment_name === name);
  const equipDowntime = equipLogs.filter((log: any) => log.status?.toLowerCase() === 'down')
    .reduce((sum: number, log: any) => sum + (log.duration_minutes || 0), 0);
  return `• **${name}**: ${equipDowntime > 0 ? `${equipDowntime}min downtime` : 'Running well'}`;
}).join('\n')}

## 💡 Available Analysis:
• "Calculate OEE for [equipment name]"
• "Show downtime patterns"
• "Which equipment needs attention?"
• "Compare equipment performance"

${keyExists ? '🔧 **Debugging AI integration** - try asking a question to see detailed error info' : '🚀 **Enable AI Features** using the button on the main screen'}`;
}
