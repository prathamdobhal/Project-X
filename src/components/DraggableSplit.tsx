import React, { useEffect, useRef, useState } from 'react'

type Props = { left: React.ReactNode; right: React.ReactNode; initialLeftPct?: number }

export default function DraggableSplit({ left, right, initialLeftPct = 58 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [leftPct, setLeftPct] = useState<number>(() => {
    const saved = localStorage.getItem('split-left-pct')
    return saved ? Number(saved) : initialLeftPct
  })
  const dragging = useRef(false)

  useEffect(() => { localStorage.setItem('split-left-pct', String(leftPct)) }, [leftPct])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      let pct = (x / rect.width) * 100
      pct = Math.max(25, Math.min(75, pct))
      setLeftPct(pct)
    }
    const stop = () => (dragging.current = false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', stop)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', stop) }
  }, [])

  return (
    <div ref={containerRef} className="split">
      <div className="pane" style={{ width: `calc(${leftPct}% - 6px)` }}>{left}</div>
      <div className="handle" onMouseDown={() => (dragging.current = true)} role="separator" />
      <div className="pane" style={{ width: `calc(${100 - leftPct}% - 6px)` }}>{right}</div>
    </div>
  )
}
