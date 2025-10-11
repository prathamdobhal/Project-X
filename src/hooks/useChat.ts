import { useState, useEffect } from 'react'
import { supabase, ChatSession, ChatMessage, ChartData } from '../lib/supabase'

export function useChat() {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [messageCharts, setMessageCharts] = useState<{[messageId: string]: ChartData}>({})

  useEffect(() => {
    loadSessions()
  }, [])

  useEffect(() => {
    if (currentSession) {
      loadMessages(currentSession.id)
    } else {
      setMessages([])
    }
  }, [currentSession])

  const loadSessions = async () => {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Error loading sessions:', error)
    } else {
      setSessions(data || [])
    }
  }

  const loadMessages = async (sessionId: string) => {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true })

    if (error) {
      console.error('Error loading messages:', error)
    } else {
      // Enhance messages with chart data
      const messagesWithCharts = (data || []).map(message => ({
        ...message,
        chart: messageCharts[message.id]
      }))
      setMessages(messagesWithCharts)
    }
  }

  const createNewSession = async (firstMessage?: string) => {
    const title = firstMessage
      ? firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : '')
      : 'New Chat'

    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({ title })
      .select()
      .single()

    if (error) {
      console.error('Error creating session:', error)
      return null
    }

    const newSession = data
    setSessions(prev => [newSession, ...prev])
    setCurrentSession(newSession)
    return newSession
  }

  const sendMessage = async (content: string) => {
    // Prevent sending if already loading
    if (isLoading) {
      console.log('⚠️ Message send prevented - already loading');
      return;
    }

    console.log('📤 Sending message:', content);

    if (!currentSession) {
      const session = await createNewSession(content)
      if (!session) return
    }

    setIsLoading(true)

    try {
      // Generate AI response using Edge Function
      // The Edge Function will save both user and assistant messages
      const aiResponse = await generateLangChainResponse(content, currentSession!.id)

      // Store chart data if present
      if (typeof aiResponse === 'object' && aiResponse.chart) {
        // Find the most recent assistant message and associate the chart with it
        const updatedMessages = await supabase
          .from('chat_messages')
          .select('*')
          .eq('session_id', currentSession!.id)
          .eq('role', 'assistant')
          .order('timestamp', { ascending: false })
          .limit(1)

        if (updatedMessages.data && updatedMessages.data.length > 0) {
          const messageId = updatedMessages.data[0].id

          // Update chart state FIRST
          setMessageCharts(prev => ({
            ...prev,
            [messageId]: aiResponse.chart
          }))

          // Then reload messages with the chart data
          const { data, error } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('session_id', currentSession!.id)
            .order('timestamp', { ascending: true })

          if (!error && data) {
            const messagesWithCharts = data.map(message => ({
              ...message,
              chart: message.id === messageId ? aiResponse.chart : messageCharts[message.id]
            }))
            setMessages(messagesWithCharts)
          }
        }
      } else {
        // Reload messages to get the latest ones from the Edge Function
        await loadMessages(currentSession!.id)
      }

      // Update session timestamp
      await supabase
        .from('chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', currentSession!.id)

      console.log('✅ Message sent successfully');
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const selectSession = (session: ChatSession) => {
    setCurrentSession(session)
  }

  const startNewChat = () => {
    setCurrentSession(null)
    setMessages([])
  }

  return {
    sessions,
    currentSession,
    messages,
    isLoading,
    sendMessage,
    selectSession,
    startNewChat,
    loadSessions
  }
}

// Generate AI responses using Edge Function
async function generateLangChainResponse(userMessage: string, sessionId: string): Promise<string | { text: string; chart?: any }> {
  console.log('🚀 Calling Edge Function with:', { userMessage, sessionId });
  console.log('🌐 Edge Function URL:', `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oee-chat`);

  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oee-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        message: userMessage,
        sessionId: sessionId
      })
    });

    console.log('📡 Response status:', response.status);
    console.log('📡 Response ok:', response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Response error text:', errorText);
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ Response data received:', data);

    if (data.error) {
      console.warn('⚠️ Edge Function returned error, but has response:', data.response);
      // If there's both an error and a response, use the response (it might be a graceful error handling)
      if (data.response) {
        return data.response;
      }
      throw new Error(data.error);
    }

    console.log('🎉 Returning AI response', { hasChart: !!data.chart });
    return {
      text: data.response,
      chart: data.chart
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorName = error instanceof Error ? error.name : 'Error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error('❌ Error calling Edge Function:', error);
    console.error('❌ Error details:', {
      name: errorName,
      message: errorMessage,
      stack: errorStack
    });

    // Fallback to basic response if Edge Function fails
    return {
      text: `🔧 **Debug Mode Active** - Edge Function Error Detected

**Error Details**: ${errorMessage}

**Fallback Response**: I'm experiencing technical difficulties with the advanced AI system. The Edge Function at \`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oee-chat\` is not responding properly.

**What I can still do**:
• Basic equipment data analysis
• Simple availability calculations
• Downtime summaries
• Alert tracking

**Debugging Info**:
- URL: ${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oee-chat
- Session: ${sessionId}
- Message: "${userMessage}"

Please check the browser console for detailed error logs or contact support.`,
      chart: undefined
    };
  }
}