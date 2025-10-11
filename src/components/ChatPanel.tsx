import React, { useEffect, useRef, useState } from 'react'

type Message = { role: 'user'|'assistant'; content: string }

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hi! Upload your CSV on the left. Ask me anything about your data.' }
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { listRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }) }, [messages])

  async function send() {
    const text = input.trim()
    if (!text) return
    setInput(''); setMessages(m => [...m, { role: 'user', content: text }]); setBusy(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, { role: 'user', content: text }] })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setMessages(m => [...m, { role: 'assistant', content: data.answer }])
    } catch (e: any) {
      setMessages(m => [...m, { role: 'assistant', content: 'Error: ' + e.message }])
    } finally { setBusy(false) }
  }

  return (
    <div className="gap" style={{ padding: 12, height:'100%', display:'flex', flexDirection:'column' }}>
      <div ref={listRef} className="card" style={{ flex:1, overflow:'auto' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display:'flex', justifyContent: m.role==='user'?'flex-end':'flex-start', margin:'8px 0' }}>
            <div className="card" style={{ background: m.role==='user' ? '#2563eb' : '#1a1a1a', color: m.role==='user'?'#fff':'#eee' }}>
              {m.content}
            </div>
          </div>
        ))}
      </div>
      <div className="row">
        <input className="input" style={{ flex:1 }} placeholder="Ask about the dataset…" value={input}
               onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
        <button className="btn" onClick={send} disabled={busy}>{busy ? '...' : 'Send'}</button>
      </div>
    </div>
  )
}
