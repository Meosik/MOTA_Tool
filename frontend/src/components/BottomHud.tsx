// frontend/src/components/BottomHud.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react'
import useFrameStore from '../store/frameStore'
import { ChevronLeft, ChevronRight, Play, Pause } from 'lucide-react'

const FPS_OPTIONS = [5, 10, 12, 15, 24, 30, 60]

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

  // 재생 상태 & FPS
  const [isPlaying, setIsPlaying] = useState(false)
  const [fps, setFps] = useState<number>(12) // 기본 12fps
  const timerRef = useRef<number | null>(null)
  const curRef = useRef(cur)

  // 최신 cur 동기화(타이머 콜백 stale 방지)
  useEffect(() => { curRef.current = cur }, [cur])

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  // 언마운트 시 정리
  useEffect(() => () => clearTimer(), [])

  const goPrev = useCallback(() => {
    if (!canPrev) return
    const next = cur - 1
    setCur(next)
    prefetchAround(next, 3)
  }, [canPrev, cur, setCur, prefetchAround])

  const goNext = useCallback(() => {
    if (!canNext) return
    const next = cur + 1
    setCur(next)
    prefetchAround(next, 3)
  }, [canNext, cur, setCur, prefetchAround])

  const startPlayWithFps = useCallback((targetFps: number) => {
    const clamped = Math.min(60, Math.max(1, Math.round(targetFps || 12)))
    clearTimer()
    const interval = Math.round(1000 / clamped)
    timerRef.current = window.setInterval(() => {
      const idx = curRef.current
      if (idx >= total - 1) {
        // 마지막 프레임이면 정지
        clearTimer()
        setIsPlaying(false)
        return
      }
      const next = idx + 1
      setCur(next)
      prefetchAround(next, 3)
    }, interval)
    setIsPlaying(true)
  }, [prefetchAround, setCur, total])

  const togglePlay = () => {
    if (isPlaying) {
      // 일시정지
      clearTimer()
      setIsPlaying(false)
      return
    }
    // 현재 선택된 fps로 재생 시작
    startPlayWithFps(fps)
  }

  // 재생 중 FPS 드롭다운 변경 시 즉시 반영
  useEffect(() => {
    if (isPlaying) {
      startPlayWithFps(fps)
    }
  }, [fps, isPlaying, startPlayWithFps])

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
        disabled={!canPrev || isPlaying}
        title="이전 프레임"
      >
        <ChevronLeft size={18}/>
      </button>

      <button
        className="p-1.5 rounded-full border hover:bg-gray-50"
        onClick={togglePlay}
        title={isPlaying ? '일시정지' : '재생'}
      >
        {isPlaying ? <Pause size={18}/> : <Play size={18}/>}
      </button>

      {/* FPS 드롭다운 */}
      <label className="flex items-center gap-1 text-xs text-gray-600">
        FPS
        <select
          className="text-sm border rounded px-2 py-1 bg-white focus:outline-none focus:ring"
          value={fps}
          onChange={(e)=> setFps(Number(e.target.value))}
          disabled={false}
        >
          {FPS_OPTIONS.map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </label>

      <div className="text-sm font-mono">
        Frame <span className="font-semibold">{frames[cur]?.i ?? cur+1}</span>
        {' / '}
        <span>{frames[total - 1]?.i ?? total}</span>
        <span className="ml-2 text-gray-500">({fps} fps)</span>
      </div>

      <button
        className="p-1.5 rounded-full border hover:bg-gray-50 disabled:opacity-40"
        onClick={goNext}
        disabled={!canNext || isPlaying}
        title="다음 프레임"
      >
        <ChevronRight size={18}/>
      </button>
    </div>
  )
}
