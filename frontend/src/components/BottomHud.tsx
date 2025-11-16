// frontend/src/components/BottomHud.tsx
import React, { useCallback, useEffect, useState, useRef } from 'react'
import useFrameStore from '../store/frameStore'
import { ChevronLeft, ChevronRight, Play, Pause } from 'lucide-react'

export default function BottomHud() {
  const { frames, cur, setCur, prefetchAround, isPlaying, setPlaying, fillCacheWindow, gtAnnotationId, predAnnotationId } = useFrameStore(s => ({
    frames: s.frames,
    cur: s.cur,
    setCur: s.setCur,
    prefetchAround: s.prefetchAround,
    isPlaying: s.isPlaying,
    setPlaying: s.setPlaying,
    fillCacheWindow: s.fillCacheWindow,
    gtAnnotationId: s.gtAnnotationId,
    predAnnotationId: s.predAnnotationId,
  }))

  // get cache control functions separately to avoid re-subscribing whole object
  const setMaxUrls = useFrameStore(s => s.setMaxUrls)
  const resetMaxUrls = useFrameStore(s => s.resetMaxUrls)
  const stopAdaptiveCache = useFrameStore(s => s.stopAdaptiveCache)
  const preloadImageRange = useFrameStore(s => s.preloadImageRange)

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

  // local UI state for playback
  const [fps, setFps] = useState<number>(10)
  const [inputFrame, setInputFrame] = useState<number>(frames[cur]?.i ?? cur + 1)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    setInputFrame(frames[cur]?.i ?? cur + 1)
  }, [cur, frames])

  // start/stop playback using requestAnimationFrame for accurate timing
  useEffect(() => {
    let rafId: number | null = null;
    let lastTs: number | null = null;
    let acc = 0;
    let lastBatchPrefetchIdx = -999;
    let lastImagePreloadIdx = -999;
    const frameDur = () => 1000 / Math.max(1, fps);

    const loop = (ts: number) => {
      if (lastTs == null) lastTs = ts;
      const dt = ts - lastTs;
      lastTs = ts;
      acc += dt;
      const dur = frameDur();
      while (acc >= dur) {
        acc -= dur;
        const next = Math.min(frames.length - 1, useFrameStore.getState().cur + 1);
        useFrameStore.getState().setCur(next);
        
        // 박스 데이터 배치 프리페칭 (매우 공격적: 최대 3초 선행)
        const batchInterval = Math.max(1, Math.floor(fps / 8)); // ~125ms 간격
        if (next - lastBatchPrefetchIdx >= batchInterval) {
          const lookAhead = Math.ceil(fps * 3); // 3초분 미리 로드
          useFrameStore.getState().prefetchAround(next, lookAhead);
          lastBatchPrefetchIdx = next;
        }
        
        // 이미지 미리 디코드 (매우 공격적: 최대 2초 선행)
        const imagePreloadInterval = Math.max(1, Math.floor(fps / 30)); // ~33ms 간격
        if (next - lastImagePreloadIdx >= imagePreloadInterval) {
          const imageCount = Math.ceil(fps * 2); // 2초분 이미지 미리 로드
          const nextIdxStart = next + 1;
          const nextIdxEnd = Math.min(frames.length - 1, next + imageCount);
          if (nextIdxStart < frames.length) {
            preloadImageRange(nextIdxStart, nextIdxEnd).catch(()=>{});
          }
          lastImagePreloadIdx = next;
        }
        
        if (next >= frames.length - 1) {
          useFrameStore.getState().setPlaying(false);
          return;
        }
      }
      rafId = requestAnimationFrame(loop);
    };

    if (isPlaying) {
      lastTs = null; acc = 0; lastBatchPrefetchIdx = -999; lastImagePreloadIdx = -999; rafId = requestAnimationFrame(loop);
    } else {
      if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
    }

    return () => { if (rafId != null) cancelAnimationFrame(rafId); };
  }, [isPlaying, fps, frames.length]);

  const togglePlay = useCallback(() => {
    const willPlay = !isPlaying
    setPlaying(willPlay)
    // when starting playback, batch prefetch a larger window for smooth overlays
    if (willPlay) {
      const curFrameNum = frames[cur]?.i ?? (cur + 1)
      // 초기 로드: 3초분의 박스 데이터를 미리 로드
      const initWin = Math.ceil(fps * 3);
      const f0 = Math.max(1, curFrameNum)
      const f1 = Math.min(frames[frames.length - 1]?.i ?? frames.length, curFrameNum + initWin)
      if (gtAnnotationId) fillCacheWindow('gt', f0, f1)
      if (predAnnotationId) fillCacheWindow('pred', f0, f1)
      
      // 초기 이미지도 미리 디코드 (2초분)
      const initImgCount = Math.ceil(fps * 2);
      const imgStart = cur + 1;
      const imgEnd = Math.min(frames.length - 1, cur + initImgCount);
      if (imgStart < frames.length) {
        preloadImageRange(imgStart, imgEnd).catch(()=>{});
      }
      
      // ObjectURL 캐시 크기를 매우 공격적으로 설정
      try {
        const baseCacheSize = Math.floor(initWin * 2);
        const desired = Math.min(8000, Math.max(2000, baseCacheSize));
        setMaxUrls(desired)
      } catch {}
    } else {
      // restore default cap and cleanup cache
      try { 
        resetMaxUrls();
        stopAdaptiveCache();
      } catch {}
    }
  }, [isPlaying, setPlaying, frames, cur, fps, fillCacheWindow, gtAnnotationId, predAnnotationId, setMaxUrls, resetMaxUrls, stopAdaptiveCache, preloadImageRange])

  const onFrameInputChange = (v: number) => {
    const tgt = Math.max(1, Math.min(Math.max(1, frames.length), Math.floor(v)))
    setInputFrame(tgt)
    const idx = Math.max(0, tgt - 1)
    setCur(idx)
    prefetchAround(idx, 3)
  }

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

      <button
        className="p-2 rounded-full border hover:bg-gray-50 inline-flex items-center"
        onClick={togglePlay}
        title={isPlaying ? '일시정지' : '재생'}
      >
        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
      </button>

      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={total}
          value={inputFrame}
          onChange={(e) => onFrameInputChange(Number(e.target.value))}
          className="w-20 text-sm px-2 py-1 border rounded text-center"
        />
        <div className="text-sm font-mono">/ {frames[total - 1]?.i ?? total}</div>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs">FPS</label>
        <input
          type="number"
          min={1}
          max={60}
          value={fps}
          onChange={(e) => setFps(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
          className="w-16 text-sm px-2 py-1 border rounded text-center"
        />
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
