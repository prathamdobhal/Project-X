import { useState } from 'react'
import { Send } from 'lucide-react'

interface ChatInputProps {
  onSendMessage: (message: string) => void
  isLoading: boolean
  onSuggestedPrompt: (prompt: string) => void
}

const SUGGESTED_PROMPTS = [
  "Show me a chart of equipment availability",
  "Plot downtime trends over time",
  "Create a Pareto chart of failure reasons",
  "Visualize equipment performance comparison",
  "Show me performance trends for Machine A vs Machine B",
  "What caused the longest downtime incident?",
  "Generate an OEE summary report with charts",
  "Chart the top downtime causes"
]

export function ChatInput({ onSendMessage, isLoading, onSuggestedPrompt }: ChatInputProps) {
  const [message, setMessage] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() && !isLoading) {
      onSendMessage(message.trim())
      setMessage('')
      setShowSuggestions(false)
    }
  }

  const handleSuggestedPrompt = (prompt: string) => {
    onSuggestedPrompt(prompt)
    setShowSuggestions(false)
  }

  return (
    <div className="border-t bg-white p-4">
      {showSuggestions && (
        <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: '#E8F2FF' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium" style={{ color: '#1955AE' }}>Suggested prompts:</span>
          </div>
          <div className="space-y-1">
            {SUGGESTED_PROMPTS.map((prompt, index) => (
              <button
                key={index}
                onClick={() => handleSuggestedPrompt(prompt)}
                disabled={isLoading}
                className="block w-full text-left px-2 py-1 text-sm rounded transition-colors text-blue-800 hover:bg-blue-100 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <button
          type="button"
          onClick={() => setShowSuggestions(!showSuggestions)}
          className={`p-2 rounded-lg transition-all duration-200 active:scale-95 ${
            showSuggestions
              ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
          title="Show suggested prompts"
        >
          <span className="text-xs font-semibold">?</span>
        </button>

        <div className="flex-1 relative">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask about OEE metrics, equipment performance, or get insights..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors disabled:opacity-50"
            disabled={isLoading}
          />
        </div>

        <button
          type="submit"
          disabled={!message.trim() || isLoading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 active:scale-95"
        >
          <Send className="w-4 h-4" />
          Send
        </button>
      </form>
    </div>
  )
}