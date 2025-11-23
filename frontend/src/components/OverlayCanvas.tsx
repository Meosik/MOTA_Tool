// frontend/src/components/OverlayCanvas.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useFrameStore from '../store/frameStore';
import type { Box } from '../types/annotation';
import { iouRect } from '../utils/matching';
import { type FlatBox } from '../lib/api';

const COLORS = {
  gtStroke: 'rgba(80, 220, 120, 0.95)',
  gtFill:   'rgba(80, 220, 120, 0.18)',
  predStroke: 'rgba(255, 140, 0, 0.95)',
  predFill:   'rgba(255, 140, 0, 0.18)',
};
const HANDLE_SIZE = 8;
const HIT_PAD = 6;
const LINE_W = 2;

type Vec = { x: number; y: number };
type DragMode = 'none' | 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se';

function clamp(v:number, a:number, b:number){ return Math.max(a, Math.min(b, v)); }

function rectContains(x:number, y:number, r:{x:number;y:number;w:number;h:number}) {
  return x>=r.x && y>=r.y && x<=r.x+r.w && y<=r.y+r.h;
}
function roundRect(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, x:number, y:number, w:number, h:number, r:number) {
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y,   x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x,   y+h, rr);
  ctx.arcTo(x,   y+h, x,   y,   rr);
  ctx.arcTo(x,   y,   x+w, y,   rr);
  ctx.closePath();
}
function drawIdLabel(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, text: string, px: number, py: number, bgColor: string) {
  const padX = 4, padY = 2, radius = 3;
  ctx.save();
  ctx.font = '12px ui-sans-serif, system-ui, -apple-system';
  const tw = ctx.measureText(text).width;
  const th = 12;
  const rx = px - 1;
  const ry = Math.max(0, py - th - padY*2);
  const rw = tw + padX*2;
  const rh = th + padY*2;
  ctx.fillStyle = bgColor;
  roundRect(ctx, rx, ry, rw, rh, radius);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(text, rx + padX, Math.max(12, py - 2));
  ctx.restore();
}

