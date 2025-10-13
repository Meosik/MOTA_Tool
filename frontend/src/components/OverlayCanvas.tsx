import { MutableRefObject, useEffect, useRef } from 'react'
import { tracksCache } from '../lib/tracksCache'

export default function OverlayCanvas({videoRef}:{videoRef: MutableRefObject<HTMLVideoElement|null>}){
  const cRef = useRef<HTMLCanvasElement>(null)

  useEffect(()=>{
    const v = videoRef.current
    const c = cRef.current
    if(!v || !c) return
    const ctx = c.getContext('2d')!
    const onMeta = ()=>{
      c.width = v.clientWidth * devicePixelRatio
      c.height = v.clientHeight * devicePixelRatio
    }
    v.addEventListener('loadedmetadata', onMeta)

    let raf = 0 as number
    const loop = ()=>{
      if(!v || !c) return
      ctx.clearRect(0,0,c.width,c.height)
      const t = v.currentTime
      const rects = tracksCache.boxesAt(t) // placeholder
      ctx.lineWidth = 2
      ctx.strokeStyle = '#00E676'
      for(const b of rects){
        // b = {x,y,w,h} already scaled for simplicity in placeholder
        ctx.strokeRect(b.x, b.y, b.w, b.h)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return ()=>{
      cancelAnimationFrame(raf)
      v.removeEventListener('loadedmetadata', onMeta)
    }
  }, [videoRef])

  return <canvas ref={cRef} style={{position:'absolute', inset:0, pointerEvents:'none'}} />
}