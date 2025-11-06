import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrameStore } from '../store/frameStore'
import type { MotRecord } from '../utils/parseMot'

type Box = { x:number; y:number; w:number; h:number; id:number }

export default function OverlayCanvas(){
  const cvsRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const { frames, cur, gt, pred, showGT, showPred, imgCache } = useFrameStore()
  const meta = frames[cur]

  // 현재 프레임 번호 (= 파일명에서 뽑은 숫자)
  const f = meta?.i ?? 0

  // 현재 프레임의 GT/Pred 박스 추출
  const gtBoxes = useMemo(() => filterFrame(gt, f), [gt, f])
  const prBoxes = useMemo(() => filterFrame(pred, f), [pred, f])

  // 이미지 로드 시 그리기
  useEffect(()=>{
    const img = imgRef.current
    if(!img || !meta) return

    const cached = imgCache.get(cur)
    if (cached && cached.complete) {
      // 캐시에 로드된 이미지가 있으면 즉시 그리기
      drawWithImage(cached)
    } else {
      // 없으면 평소대로 로드 후 그리기
      img.onload = () => draw()
      img.src = meta.url
    }
  }, [meta?.url, cur, imgCache])


  // 데이터/토글 변경 시 재그리기
  useEffect(()=>{ draw() }, [gtBoxes, prBoxes, showGT, showPred])

  // 리사이즈에 대응
  useEffect(()=>{
    const node = cvsRef.current?.parentElement
    if(!node) return
    const obs = new ResizeObserver(()=> draw())
    obs.observe(node)
    return () => obs.disconnect()
  }, [])

  function draw(){
    const img = imgRef.current
    if (img) drawWithImage(img)
  }

  function drawWithImage(img: HTMLImageElement){
    const canvas = cvsRef.current
    if(!canvas) return
    const ctx = canvas.getContext('2d')!
    const parent = canvas.parentElement!
    const cssW = parent.clientWidth
    const cssH = parent.clientHeight

    // HiDPI
    const dpr = devicePixelRatio || 1
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    ctx.setTransform(dpr,0,0,dpr,0,0)

    // contain 배치
    const iw = img.naturalWidth || 1
    const ih = img.naturalHeight || 1
    const scale = Math.min(cssW/iw, cssH/ih)
    const rw = iw * scale
    const rh = ih * scale
    const ox = (cssW - rw) / 2
    const oy = (cssH - rh) / 2

    ctx.clearRect(0,0,cssW,cssH)
    if (img.complete) ctx.drawImage(img, ox, oy, rw, rh)

    const scaleBox = (b:Box) => [ox + b.x*scale, oy + b.y*scale, b.w*scale, b.h*scale] as const

    const drawLabel = (text:string, x:number, y:number, color:string) => {
      ctx.font = '12px ui-sans-serif, system-ui'
      const pad = 2
      const tw = ctx.measureText(text).width + pad*2
      const th = 14 + pad*2
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(x, Math.max(0,y-th), tw, th)
      ctx.fillStyle = color
      ctx.fillText(text, x+pad, Math.max(12,y-4))
    }

    // GT(초록)
    if (showGT) {
      ctx.lineWidth = 2
      ctx.strokeStyle = '#00E676'
      for (const b of gtBoxes){
        const [x,y,w,h] = scaleBox(b)
        ctx.strokeRect(x,y,w,h)
        drawLabel(`G${b.id}`, x, y, '#00E676')
      }
    }
    // Pred(빨강)
    if (showPred) {
      ctx.lineWidth = 2
      ctx.strokeStyle = '#FF5252'
      for (const b of prBoxes){
        const [x,y,w,h] = scaleBox(b)
        ctx.strokeRect(x,y,w,h)
        drawLabel(`P${b.id}`, x, y, '#FF5252')
      }
    }

    // 디버그(하단 좌측에 카운트 표시)
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(6, cssH-22, 160, 16)
    ctx.fillStyle = 'white'
    ctx.font = '12px ui-sans-serif, system-ui'
    ctx.fillText(`f=${f} GT:${gtBoxes.length} Pred:${prBoxes.length}`, 10, cssH-10)
  }

  return (
    <div className="w-full h-full relative bg-neutral-50">
      {meta
        ? (<img ref={imgRef} alt="" className="hidden" />)
        : (<div className="h-full grid place-items-center text-gray-500">프레임 폴더를 먼저 여세요</div>)
      }
      <canvas ref={cvsRef} className="absolute inset-0 w-full h-full"/>
    </div>
  )
}

function filterFrame(list: MotRecord[], frameNum: number): Box[] {
  if (!frameNum) return []
  // MOT는 보통 frame이 1부터 시작. 파일명 숫자와 동일해야 보입니다.
  const items = list.filter(r => r.frame === frameNum)
  // (x,y,w,h)는 좌상단 기준 픽셀
  return items.map(r => ({ x:r.x, y:r.y, w:r.w, h:r.h, id:r.id }))
}