export default function OverlayCanvas(){
  const frames         = useFrameStore(s => s.frames);
  const cur            = useFrameStore(s => s.cur);
  const iouThr         = useFrameStore(s => s.iou);
  const confThr        = useFrameStore(s => s.conf);
  const getImage       = useFrameStore(s => s.getImage);
  const prefetchAround = useFrameStore(s => s.prefetchAround);

  const gtId           = useFrameStore(s => s.gtAnnotationId);
  const predId         = useFrameStore(s => s.predAnnotationId);
  const getPredBox     = useFrameStore(s => s.getPredBox);
  const getFrameBoxes  = useFrameStore(s => s.getFrameBoxes);
  const tracksVersion  = useFrameStore(s => s.tracksVersion);
  const overrideVer    = useFrameStore(s => s.overrideVersion);

  const showGT         = useFrameStore(s => s.showGT);
  const showPred       = useFrameStore(s => s.showPred);

  const changeId = useFrameStore(s => s.changeOverrideIdWithHistory);

  const rootRef = useRef<HTMLDivElement>(null)
  const cnvRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement|null>(null);
  // 최근 성공적으로 디코드된 이미지 -> 다음 프레임 이미지 준비 안 되었을 때 깜빡임 최소화
  const lastImgRef = useRef<HTMLImageElement|null>(null);
  // 마지막으로 렌더한 프레임 번호 저장 (큰 점프 감지용)
  const prevFrameRef = useRef<number | null>(null);
  const isPlaying = useFrameStore(s => s.isPlaying);
  const fm = useMemo(() => frames[cur] || null, [frames, cur]);
  
  // Frame cache for rendered canvases (using OffscreenCanvas when available)
  const frameCache = useRef<Map<string, ImageBitmap | HTMLCanvasElement>>(new Map());
  const MAX_CACHED_FRAMES = 30;

  const [gtBoxes, setGtBoxes] = useState<FlatBox[]>([]);
  const [predBase, setPredBase] = useState<FlatBox[]>([]);

  const [activeId, setActiveId] = useState<number|null>(null);
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const dragAnchor = useRef<{ mode: DragMode; box0: Box; startMouse: Vec; } | null>(null);
  const [ghostBox, setGhostBox] = useState<Box|null>(null);

  const [idEdit, setIdEdit] = useState<{show:boolean; frame:number; targetId:number; value:string; left:number; top:number; geom: Omit<Box,'id'>}>({ show:false, frame:0, targetId:0, value:'', left:0, top:0, geom:{x:0,y:0,w:0,h:0} })

  const layout = useMemo(()=>{
    const W = cnvRef.current?.clientWidth || 1280;
    const H = cnvRef.current?.clientHeight || 720;
    const iw = img?.naturalWidth  || 1;
    const ih = img?.naturalHeight || 1;
    const s = Math.min(W/iw, H/ih);
    const dw = iw * s, dh = ih * s;
    const ox = (W - dw)/2, oy = (H - dh)/2;
    return { W, H, iw, ih, s, ox, oy, dw, dh };
  }, [img]);

  const toCanvas = (p:Vec) => ({ x: layout.ox + p.x*layout.s, y: layout.oy + p.y*layout.s });
  const fromCanvas = (p:Vec) => ({ x: (p.x - layout.ox)/layout.s, y: (p.y - layout.oy)/layout.s });

  useEffect(() => {
    if (!fm || !fm.url) {
      setImg(null);
      return;
    }
    const prev = prevFrameRef.current;
    const diff = prev != null ? Math.abs(fm.i - prev) : 0;
    // 큰 점프(>5) 또는 재생 종료 후 점프 시 이전 이미지 사용 금지
    const largeJump = diff > 5 && !isPlaying;
    if (largeJump) {
      lastImgRef.current = null; // 깨끗한 전환 (오래된 이미지 잔존 방지)
      setImg(null); // 이전 이미지 즉시 비움
    }
    prevFrameRef.current = fm.i;

    getImage(fm.url, true).then(async loadedImg => {
      try {
        if ('decode' in loadedImg) await loadedImg.decode();
      } catch {}
      setImg(loadedImg);
      lastImgRef.current = loadedImg;
    }).catch(()=>{
      setImg(null);
    });

    prefetchAround(cur, 3);
    setActiveId(null); setDragMode('none'); setGhostBox(null); dragAnchor.current = null;
    setIdEdit(v=> ({...v, show:false}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fm?.url, isPlaying]);

  // 첫 프레임 박스가 비어 있으면 즉시 재조회 (GT/PRED 각각 1회)
  useEffect(()=>{
    if (!fm) return;
    const frameNum = fm.i;
    if (frameNum !== 1) return; // 첫 프레임 한정
    const st = useFrameStore.getState();
    if (st.gtAnnotationId && st.getFrameBoxes('gt', frameNum).length === 0){
      st.fetchSingleFrameBoxes('gt', frameNum).catch(()=>{});
    }
    if (st.predAnnotationId && st.getFrameBoxes('pred', frameNum).length === 0){
      st.fetchSingleFrameBoxes('pred', frameNum).catch(()=>{});
    }
  }, [fm?.i, gtId, predId]);

  // GT 박스 로딩 (AbortController 적용)
  // GT 박스: 캐시 기반 즉시 제공 (tracksVersion 변경 시 갱신)
  useEffect(()=>{
    if (gtId && fm) {
      setGtBoxes(getFrameBoxes('gt', fm.i));
    } else {
      setGtBoxes([]);
    }
  }, [gtId, fm?.i, tracksVersion, getFrameBoxes]);

  // Pred 박스 로딩 (AbortController 적용)
  // Pred 박스: 캐시 기반 즉시 제공
  useEffect(()=>{
    if (predId && fm) {
      setPredBase(getFrameBoxes('pred', fm.i));
    } else {
      setPredBase([]);
    }
  }, [predId, fm?.i, tracksVersion, getFrameBoxes]);

  useEffect(()=>{
    setActiveId(null);
    setDragMode('none');
    setGhostBox(null);
    dragAnchor.current = null;
    setIdEdit(v=> ({...v, show:false}))
  }, [overrideVer]);

  const predBoxes: Box[] = useMemo(()=>{
    if (!fm) return [];
    const out: Box[] = [];
    for (const p of predBase) {
      const [x,y,w,h] = p.bbox.map(Number) as [number,number,number,number];
      const base: Box = { id: Number(p.id), x, y, w, h, conf: (p as any).conf ?? 1.0 };
      const b = getPredBox(fm.i, Number(base.id), base);
      if ((b.conf ?? 1) < confThr) continue;
      if (iouThr > 0 && gtBoxes.length > 0) {
        let maxI = 0;
        for (const g of gtBoxes) {
          const gbb = g.bbox as [number,number,number,number];
          const curI = iouRect(b, { x: gbb[0], y: gbb[1], w: gbb[2], h: gbb[3], id: -1 });
          if (curI > maxI) maxI = curI;
          if (maxI >= iouThr) break;
        }
        if (maxI < iouThr) continue;
      }
      out.push(b);
    }
    return out;
  }, [predBase, fm?.i, overrideVer, iouThr, confThr, gtBoxes, getPredBox]);

  function hitWhichHandle(cpt:Vec, b:Box): DragMode {
    const p = toCanvas({x:b.x, y:b.y});
    const cw = b.w*layout.s, ch = b.h*layout.s;
    const handles = [
      {x:p.x, y:p.y, mode:'resize-nw' as DragMode},
      {x:p.x+cw, y:p.y, mode:'resize-ne' as DragMode},
      {x:p.x, y:p.y+ch, mode:'resize-sw' as DragMode},
      {x:p.x+cw, y:p.y+ch, mode:'resize-se' as DragMode},
    ];
    for (const h of handles){
      if (rectContains(cpt.x, cpt.y, {x:h.x-HANDLE_SIZE/2, y:h.y-HANDLE_SIZE/2, w:HANDLE_SIZE, h:HANDLE_SIZE})) return h.mode;
    }
    return 'none';
  }
  function hitPredBox(canvasPt:Vec): Box | null {
    const list = [...predBoxes].sort((a,b)=> (a.id===activeId?-1:0) - (b.id===activeId?-1:0));
    for (const b of list){
      const p = toCanvas({x:b.x, y:b.y});
      const cw = b.w*layout.s, ch = b.h*layout.s;
      const r = { x:p.x - HIT_PAD, y:p.y - HIT_PAD, w: cw + HIT_PAD*2, h: ch + HIT_PAD*2 };
      if (rectContains(canvasPt.x, canvasPt.y, r)) return b;
    }
    return null;
  }

  // Memoize drawing functions for better performance
  const drawBoxes = useCallback((
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    boxes: (FlatBox | Box)[],
    isGT: boolean,
    scale: number,
    offset: { ox: number; oy: number }
  ) => {
    const strokeColor = isGT ? COLORS.gtStroke : COLORS.predStroke;
    const fillColor = isGT ? COLORS.gtFill : COLORS.predFill;
    const bgColor = isGT ? 'rgba(80, 220, 120, 0.95)' : 'rgba(255, 140, 0, 0.95)';

    ctx.lineWidth = LINE_W;
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = fillColor;

    // Batch drawing operations
    ctx.save();
    for (const box of boxes) {
      const isFlatBox = 'bbox' in box;
      const [x, y, w, h] = isFlatBox 
        ? (box as FlatBox).bbox as [number, number, number, number]
        : [box.x, box.y, box.w, box.h];
      const id = isFlatBox ? (box as FlatBox).id : box.id;

      const px = offset.ox + x * scale;
      const py = offset.oy + y * scale;
      const cw = w * scale;
      const ch = h * scale;

      // Draw box
      ctx.beginPath();
      ctx.rect(px, py, cw, ch);
      ctx.fill();
      ctx.stroke();

      // Draw label
      drawIdLabel(ctx, String(id), px, Math.max(12, py - 4), bgColor);
    }
    ctx.restore();
  }, []);

  const drawPredHandles = useCallback((
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    boxes: Box[],
    activeId: number | null,
    ghostBox: Box | null,
    scale: number,
    offset: { ox: number; oy: number }
  ) => {
    ctx.fillStyle = COLORS.predStroke;
    
    for (const b of boxes) {
      const isActive = activeId === b.id && ghostBox;
      const rb = isActive ? ghostBox! : b;
      const px = offset.ox + rb.x * scale;
      const py = offset.oy + rb.y * scale;
      const cw = rb.w * scale;
      const ch = rb.h * scale;

      const handles = [
        { x: px, y: py },
        { x: px + cw, y: py },
        { x: px, y: py + ch },
        { x: px + cw, y: py + ch },
      ];

      for (const h of handles) {
        ctx.fillRect(
          h.x - HANDLE_SIZE / 2,
          h.y - HANDLE_SIZE / 2,
          HANDLE_SIZE,
          HANDLE_SIZE
        );
      }
    }
  }, []);

  // draw - optimized with RAF throttling, OffscreenCanvas, and frame caching
  useEffect(() => {
    const cnv = cnvRef.current;
    if (!cnv) return;
    const ctx = cnv.getContext('2d', { alpha: false }); // Disable alpha for better performance
    if (!ctx) return;

    let rafId: number | null = null;
    let needsRender = true;

    // Generate cache key for current frame state (include geometry + overrideVersion)
    const getCacheKey = () => {
      const boxKey = activeId !== null && ghostBox ? `editing-${activeId}` : '';
      // Include ID + geometry to avoid reusing stale bitmaps when boxes move but IDs stay
      const gtKey = gtBoxes.map(b => `${b.id}:${b.bbox.join(',')}`).join(';');
      const predKey = predBoxes.map(b => `${b.id}:${b.x ?? (b as any).bbox?.[0]},${b.y ?? (b as any).bbox?.[1]},${b.w ?? (b as any).bbox?.[2]},${b.h ?? (b as any).bbox?.[3]}`).join(';');
      return `${fm?.i ?? 'none'}-gt[${gtKey}]-pr[${predKey}]-ovr[${overrideVer}]-${showGT}-${showPred}-${boxKey}`;
    };

    // Render to OffscreenCanvas (or fallback to regular canvas) to avoid blocking main thread
    const renderToOffscreen = (width: number, height: number, dpr: number) => {
      let offscreen: OffscreenCanvas | HTMLCanvasElement;
      let offscreenCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

      // Try to use OffscreenCanvas for better performance
      if (typeof OffscreenCanvas !== 'undefined') {
        offscreen = new OffscreenCanvas(Math.floor(width * dpr), Math.floor(height * dpr));
        offscreenCtx = offscreen.getContext('2d', { alpha: false }) as OffscreenCanvasRenderingContext2D;
      } else {
        // Fallback to regular canvas
        offscreen = document.createElement('canvas');
        offscreen.width = Math.floor(width * dpr);
        offscreen.height = Math.floor(height * dpr);
        offscreenCtx = offscreen.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
      }

      offscreenCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      offscreenCtx.clearRect(0, 0, width, height);

      // Draw image
      if (img) {
        offscreenCtx.drawImage(img, layout.ox, layout.oy, layout.dw, layout.dh);
      } else if (lastImgRef.current) {
        // 이전 프레임 이미지 재사용 (흰색 깜빡임 제거)
        offscreenCtx.drawImage(lastImgRef.current, layout.ox, layout.oy, layout.dw, layout.dh);
      } else {
        offscreenCtx.fillStyle = '#ffffff';
        offscreenCtx.fillRect(0, 0, width, height);
      }

      const offset = { ox: layout.ox, oy: layout.oy };

      // Draw GT boxes (batched)
      if (showGT && gtBoxes.length) {
        drawBoxes(offscreenCtx, gtBoxes, true, layout.s, offset);
      }

      // Draw Pred boxes (batched)
      if (showPred && predBoxes.length) {
        // Adjust predBoxes for active/ghost state
        const adjustedPredBoxes = predBoxes.map(b => {
          if (activeId === b.id && ghostBox) {
            return ghostBox;
          }
          return b;
        });
        
        drawBoxes(offscreenCtx, adjustedPredBoxes, false, layout.s, offset);
        drawPredHandles(offscreenCtx, predBoxes, activeId, ghostBox, layout.s, offset);
      }

      return offscreen;
    };

    const render = async () => {
      if (!needsRender) return;
      needsRender = false;

      const dpr = window.devicePixelRatio || 1;
      const cssW = cnv.clientWidth;
      const cssH = cnv.clientHeight;
      
      if (cnv.width !== Math.floor(cssW * dpr) || cnv.height !== Math.floor(cssH * dpr)) {
        cnv.width = Math.floor(cssW * dpr);
        cnv.height = Math.floor(cssH * dpr);
      }
      
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      // Try to use cached frame (only when not editing)
      const cacheKey = getCacheKey();
      const cached = activeId === null ? frameCache.current.get(cacheKey) : null;
      
      if (cached) {
        // Draw cached frame - fast blit operation
        ctx.drawImage(cached as any, 0, 0, cssW, cssH);
        return;
      }

      // Render frame using OffscreenCanvas
      const offscreen = renderToOffscreen(cssW, cssH, dpr);
      
      // Draw the offscreen canvas to main canvas
      ctx.drawImage(offscreen as any, 0, 0, cssW, cssH);

      // Cache the rendered frame (only if not editing)
      if (activeId === null && img) {
        try {
          // Convert OffscreenCanvas to ImageBitmap for efficient caching
          let bitmap: ImageBitmap;
          if (offscreen instanceof OffscreenCanvas) {
            bitmap = offscreen.transferToImageBitmap();
          } else {
            bitmap = await createImageBitmap(offscreen);
          }
          
          frameCache.current.set(cacheKey, bitmap);
          
          // Limit cache size
          if (frameCache.current.size > MAX_CACHED_FRAMES) {
            const iterator = frameCache.current.keys();
            const firstKey = iterator.next().value as string | undefined;
            if (typeof firstKey === 'string') {
              const oldBitmap = frameCache.current.get(firstKey);
              if (oldBitmap && 'close' in oldBitmap) {
                (oldBitmap as ImageBitmap).close();
              }
              frameCache.current.delete(firstKey);
            }
          }
        } catch (e) {
          // Bitmap creation not supported, skip caching
        }
      }
    };

    const scheduleRender = () => {
      needsRender = true;
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          render();
          rafId = null;
        });
      }
    };

    scheduleRender();

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [img, layout.ox, layout.oy, layout.s, layout.dw, layout.dh, gtBoxes, predBoxes, showGT, showPred, activeId, ghostBox, drawBoxes, drawPredHandles, fm, overrideVer])

  // Clear frame cache when frame index changes to avoid any stale geometry usage
  useEffect(() => {
    // When moving to a new frame, ensure no stale cached bitmap is reused for similar ID sets
    frameCache.current.clear();
    setActiveId(null);
    setDragMode('none');
    setGhostBox(null);
    dragAnchor.current = null;
  }, [fm?.i]);

  function getCanvasPt(e:React.MouseEvent<HTMLCanvasElement>): Vec {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  const onMouseDown = (e:React.MouseEvent<HTMLCanvasElement>) => {
    if (!showPred) return;
    const ptC = getCanvasPt(e);
    const hit = hitPredBox(ptC);
    if (!hit){ setActiveId(null); setDragMode('none'); setGhostBox(null); dragAnchor.current = null; setIdEdit(v=>({...v,show:false})); return; }

    const handle = hitWhichHandle(ptC, hit);
    const mode: DragMode = handle !== 'none' ? handle : 'move';
    setActiveId(Number(hit.id));
    setDragMode(mode);

    const ptI = fromCanvas(ptC);
    dragAnchor.current = { mode, box0: { ...hit }, startMouse: ptI }
    setGhostBox({ ...hit });
    setIdEdit(v=>({...v, show:false}))
  };

  // ID 더블클릭 편집
  const onDoubleClick = (e:React.MouseEvent<HTMLCanvasElement>) => {
    const frame = frames[cur]; if (!frame || !showPred) return
    const ptC = getCanvasPt(e)
    const hit = hitPredBox(ptC)
    if (!hit) return

    setActiveId(Number(hit.id))
    setDragMode('none'); setGhostBox(null); dragAnchor.current = null

    const p = toCanvas({x: hit.x, y: hit.y})
    const left = p.x + 4
    const top  = Math.max(0, p.y - 20)

    setIdEdit({
      show: true,
      frame: frame.i,
      targetId: Number(hit.id),
      value: String(hit.id),
      left, top,
      geom: { x: hit.x, y: hit.y, w: hit.w, h: hit.h, conf: hit.conf },
    })
  }

  const commitIdEdit = () => {
    if (!idEdit.show) return
    const newId = Number(idEdit.value)
    if (!Number.isInteger(newId) || newId <= 0) { setIdEdit(v=>({...v, show:false})); return }
    if (newId === idEdit.targetId) { setIdEdit(v=>({...v, show:false})); return }
    // 히스토리 포함 ID 변경
    useFrameStore.getState().changeOverrideIdWithHistory(
      idEdit.frame, idEdit.targetId, newId, idEdit.geom
    )
    setActiveId(newId)
    setIdEdit(v=>({...v, show:false}))
  }

  const updateHoverCursor = (ptC:Vec) => {
    const el = cnvRef.current; if (!el) return;
    if (dragMode !== 'none') return;
    const hit = hitPredBox(ptC);
    if (hit) {
      const h = hitWhichHandle(ptC, hit);
      if (h === 'resize-nw' || h === 'resize-se') { el.style.cursor = 'nwse-resize'; return; }
      if (h === 'resize-ne' || h === 'resize-sw') { el.style.cursor = 'nesw-resize'; return; }
      el.style.cursor = 'move'; return;
    }
    el.style.cursor = 'default';
  };

  const onMouseMove = (e:React.MouseEvent<HTMLCanvasElement>) => {
    const ptC = getCanvasPt(e);
    updateHoverCursor(ptC);

    if (dragMode === 'none' || !dragAnchor.current || !ghostBox) return;

    const ptI = fromCanvas(ptC);
    const { mode, box0, startMouse } = dragAnchor.current;

    if (mode === 'move'){
      const dx = ptI.x - startMouse.x;
      const dy = ptI.y - startMouse.y;
      let nx = clamp(box0.x + dx, 0, layout.iw);
      let ny = clamp(box0.y + dy, 0, layout.ih);
      let nw = box0.w;
      let nh = box0.h;
      nx = clamp(nx, 0, layout.iw - nw);
      ny = clamp(ny, 0, layout.ih - nh);
      setGhostBox(prev => prev ? ({ ...prev, x:nx, y:ny, w:nw, h:nh }) : null);
      return;
    }

    const x2 = box0.x + box0.w;
    const y2 = box0.y + box0.h;

    let ax:number, ay:number, bx:number, by:number;
    switch (mode) {
      case 'resize-nw': ax = x2; ay = y2; bx = ptI.x; by = ptI.y; break;
      case 'resize-ne': ax = box0.x; ay = y2; bx = ptI.x; by = ptI.y; break;
      case 'resize-sw': ax = x2; ay = box0.y; bx = ptI.x; by = ptI.y; break;
      case 'resize-se': ax = box0.x; ay = box0.y; bx = ptI.x; by = ptI.y; break;
      default: return;
    }

    let x = Math.min(ax, bx);
    let y = Math.min(ay, by);
    let w = Math.abs(bx - ax);
    let h = Math.abs(by - ay);

    const MIN = 1;
    w = Math.max(MIN, w);
    h = Math.max(MIN, h);
    x = clamp(x, 0, layout.iw - w);
    y = clamp(y, 0, layout.ih - h);

    setGhostBox(prev => prev ? ({ ...prev, x, y, w, h }) : null);
  };

  const onMouseUp = () => {
    const frame = frames[cur]
    if (dragMode !== 'none' && ghostBox && activeId != null && frame) {
      useFrameStore.getState().applyOverrideWithHistory(frame.i, activeId, { ...ghostBox, id: activeId });
    }
    setDragMode('none');
    setGhostBox(null);
    dragAnchor.current = null;
  };

  const onMouseLeave = () => {
    setDragMode('none');
    setGhostBox(null);
    dragAnchor.current = null;
  };

  useEffect(()=>{
    const el = cnvRef.current; if (!el) return;
    if (dragMode==='none') { el.style.cursor = 'default'; return; }
    if (dragMode==='move') { el.style.cursor = 'move'; return; }
    if (dragMode==='resize-nw' || dragMode==='resize-se') { el.style.cursor = 'nwse-resize'; return; }
    if (dragMode==='resize-ne' || dragMode==='resize-sw') { el.style.cursor = 'nesw-resize'; return; }
  }, [dragMode]);

  return (
    <div ref={rootRef} className="relative w-full h-full bg-black/2 select-none">
      <canvas
        ref={cnvRef}
        className="w-full h-full block"
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      />
      {idEdit.show && (
        <input
          className="absolute z-10 text-xs px-1 py-0.5 rounded border shadow bg-white"
          style={{ left: idEdit.left, top: idEdit.top, width: 56 }}
          autoFocus
          value={idEdit.value}
          onMouseDown={(e)=>{ e.stopPropagation(); }}
          onClick={(e)=>{ e.stopPropagation(); }}
          onChange={e=>setIdEdit(v=>({...v, value:e.target.value}))}
          onBlur={commitIdEdit}
          onKeyDown={(e)=>{
            if (e.key==='Enter') { e.preventDefault(); commitIdEdit(); }
            if (e.key==='Escape') { e.preventDefault(); setIdEdit(v=>({...v, show:false})) }
          }}
        />
      )}
    </div>
  );
}
