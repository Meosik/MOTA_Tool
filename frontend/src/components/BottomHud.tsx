// frontend/src/components/BottomHud.tsx
import React, { useCallback } from 'react'
import useFrameStore from '../store/frameStore'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function BottomHud() {
  const { frames, cur, setCur, prefetchAround } = useFrameStore(s => ({
    frames: s.frames,
    cur: s.cur,
    setCur: s.setCur,
    prefetchAround: s.prefetchAround,
  }))

  const total = frames.length
  const canPrev = cur > 0
  const canNext = cur < total - 1

  const goPrev = useCallback(() => {
    if (!canPrev) return
    setCur(cur - 1)
    prefetchAround(cur - 1, 3)
  }, [canPrev, cur, setCur, prefetchAround])

  const goNext = useCallback(() => {
    if (!canNext) return
    setCur(cur + 1)
    prefetchAround(cur + 1, 3)
  }, [canNext, cur, setCur, prefetchAround])

  if (total === 0) return null

  return (
    <div
      className="pointer-events-auto fixed bottom-4 left-1/2 -translate-x-1/2
                 bg-white/90 backdrop-blur border shadow rounded-full
                 px-3 py-1.5 flex items-center gap-3"
      style={{ zIndex: 40 }}
    >
      <button
        className="p-1.5 rounded-full border hover:bg-gray-50 disabled:opacity-40"
        onClick={goPrev}
        disabled={!canPrev}
        title="이전 프레임"
      >
        <ChevronLeft size={18}/>
      </button>

      <div className="text-sm font-mono">
        Frame <span className="font-semibold">{frames[cur]?.i ?? cur+1}</span>
        {' / '}
        <span>{frames[total - 1]?.i ?? total}</span>
      </div>

      <button
        className="p-1.5 rounded-full border hover:bg-gray-50 disabled:opacity-40"
        onClick={goNext}
        disabled={!canNext}
        title="다음 프레임"
      >
        <ChevronRight size={18}/>
      </button>
    </div>
  )
}
