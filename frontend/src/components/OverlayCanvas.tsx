
import { useEffect, useRef } from 'react'
import { useFrameStore } from '../store/frameStore'

export default function OverlayCanvas(){
  const cvsRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const { frames, cur } = useFrameStore()

  useEffect(()=>{
    const img = imgRef.current
    const cvs = cvsRef.current
    if(!img || !cvs) return

    const meta = frames[cur]
    if(!meta) return

    img.onload = ()=> draw()
    img.src = meta.url

    function draw(){
      const ctx = cvs.getContext('2d')!
      const rect = cvs.getBoundingClientRect()
      cvs.width = Math.floor(rect.width * devicePixelRatio)
      cvs.height = Math.floor(rect.height * devicePixelRatio)
      ctx.scale(devicePixelRatio, devicePixelRatio)

      // 이미지 비율 맞추기 (contain)
      const W = rect.width, H = rect.height
      const iw = img.naturalWidth, ih = img.naturalHeight
      const scale = Math.min(W/iw, H/ih)
      const rw = iw * scale, rh = ih * scale
      const ox = (W - rw)/2, oy = (H - rh)/2

      ctx.clearRect(0,0,W,H)
      ctx.drawImage(img, ox, oy, rw, rh)

      // TODO: GT/PRED 박스들을 가져와 스케일링 후 strokeRect
      // 예시 데모(가짜 박스)
      ctx.strokeStyle = '#00E676'
      ctx.lineWidth = 2
      ctx.strokeRect(ox + rw*0.25, oy + rh*0.25, rw*0.5, rh*0.5)
    }

    return ()=>{ /* cleanup if needed */ }
  }, [frames, cur])

  return (
    <div className="w-full h-full relative bg-neutral-50 grid place-items-center">
      <img ref={imgRef} alt="" className="hidden" />
      <canvas ref={cvsRef} className="w-full h-full" />
    </div>
  )
}
