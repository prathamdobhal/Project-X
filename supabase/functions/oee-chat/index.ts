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
}

interface ChartData {
  type: 'bar' | 'line' | 'pie' | 'doughnut' | 'pareto';
  title: string;
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
    fill?: boolean;
  }[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { message, sessionId }: ChatRequest = await req.json();
    console.log('OEE Chat request:', { message, sessionId });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get conversation history
    const { data: conversationHistory } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true })
      .limit(10);

    // Save user message
    await supabase.from('chat_messages').insert({
      session_id: sessionId,
      role: 'user',
      content: message,
    });

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    const isChartRequest = detectChartRequest(message);

    // Generate response
    const response = await generateResponse(message, conversationHistory || [], supabase, apiKey, isChartRequest);

    // Save assistant response
    await supabase.from('chat_messages').insert({
      session_id: sessionId,
      role: 'assistant',
      content: response.text,
    });

    return new Response(
      JSON.stringify({
        response: response.text,
        chart: response.chart
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );

  } catch (error) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({
        error: 'Function execution failed',
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

function detectChartRequest(message: string): boolean {
  const chartKeywords = ['chart', 'graph', 'plot', 'visualize', 'show', 'display', 'pareto'];
  return chartKeywords.some(keyword => message.toLowerCase().includes(keyword));
}

// Main response generation
async function generateResponse(
  message: string,
  conversationHistory: any[],
  supabase: any,
  apiKey?: string,
  shouldGenerateChart: boolean = false
): Promise<{text: string, chart?: ChartData}> {

  // Fetch ALL equipment data - using range to get unlimited records
  const { data: equipmentData, error: dataError, count } = await supabase
    .from('equipment_status_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false})
    .range(0, 10000); // Fetch up to 10000 records

  console.log('Data fetch result [v4-with-range]:', {
    recordCount: equipmentData?.length || 0,
    totalCount: count,
    hasError: !!dataError,
    error: dataError,
    query: 'Using .range(0, 10000)',
    deployedAt: new Date().toISOString()
  });

  if (dataError) {
    console.error('Database error:', dataError);
    return {
      text: `**Database Error**\\n\\nFailed to retrieve equipment data. Error: ${dataError.message}`
    };
  }

  if (!equipmentData || equipmentData.length === 0) {
    return {
      text: `**No Equipment Data Available**\\n\\nPlease import your manufacturing data using the Data Import feature.`
    };
  }

  // Analyze current message topic
  const lowerMessage = message.toLowerCase();
  let topic = 'general';

  if (lowerMessage.includes('pareto') || lowerMessage.includes('cause') || lowerMessage.includes('reason')) {
    topic = 'pareto';
  } else if (lowerMessage.includes('availability') || lowerMessage.includes('uptime')) {
    topic = 'availability';
  } else if (lowerMessage.includes('downtime')) {
    topic = 'downtime';
  } else if (lowerMessage.includes('record') || lowerMessage.includes('data') || lowerMessage.includes('count') || lowerMessage.includes('how many')) {
    topic = 'data_query';
  }

  // Generate chart if requested
  let chart: ChartData | undefined;
  if (shouldGenerateChart) {
    chart = generateChart(message, equipmentData, topic);
  }

  // Handle different query types
  if (topic === 'data_query') {
    return handleDataQuery(message, equipmentData);
  }

  // Perform analysis
  const analysis = analyzeEquipmentData(equipmentData);

  // Generate response based on topic
  let responseText = '';

  if (topic === 'pareto') {
    responseText = generateParetoResponse(analysis);
  } else if (topic === 'availability') {
    responseText = generateAvailabilityResponse(analysis);
  } else if (topic === 'downtime') {
    responseText = generateDowntimeResponse(analysis);
  } else {
    responseText = generateGeneralResponse(analysis);
  }

  if (chart) {
    responseText += '\\n\\n**Chart**: Visual analysis displayed above.';
  }

  return { text: responseText, chart };
}

// Analyze all equipment data
function analyzeEquipmentData(equipmentData: any[]) {
  const uniqueEquipment = [...new Set(equipmentData.map(log => log.equipment_name))];
  const uniqueDates = [...new Set(equipmentData.map(log => log.date))].sort();

  const downLogs = equipmentData.filter(log =>
    log.status?.toLowerCase() === 'down' || log.status?.toLowerCase() === 'inactive'
  );
  const runningLogs = equipmentData.filter(log =>
    log.status?.toLowerCase() === 'running' || log.status?.toLowerCase() === 'active'
  );

  const totalDowntime = downLogs.reduce((sum, log) => sum + (log.duration_minutes || 0), 0);
  const totalRuntime = runningLogs.reduce((sum, log) => sum + (log.duration_minutes || 0), 0);
  const availability = totalRuntime + totalDowntime > 0 ? (totalRuntime / (totalRuntime + totalDowntime) * 100) : 0;

  // Equipment-specific analysis
  const equipmentAnalysis = uniqueEquipment.map(name => {
    const equipLogs = equipmentData.filter(log => log.equipment_name === name);
    const equipDowntime = equipLogs.filter(log =>
      log.status?.toLowerCase() === 'down' || log.status?.toLowerCase() === 'inactive'
    ).reduce((sum, log) => sum + (log.duration_minutes || 0), 0);
    const equipRuntime = equipLogs.filter(log =>
      log.status?.toLowerCase() === 'running' || log.status?.toLowerCase() === 'active'
    ).reduce((sum, log) => sum + (log.duration_minutes || 0), 0);
    const equipAvailability = equipRuntime + equipDowntime > 0 ? (equipRuntime / (equipRuntime + equipDowntime) * 100) : 0;

    return { name, availability: equipAvailability, downtime: equipDowntime, runtime: equipRuntime };
  }).sort((a, b) => a.availability - b.availability);

  // Failure reasons analysis
  const failureReasons: { [key: string]: number } = {};
  downLogs.forEach(log => {
    if (log.reason && log.reason !== '-' && log.reason.trim() !== '') {
      failureReasons[log.reason] = (failureReasons[log.reason] || 0) + (log.duration_minutes || 0);
    }
  });

  const performanceStatus = availability >= 85 ? 'Excellent' : availability >= 70 ? 'Good' : 'Poor';

  return {
    totalRecords: equipmentData.length,
    uniqueEquipment,
    uniqueDates,
    downLogs,
    runningLogs,
    totalDowntime,
    totalRuntime,
    availability,
    performanceStatus,
    equipmentAnalysis,
    failureReasons
  };
}

// Handle data queries
function handleDataQuery(message: string, equipmentData: any[]): { text: string } {
  const analysis = analyzeEquipmentData(equipmentData);
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('how many record') || lowerMessage.includes('how much data')) {
    return {
      text: `**Data Summary**\\n\\n**Total Records**: ${analysis.totalRecords}\\n**Date Range**: ${analysis.uniqueDates.length} days (${analysis.uniqueDates[0]} to ${analysis.uniqueDates[analysis.uniqueDates.length - 1]})\\n**Equipment**: ${analysis.uniqueEquipment.length} machines\\n\\n**Records by Date**:\\n${analysis.uniqueDates.slice(0, 10).map(date => `• ${date}: ${equipmentData.filter(log => log.date === date).length} records`).join('\\n')}`
    };
  }

  if (lowerMessage.includes('which date') || lowerMessage.includes('what date')) {
    const dateCounts: { [key: string]: number } = {};
    equipmentData.forEach(log => {
      dateCounts[log.date] = (dateCounts[log.date] || 0) + 1;
    });

    const sortedDates = Object.entries(dateCounts).sort(([,a], [,b]) => b - a);

    return {
      text: `**Available Dates**\\n\\n**Total Dates**: ${analysis.uniqueDates.length}\\n**Date Range**: ${analysis.uniqueDates[0]} to ${analysis.uniqueDates[analysis.uniqueDates.length - 1]}\\n\\n**Records per Date**:\\n${sortedDates.slice(0, 15).map(([date, count]) => `• ${date}: ${count} records`).join('\\n')}`
    };
  }

  return {
    text: `**Data Overview**\\n\\n**Total Records**: ${analysis.totalRecords}\\n**Equipment**: ${analysis.uniqueEquipment.join(', ')}\\n**Date Range**: ${analysis.uniqueDates.length} days\\n**Latest Date**: ${analysis.uniqueDates[analysis.uniqueDates.length - 1]}\\n\\n_Function Version: v4 with range(0,10000)_`
  };
}

// Generate Pareto response
function generateParetoResponse(analysis: any): string {
  const topReason = Object.entries(analysis.failureReasons).sort(([,a], [,b]) => (b as number) - (a as number))[0];

  if (topReason) {
    return `**Pareto Analysis Results**\\n\\n**Top Issue**: ${topReason[0]} (${topReason[1]} minutes)\\n\\n**Key Findings**:\\n• ${Object.keys(analysis.failureReasons).length} failure types identified\\n• Focus on ${topReason[0]} for maximum impact\\n• Target: Reduce by 50% to improve availability\\n\\n**System Status**: ${analysis.availability.toFixed(1)}% availability (${analysis.performanceStatus})`;
  } else {
    return `**Pareto Analysis**\\n\\n**Issue**: No specific failure reasons in data\\n\\n**Data Available**: ${analysis.totalRecords} records across ${analysis.uniqueDates.length} days\\n\\n**Recommendation**: Update data collection to capture specific failure causes.`;
  }
}

// Generate Availability response
function generateAvailabilityResponse(analysis: any): string {
  return `**Equipment Availability**\\n\\n**Overall**: ${analysis.availability.toFixed(1)}% (${analysis.performanceStatus})\\n**Target**: 85% minimum\\n**Data**: ${analysis.totalRecords} records\\n\\n**Equipment Performance**:\\n${analysis.equipmentAnalysis.slice(0, 5).map((e: any) => `• ${e.name}: ${e.availability.toFixed(1)}%`).join('\\n')}\\n\\n**Priority**: ${analysis.equipmentAnalysis[0]?.name} needs attention (${analysis.equipmentAnalysis[0]?.availability.toFixed(1)}%)`;
}

// Generate Downtime response
function generateDowntimeResponse(analysis: any): string {
  return `**Downtime Analysis**\\n\\n**Total**: ${analysis.totalDowntime} minutes across ${analysis.downLogs.length} events\\n**Data**: ${analysis.totalRecords} records from ${analysis.uniqueDates.length} days\\n**Worst Performer**: ${analysis.equipmentAnalysis[0]?.name} (${analysis.equipmentAnalysis[0]?.downtime} min)\\n\\n**Impact**: ${((analysis.totalDowntime/(analysis.totalDowntime+analysis.totalRuntime))*100).toFixed(1)}% of total time\\n**Status**: ${analysis.performanceStatus} performance level`;
}

// Generate General response
function generateGeneralResponse(analysis: any): string {
  return `**System Summary**\\n\\n**Availability**: ${analysis.availability.toFixed(1)}% (${analysis.performanceStatus})\\n**Equipment**: ${analysis.uniqueEquipment.length} monitored\\n**Data**: ${analysis.totalRecords} records (${analysis.uniqueDates.length} days)\\n**Events**: ${analysis.downLogs.length} downtime incidents\\n\\n**Action Needed**: ${analysis.equipmentAnalysis[0]?.name} (${analysis.equipmentAnalysis[0]?.availability.toFixed(1)}%)`;
}

// Generate charts
function generateChart(query: string, equipmentData: any[], topic: string): ChartData | undefined {
  if (!equipmentData || equipmentData.length === 0) return undefined;

  const uniqueEquipment = [...new Set(equipmentData.map(log => log.equipment_name))];
  const lowerQuery = query.toLowerCase();

  // Pareto Chart
  if (topic === 'pareto' || lowerQuery.includes('pareto')) {
    const reasonCounts: { [key: string]: number } = {};
    equipmentData.forEach(log => {
      if ((log.status?.toLowerCase() === 'down' || log.status?.toLowerCase() === 'inactive') &&
          log.reason && log.reason !== '-' && log.reason.trim() !== '') {
        reasonCounts[log.reason] = (reasonCounts[log.reason] || 0) + 1;
      }
    });

    const labels = Object.keys(reasonCounts);
    const data = Object.values(reasonCounts);

    if (labels.length === 0) {
      return {
        type: 'bar',
        title: 'No Failure Reasons Available',
        labels: ['No Data'],
        datasets: [{ label: 'Count', data: [0], backgroundColor: ['rgba(156, 163, 175, 0.8)'] }]
      };
    }

    return {
      type: 'pareto',
      title: 'Failure Reasons (Pareto Chart)',
      labels,
      datasets: [{
        label: 'Failure Count',
        data,
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1
      }]
    };
  }

  // Availability Chart
  if (topic === 'availability' || lowerQuery.includes('availability')) {
    const availabilityData = uniqueEquipment.map(name => {
      const equipLogs = equipmentData.filter(log => log.equipment_name === name);
      const downtime = equipLogs.filter(log =>
        log.status?.toLowerCase() === 'down' || log.status?.toLowerCase() === 'inactive'
      ).reduce((sum, log) => sum + (log.duration_minutes || 0), 0);
      const runtime = equipLogs.filter(log =>
        log.status?.toLowerCase() === 'running' || log.status?.toLowerCase() === 'active'
      ).reduce((sum, log) => sum + (log.duration_minutes || 0), 0);
      return runtime + downtime > 0 ? (runtime / (runtime + downtime) * 100) : 0;
    });

    return {
      type: 'bar',
      title: 'Equipment Availability (%)',
      labels: uniqueEquipment,
      datasets: [{
        label: 'Availability %',
        data: availabilityData,
        backgroundColor: availabilityData.map(val =>
          val >= 85 ? 'rgba(34, 197, 94, 0.8)' : val >= 70 ? 'rgba(251, 191, 36, 0.8)' : 'rgba(239, 68, 68, 0.8)'
        ),
        borderColor: availabilityData.map(val =>
          val >= 85 ? 'rgba(34, 197, 94, 1)' : val >= 70 ? 'rgba(251, 191, 36, 1)' : 'rgba(239, 68, 68, 1)'
        ),
        borderWidth: 2
      }]
    };
  }

  // Downtime Chart
  if (topic === 'downtime' || lowerQuery.includes('downtime')) {
    const downtimeData = uniqueEquipment.map(name => {
      return equipmentData.filter(log =>
        log.equipment_name === name && (log.status?.toLowerCase() === 'down' || log.status?.toLowerCase() === 'inactive')
      ).reduce((sum, log) => sum + (log.duration_minutes || 0), 0);
    });

    return {
      type: 'bar',
      title: 'Downtime by Equipment (minutes)',
      labels: uniqueEquipment,
      datasets: [{
        label: 'Downtime (min)',
        data: downtimeData,
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        borderColor: 'rgba(239, 68, 68, 1)',
        borderWidth: 2
      }]
    };
  }

  return undefined;
}