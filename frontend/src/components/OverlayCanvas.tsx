import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useFrameStore } from '../store/frameStore'
import type { MotRecord } from '../utils/parseMot'
import { matchOneToOneGreedy, Box as MBox } from '../utils/matching'

type Box = { x:number; y:number; w:number; h:number; id:number }
type EditMode = 'move' | 'resize'
type Corner = 'nw'|'ne'|'sw'|'se'

type Editing = {
  id: number
  mode: EditMode
  corner?: Corner
  startImg: {x:number,y:number}
  orig: {x:number,y:number,w:number,h:number}
}

const HANDLE_SIZE = 10

function filterFrame(list: MotRecord[], frameNum: number): Box[] {
  if (!frameNum) return []
  return list
    .filter(r => r.frame === frameNum)
    .map(r => ({ x:r.x, y:r.y, w:r.w, h:r.h, id:r.id }))
}

export default function OverlayCanvas(){
  const cvsRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const {
    frames, cur, gt, pred, showGT, showPred, imgCache,
    getPredBox, applyOverride, markDirty, iou
  } = useFrameStore() as any

  const meta = frames[cur]
  const f = meta?.i ?? 0

  const gtBoxes = useMemo(()=> filterFrame(gt, f), [gt, f])

  const prBoxesBase = useMemo(() => {
    const list = filterFrame(pred, f)
    return list.map(b => {
      const ov = getPredBox?.(f, Number(b.id), { x:b.x, y:b.y, w:b.w, h:b.h, id:Number(b.id) }) || b
      return { x:ov.x, y:ov.y, w:ov.w, h:ov.h, id:ov.id } as Box
    })
  }, [pred, f, getPredBox])

  const [tempBox, setTempBox] = useState<Box|null>(null)
  const [editing, setEditing] = useState<Editing|null>(null)
  const [cursor, setCursor] = useState<string>('default')

  const prBoxesWithTemp = useMemo(()=>{
    if (!tempBox) return prBoxesBase
    return prBoxesBase.map(b => (Number(b.id)===Number(tempBox.id) ? {...tempBox} : b))
  }, [prBoxesBase, tempBox])

  const prBoxes = useMemo(()=>{
    if (!gtBoxes.length) return prBoxesWithTemp
    const keepIdx = matchOneToOneGreedy(prBoxesWithTemp as unknown as MBox[], gtBoxes as unknown as MBox[], iou)
    return prBoxesWithTemp.filter((_, idx)=> keepIdx.has(idx))
  }, [prBoxesWithTemp, gtBoxes, iou])

  useEffect(()=>{
    if (!meta) return
    const cached = imgCache?.get?.(cur) as HTMLImageElement | undefined
    if (cached && cached.complete) {
      drawWithImage(cached)
      return
    }
    const img = imgRef.current
    if(!img) return
    img.onload = () => draw()
    img.src = meta.url
  }, [meta?.url, cur, imgCache])

  useEffect(()=>{ draw() }, [gtBoxes, prBoxes, showGT, showPred, tempBox, editing])

  useEffect(()=>{
    const node = cvsRef.current?.parentElement
    if(!node) return
    const obs = new ResizeObserver(()=> draw())
    obs.observe(node)
    return ()=> obs.disconnect()
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

    const dpr = devicePixelRatio || 1
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    ctx.setTransform(dpr,0,0,dpr,0,0)

    const iw = img.naturalWidth || 1
    const ih = img.naturalHeight || 1
    const scale = Math.min(cssW/iw, cssH/ih)
    const rw = iw * scale
    const rh = ih * scale
    const ox = (cssW - rw) / 2
    const oy = (cssH - rh) / 2

    ctx.clearRect(0,0,cssW,cssH)
    if (img.complete) ctx.drawImage(img, ox, oy, rw, rh)

    const helpers = getGeomHelpers()
    if (!helpers) return
    const { scaleBox, cornerPoints } = helpers

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

    const drawHandles = (b:Box) => {
      const pts = cornerPoints(b)
      ctx.fillStyle = '#FF5252'
      for (const c of Object.values(pts)){
        ctx.fillRect(c.sx - HANDLE_SIZE/2, c.sy - HANDLE_SIZE/2, HANDLE_SIZE, HANDLE_SIZE)
      }
    }

    if (showGT) {
      ctx.lineWidth = 2
      ctx.strokeStyle = '#00E676'
      for (const b of gtBoxes){
        const [x,y,w,h] = scaleBox(b)
        ctx.strokeRect(x,y,w,h)
        drawLabel(`G${b.id}`, x, y, '#00E676')
      }
    }

    if (showPred) {
      ctx.lineWidth = 2
      ctx.strokeStyle = '#FF5252'
      for (const b of prBoxes){
        const [x,y,w,h] = scaleBox(b)
        ctx.strokeRect(x,y,w,h)
        drawLabel(`P${b.id}`, x, y, '#FF5252')
        drawHandles(b)
      }
    }

    if (tempBox) {
      ctx.setLineDash([6,3])
      ctx.strokeStyle = '#2196F3'
      const [x,y,w,h] = scaleBox(tempBox)
      ctx.strokeRect(x,y,w,h)
      ctx.setLineDash([])
    }

    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(6, cssH-22, 220, 16)
    ctx.fillStyle = 'white'
    ctx.font = '12px ui-sans-serif, system-ui'
    ctx.fillText(`f=${f} GT:${gtBoxes.length} Pred(visible):${prBoxes.length}`, 10, cssH-10)
  }

  const getGeomHelpers = useCallback(() => {
    const canvas = cvsRef.current
    const parent = canvas?.parentElement
    const img = imgRef.current
    if (!canvas || !parent || !img) return null

    const cssW = parent.clientWidth
    const cssH = parent.clientHeight
    const iw = img.naturalWidth || 1
    const ih = img.naturalHeight || 1
    const scale = Math.min(cssW/iw, cssH/ih)
    const rw = iw * scale
    const rh = ih * scale
    const ox = (cssW - rw) / 2
    const oy = (cssH - rh) / 2

    const imageToScreen = (x:number,y:number) => ({ sx: ox + x*scale, sy: oy + y*scale })
    const screenToImage = (sx:number,sy:number) => ({ imgX: (sx - ox)/scale, imgY: (sy - oy)/scale })
    const scaleBox = (b:Box) => {
      const { sx, sy } = imageToScreen(b.x, b.y)
      return [sx, sy, b.w*scale, b.h*scale] as const
    }
    const cornerPoints = (b:Box) => {
      const p = {
        nw: imageToScreen(b.x,         b.y),
        ne: imageToScreen(b.x + b.w,   b.y),
        sw: imageToScreen(b.x,         b.y + b.h),
        se: imageToScreen(b.x + b.w,   b.y + b.h),
      }
      return p
    }
    const hitHandle = (b:Box, sx:number, sy:number): Corner|undefined => {
      const pts = cornerPoints(b)
      for (const [key,pt] of Object.entries(pts)){
        if (Math.abs(sx-pt.sx) <= HANDLE_SIZE && Math.abs(sy-pt.sy) <= HANDLE_SIZE){
          return key as Corner
        }
      }
      return undefined
    }
    return { ox, oy, scale, imageToScreen, screenToImage, scaleBox, cornerPoints, hitHandle }
  }, [])

  const findHit = useCallback((sx:number, sy:number) => {
    const helpers = getGeomHelpers()
    if (!helpers) return null
    const { screenToImage, hitHandle } = helpers
    for (let i=prBoxes.length-1; i>=0; i--){
      const b = prBoxes[i]
      const corner = hitHandle(b, sx, sy)
      if (corner) return { id: Number(b.id), mode:'resize' as EditMode, corner, box: b }
      const { imgX, imgY } = screenToImage(sx, sy)
      if (imgX>=b.x && imgX<=b.x+b.w && imgY>=b.y && imgY<=b.y+b.h){
        return { id: Number(b.id), mode:'move' as EditMode, box: b }
      }
    }
    return null
  }, [prBoxes, getGeomHelpers])

  function onPointerDown(e: React.PointerEvent){
    if (!meta) return
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const hit = findHit(sx, sy)
    if (!hit) return
    const helpers = getGeomHelpers()
    if (!helpers) return
    const { screenToImage } = helpers
    const { imgX, imgY } = screenToImage(sx, sy)
    setEditing({
      id: hit.id,
      mode: hit.mode,
      corner: hit.corner,
      startImg: { x: imgX, y: imgY },
      orig: { x: hit.box.x, y: hit.box.y, w: hit.box.w, h: hit.box.h },
    })
    setTempBox(hit.box)
  }

  function onPointerMove(e: React.PointerEvent){
    const helpers = getGeomHelpers()
    if (!helpers) return
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const { screenToImage } = helpers
    const { imgX, imgY } = screenToImage(sx, sy)
    if (!editing){
      const hit = findHit(sx, sy)
      if (hit?.mode === 'move') setCursor('move')
      else if (hit?.mode === 'resize') {
        const map: Record<Corner,string> = { nw:'nwse-resize', se:'nwse-resize', ne:'nesw-resize', sw:'nesw-resize' }
        setCursor(hit.corner ? map[hit.corner] : 'default')
      } else setCursor('default')
      return
    }
    if (editing.mode === 'move') {
      const dx = imgX - editing.startImg.x
      const dy = imgY - editing.startImg.y
      setTempBox({
        id: editing.id,
        x: editing.orig.x + dx,
        y: editing.orig.y + dy,
        w: editing.orig.w,
        h: editing.orig.h
      })
    } else if (editing.mode === 'resize') {
      const o = editing.orig
      let x = o.x, y = o.y, w = o.w, h = o.h
      switch(editing.corner){
        case 'nw': w = (o.x+o.w) - imgX; h = (o.y+o.h) - imgY; x = imgX; y = imgY; break
        case 'ne': w = imgX - o.x;       h = (o.y+o.h) - imgY;           y = imgY;  break
        case 'sw': w = (o.x+o.w) - imgX; h = imgY - o.y;                 x = imgX;  break
        case 'se': w = imgX - o.x;       h = imgY - o.y;                             break
      }
      const MIN = 2
      if (w < MIN) w = MIN
      if (h < MIN) h = MIN
      setTempBox({ id: editing.id, x, y, w, h })
    }
  }

  function onPointerUp(){
    if (!editing || !tempBox || !meta) { setEditing(null); setTempBox(null); return }
    applyOverride?.(meta.i, editing.id, { x: tempBox.x, y: tempBox.y, w: tempBox.w, h: tempBox.h, id: editing.id })
    markDirty?.()
    setEditing(null)
    setTempBox(null)
  }

  function onPointerLeave(){
    if (editing){ setEditing(null); setTempBox(null) }
    setCursor('default')
  }

  return (
    <div className="w-full h-full relative bg-neutral-50">
      {meta
        ? (<img ref={imgRef} alt="" className="hidden" />)
        : (<div className="h-full grid place-items-center text-gray-500">프레임 폴더를 먼저 여세요</div>)
      }
      <canvas
        ref={cvsRef}
        className="absolute inset-0 w-full h-full"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
      />
    </div>
  )
}
