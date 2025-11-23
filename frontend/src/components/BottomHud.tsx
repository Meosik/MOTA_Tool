// frontend/src/components/BottomHud.tsx
import React, { useCallback, useState, useEffect, useRef } from 'react'
import useFrameStore from '../store/frameStore'
import { ChevronLeft, ChevronRight, Play, Pause, Loader2 } from 'lucide-react'

export default function BottomHud() {
  const { frames, cur, setCur, prefetchAround, isPlaying, setPlaying, gtAnnotationId, predAnnotationId, getImage, preloadAllBoxes } = useFrameStore(s => ({
    frames: s.frames,
    cur: s.cur,
    setCur: s.setCur,
    prefetchAround: s.prefetchAround,
    isPlaying: s.isPlaying,
    setPlaying: s.setPlaying,
    gtAnnotationId: s.gtAnnotationId,
    predAnnotationId: s.predAnnotationId,
    getImage: s.getImage,
    preloadAllBoxes: s.preloadAllBoxes,
  }))

  const [fps, setFps] = useState(30)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [isPreloading, setIsPreloading] = useState(false)
  const [preloadProgress, setPreloadProgress] = useState(0)
  const playIntervalRef = useRef<number | null>(null)
  const lastFrameTimeRef = useRef<number>(0)

  const total = frames.length
  const canPrev = cur > 0
  const canNext = cur < total - 1
  const currentFrameNum = frames[cur]?.i ?? cur+1

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

  const startEdit = useCallback(() => {
    if (isPlaying) return
    setIsEditing(true)
    setEditValue(String(currentFrameNum))
  }, [isPlaying, currentFrameNum])

  const cancelEdit = useCallback(() => {
    setIsEditing(false)
    setEditValue('')
  }, [])

  const applyEdit = useCallback(() => {
    const frameNum = parseInt(editValue)
    if (isNaN(frameNum)) {
      cancelEdit()
      return
    }
    
    // Find frame index by frame number
    const targetIndex = frames.findIndex(f => f.i === frameNum)
    if (targetIndex >= 0) {
      setCur(targetIndex)
      prefetchAround(targetIndex, 3)
    }
    cancelEdit()
  }, [editValue, frames, setCur, prefetchAround, cancelEdit])

  const preloadFrames = useCallback(async () => {
    if (isPlaying || frames.length === 0) return

    setIsPreloading(true)
    setPreloadProgress(0)

    try {
      const startIndex = cur
      const endIndex = Math.min(frames.length - 1, cur + 60) // Preload next 60 frames (2 seconds at 30fps)
      const totalToPreload = endIndex - startIndex + 1

      // 1) 박스 전체 선로딩 (GT / Pred) - 한 번만 호출
      //    큰 파일일 경우 초기 지연 발생 가능, 필요시 UI 옵션으로 전환 가능
      await preloadAllBoxes().catch(()=>{})

      // Preload images AND boxes
      for (let i = startIndex; i <= endIndex; i++) {
        const frame = frames[i]
        if (frame?.url) {
          try {
            // Preload image
            const img = await getImage(frame.url)
            // Force decode
            if ('decode' in img) {
              await img.decode()
            }
          } catch (e) {
            // Skip failed images
          }
        }
        setPreloadProgress(((i - startIndex + 1) / totalToPreload) * 100)
      }

      // Small delay to show 100% completion
      await new Promise(resolve => setTimeout(resolve, 100))
      
      setIsPreloading(false)
      setPlaying(true)
    } catch (error) {
      setIsPreloading(false)
      console.error('Preload error:', error)
    }
  }, [isPlaying, frames, cur, getImage, setPlaying, preloadAllBoxes])

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      setPlaying(false)
    } else {
      // Start preloading before playback
      preloadFrames()
    }
  }, [isPlaying, setPlaying, preloadFrames])

  // Efficient playback using requestAnimationFrame
  useEffect(() => {
    if (!isPlaying) {
      if (playIntervalRef.current !== null) {
        cancelAnimationFrame(playIntervalRef.current)
        playIntervalRef.current = null
      }
      return
    }

    const frameDelay = 1000 / fps
    lastFrameTimeRef.current = performance.now()

    const playFrame = (currentTime: number) => {
      if (!useFrameStore.getState().isPlaying) {
        playIntervalRef.current = null
        return
      }

      const elapsed = currentTime - lastFrameTimeRef.current

      if (elapsed >= frameDelay) {
        const state = useFrameStore.getState()
        const nextIndex = state.cur + 1

        if (nextIndex >= state.frames.length) {
          // End of sequence - stop playing
          state.setPlaying(false)
          playIntervalRef.current = null
          return
        }

        state.setCur(nextIndex)
        state.prefetchAround(nextIndex, 5) // Larger prefetch during playback
        lastFrameTimeRef.current = currentTime - (elapsed % frameDelay)
      }

      playIntervalRef.current = requestAnimationFrame(playFrame)
    }

    playIntervalRef.current = requestAnimationFrame(playFrame)

    return () => {
      if (playIntervalRef.current !== null) {
        cancelAnimationFrame(playIntervalRef.current)
        playIntervalRef.current = null
      }
    }
  }, [isPlaying, fps])

  if (total === 0) return null

  return (
    <>
      {/* Preloading Modal */}
      {isPreloading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center" style={{ zIndex: 9999 }}>
          <div className="bg-white rounded-lg shadow-xl p-6 min-w-[300px]">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="animate-spin" size={24} />
              <h3 className="text-lg font-semibold">프레임 로딩 중...</h3>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div 
                className="bg-blue-500 h-full transition-all duration-300 ease-out"
                style={{ width: `${preloadProgress}%` }}
              />
            </div>
            <p className="text-sm text-gray-600 mt-2 text-center">
              {Math.round(preloadProgress)}%
            </p>
          </div>
        </div>
      )}

      {/* Bottom HUD */}
      <div
        className="pointer-events-auto fixed bottom-4 left-1/2 -translate-x-1/2
                   bg-white/90 backdrop-blur border shadow rounded-lg
                   px-4 py-2 flex items-center gap-3"
        style={{ zIndex: 40 }}
      >
      {/* Previous button */}
      <button
        className="p-1.5 rounded-full border hover:bg-gray-50 disabled:opacity-40"
        onClick={goPrev}
        disabled={!canPrev || isPlaying}
        title="이전 프레임"
      >
        <ChevronLeft size={18}/>
      </button>

      {/* Frame display/input (merged) */}
      <div className="text-sm font-mono flex items-center gap-1">
        <span className="text-gray-600">Frame</span>
        {isEditing ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyEdit()
              if (e.key === 'Escape') cancelEdit()
            }}
            onBlur={applyEdit}
            autoFocus
            className="w-16 font-semibold border border-blue-500 rounded px-1 py-0.5 text-center"
          />
        ) : (
          <span
            onClick={startEdit}
            className="font-semibold cursor-text hover:bg-gray-100 rounded px-1 py-0.5"
            title="클릭하여 이동"
          >
            {currentFrameNum}
          </span>
        )}
        <span className="text-gray-600">/</span>
        <span>{frames[total - 1]?.i ?? total}</span>
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-gray-300"/>

      {/* FPS selector */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-600">FPS:</span>
        <select
          value={fps}
          onChange={(e) => setFps(parseInt(e.target.value))}
          disabled={isPlaying}
          className="text-sm border rounded px-1.5 py-0.5 bg-white hover:bg-gray-50 disabled:opacity-40"
        >
          <option value="10">10</option>
          <option value="15">15</option>
          <option value="24">24</option>
          <option value="30">30</option>
          <option value="60">60</option>
        </select>
      </div>

      {/* Play/Pause button */}
      <button
        className="p-1.5 rounded-full border hover:bg-gray-50 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={togglePlay}
        disabled={isPreloading}
        title={isPlaying ? '일시정지' : (isPreloading ? '로딩 중...' : '재생')}
      >
        {isPreloading ? <Loader2 className="animate-spin" size={18}/> : (isPlaying ? <Pause size={18}/> : <Play size={18}/>)}
      </button>

      {/* Next button */}
      <button
        className="p-1.5 rounded-full border hover:bg-gray-50 disabled:opacity-40"
        onClick={goNext}
        disabled={!canNext || isPlaying}
        title="다음 프레임"
      >
        <ChevronRight size={18}/>
      </button>
    </div>
    </>
  )
}
