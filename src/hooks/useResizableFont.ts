import { useEffect, useState } from 'react'
export default function useResizableFont() {
  const [scale, setScale] = useState<number>(() => {
    const s = localStorage.getItem('font-scale')
    return s ? Number(s) : 1
  })
  useEffect(() => {
    document.documentElement.style.setProperty('--app-font-scale', String(scale))
    localStorage.setItem('font-scale', String(scale))
  }, [scale])
  return {
    scale,
    increase: () => setScale(s => Math.min(1.6, Number((s + 0.1).toFixed(2)))),
    decrease: () => setScale(s => Math.max(0.8, Number((s - 0.1).toFixed(2)))),
    reset: () => setScale(1),
  }
}

