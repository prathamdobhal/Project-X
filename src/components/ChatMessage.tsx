import { Bot, User } from 'lucide-react'
import { ChatMessage as ChatMessageType } from '../lib/supabase'
import { Chart, ChartData } from './Chart'

interface ChatMessageProps {
  message: ChatMessageType
}

// Format markdown-like content to proper HTML
function formatContent(content: string): JSX.Element {
  const lines = content.split('\n')
  const elements: JSX.Element[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-lg font-semibold text-gray-900 mt-4 mb-2">{line.substring(4)}</h3>)
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-xl font-bold text-gray-900 mt-4 mb-2">{line.substring(3)}</h2>)
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-2xl font-bold text-gray-900 mt-4 mb-2">{line.substring(2)}</h1>)
    } else if (line.startsWith('#### ')) {
      elements.push(<h4 key={i} className="text-base font-semibold text-gray-800 mt-3 mb-2">{line.substring(5)}</h4>)
    } else if (line.startsWith('- **') && line.includes('**:')) {
      // Bullet point with bold text
      const match = line.match(/^- \*\*(.*?)\*\*: (.*)$/)
      if (match) {
        elements.push(
          <li key={i} className="ml-4 mb-1">
            <span className="font-semibold text-gray-900">{match[1]}</span>: {match[2]}
          </li>
        )
      } else {
        elements.push(<li key={i} className="ml-4 mb-1">{line.substring(2)}</li>)
      }
    } else if (line.startsWith('• **') && line.includes('**:')) {
      // Bullet point with bold text (different bullet style)
      const match = line.match(/^• \*\*(.*?)\*\*: (.*)$/)
      if (match) {
        elements.push(
          <li key={i} className="ml-4 mb-1">
            <span className="font-semibold text-gray-900">{match[1]}</span>: {match[2]}
          </li>
        )
      } else {
        elements.push(<li key={i} className="ml-4 mb-1">{line.substring(2)}</li>)
      }
    } else if (line.startsWith('- ') || line.startsWith('• ')) {
      elements.push(<li key={i} className="ml-4 mb-1">{line.substring(2)}</li>)
    } else if (line.includes('**') && line.includes('**')) {
      // Bold text inline
      const parts = line.split(/(\*\*.*?\*\*)/g)
      const formatted = parts.map((part, idx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={idx} className="font-semibold text-gray-900">{part.substring(2, part.length - 2)}</strong>
        }
        return part
      })
      elements.push(<p key={i} className="mb-2">{formatted}</p>)
    } else if (line.trim() === '') {
      elements.push(<br key={i} />)
    } else {
      elements.push(<p key={i} className="mb-2">{line}</p>)
    }
  }

  return <div>{elements}</div>
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  // Check if message contains chart data
  const parseMessageContent = (content: string) => {
    try {
      // Look for chart data markers in the message
      const chartMarker = '```chart:'
      const chartEndMarker = '```'

      if (content.includes(chartMarker)) {
        const chartStart = content.indexOf(chartMarker) + chartMarker.length
        const chartEnd = content.indexOf(chartEndMarker, chartStart)

        if (chartEnd > chartStart) {
          const chartDataStr = content.substring(chartStart, chartEnd).trim()
          const chartData = JSON.parse(chartDataStr) as ChartData
          const textBefore = content.substring(0, content.indexOf(chartMarker)).trim()
          const textAfter = content.substring(chartEnd + chartEndMarker.length).trim()

          return {
            hasChart: true,
            chartData,
            textBefore,
            textAfter
          }
        }
      }
    } catch (error) {
      console.warn('Failed to parse chart data:', error)
    }

    return {
      hasChart: false,
      text: content
    }
  }

  const parsedContent = parseMessageContent(message.content)
  const hasDirectChart = message.chart && !isUser // Only assistant messages can have charts

  return (
    <div className={`flex gap-4 p-4 ${isUser ? 'bg-gray-50' : 'bg-white'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        isUser ? 'bg-blue-600' : 'bg-gray-700'
      }`}>
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-white" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 mb-1">
          {isUser ? 'You' : 'OEE Assistant'}
        </div>

        {hasDirectChart ? (
          <div className="space-y-4">
            <div className="text-gray-700 prose prose-sm max-w-none">
              {formatContent(message.content)}
            </div>
            <Chart chartData={message.chart!} />
          </div>
        ) : parsedContent.hasChart ? (
          <div className="space-y-4">
            {parsedContent.textBefore && (
              <div className="text-gray-700 prose prose-sm max-w-none">
                {formatContent(parsedContent.textBefore)}
              </div>
            )}

            <Chart chartData={parsedContent.chartData!} />

            {parsedContent.textAfter && (
              <div className="text-gray-700 prose prose-sm max-w-none">
                {formatContent(parsedContent.textAfter)}
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-700 prose prose-sm max-w-none">
            {formatContent(parsedContent.text || message.content)}
          </div>
        )}

        <div className="text-xs text-gray-500 mt-2">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}