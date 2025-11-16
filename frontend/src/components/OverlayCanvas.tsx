import React, { useEffect, useMemo, useRef, useState } from 'react';
import useFrameStore, { Box, gtCache, prCache } from '../store/frameStore';
import type { FlatBox } from '../lib/api';

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
function iou(a:[number,number,number,number], b:[number,number,number,number]){
  const [ax,ay,aw,ah] = a, [bx,by,bw,bh] = b;
  const x1 = Math.max(ax, bx), y1 = Math.max(ay, by);
  const x2 = Math.min(ax+aw, bx+bw), y2 = Math.min(ay+ah, by+bh);
  const iw = Math.max(0, x2-x1), ih = Math.max(0, y2-y1);
  const inter = iw*ih;
  const union = aw*ah + bw*bh - inter;
  return union>0 ? inter/union : 0;
}
function rectContains(x:number, y:number, r:{x:number;y:number;w:number;h:number}) {
  return x>=r.x && y>=r.y && x<=r.x+r.w && y<=r.y+r.h;
}
function roundRect(ctx: CanvasRenderingContext2D, x:number, y:number, w:number, h:number, r:number) {
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y,   x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x,   y+h, rr);
  ctx.arcTo(x,   y+h, x,   y,   rr);
  ctx.arcTo(x,   y,   x+w, y,   rr);
  ctx.closePath();
}
function drawIdLabel(ctx: CanvasRenderingContext2D, text: string, px: number, py: number, bgColor: string) {
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
  const fillCacheWindow = useFrameStore(s => s.fillCacheWindow);
  const getPredBox     = useFrameStore(s => s.getPredBox);
  const overrideVer    = useFrameStore(s => s.overrideVersion);

  const showGT         = useFrameStore(s => s.showGT);
  const showPred       = useFrameStore(s => s.showPred);

  const rootRef = useRef<HTMLDivElement>(null)
  const cnvRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement|ImageBitmap|null>(null);
  const imgRef = useRef<HTMLImageElement|ImageBitmap|null>(null);
  const fm = frames[cur] || null;

  const [gtBoxes, setGtBoxes] = useState<FlatBox[]>([]);
  const [predBase, setPredBase] = useState<FlatBox[]>([]);

  const layoutRef = useRef<any>(null);
  const gtBoxesRef = useRef<FlatBox[]>([]);
  const predBaseRef = useRef<FlatBox[]>([]);
  const overridesRef = useRef(useFrameStore.getState().overrides);
  const activeIdRef = useRef<number|null>(null);
  const ghostBoxRef = useRef<Box|null>(null);

  const [activeId, setActiveId] = useState<number|null>(null);
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const dragAnchor = useRef<{ mode: DragMode; box0: Box; startMouse: Vec; } | null>(null);
  const [ghostBox, setGhostBox] = useState<Box|null>(null);

  const [idEdit, setIdEdit] = useState<{show:boolean; frame:number; targetId:number; value:string; left:number; top:number; geom: Omit<Box,'id'>}>({ show:false, frame:0, targetId:0, value:'', left:0, top:0, geom:{x:0,y:0,w:0,h:0} })

  const layout = useMemo(()=>{
    const W = cnvRef.current?.clientWidth || 1280;
    const H = cnvRef.current?.clientHeight || 720;
    const iw = img ? (((img as any).naturalWidth ?? (img as any).width) || 1) : 1;
    const ih = img ? (((img as any).naturalHeight ?? (img as any).height) || 1) : 1;
    const s = Math.min(W/iw, H/ih);
    const dw = iw * s, dh = ih * s;
    const ox = (W - dw)/2, oy = (H - dh)/2;
    return { W, H, iw, ih, s, ox, oy, dw, dh };
  }, [img]);

  const toCanvas = (p:Vec) => ({ x: layout.ox + p.x*layout.s, y: layout.oy + p.y*layout.s });
  const fromCanvas = (p:Vec) => ({ x: (p.x - layout.ox)/layout.s, y: (p.y - layout.oy)/layout.s });

  useEffect(()=>{
    if (!fm) { setImg(null); return; }
    if (!fm.url) { setImg(null); imgRef.current = null; return; }
    getImage(fm.url).then(im => { setImg(im); imgRef.current = im; }).catch(()=>{ setImg(null); imgRef.current = null; });
    prefetchAround(cur, 3);
    setActiveId(null); setDragMode('none'); setGhostBox(null); dragAnchor.current = null;
    setIdEdit(v=> ({...v, show:false}))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fm?.url]);

  useEffect(()=>{
    let aborted = false;
    (async ()=>{
      if (gtId && fm) {
        try {
          const key = `${gtId}:${fm.i}`;
          const cached = gtCache.get(key);
          if (cached) { if (!aborted) setGtBoxes(cached); }
          else {
            // 캐시에 없으면 현재 프레임만 로드 (BottomHud의 prefetch에 의존)
            await fillCacheWindow('gt', fm.i, fm.i);
            const after = gtCache.get(key) || [];
            if (!aborted) setGtBoxes(after);
          }
        } catch {
          if(!aborted) setGtBoxes([]);
        }
      } else setGtBoxes([]);
    })();
    return ()=>{aborted = true;}
  }, [gtId, fm?.i, fillCacheWindow]);

  useEffect(()=>{
    let aborted = false;
    (async ()=>{
      if (predId && fm) {
        try {
          const key = `${predId}:${fm.i}`;
          const cached = prCache.get(key);
          if (cached) { if (!aborted) setPredBase(cached); }
          else {
            // 캐시에 없으면 현재 프레임만 로드 (BottomHud의 prefetch에 의존)
            await fillCacheWindow('pred', fm.i, fm.i);
            const after = prCache.get(key) || [];
            if (!aborted) setPredBase(after);
          }
        } catch {
          if(!aborted) setPredBase([]);
        }
      } else setPredBase([]);
    })();
    return ()=>{aborted = true;}
  }, [predId, fm?.i, fillCacheWindow]);

  useEffect(()=>{
    setActiveId(null);
    setDragMode('none');
    setGhostBox(null);
    dragAnchor.current = null;
    setIdEdit(v=> ({...v, show:false}))
  }, [overrideVer]);

  useEffect(()=>{ gtBoxesRef.current = gtBoxes }, [gtBoxes]);
  useEffect(()=>{ predBaseRef.current = predBase }, [predBase]);
  useEffect(()=>{ overridesRef.current = useFrameStore.getState().overrides }, [overrideVer]);
  useEffect(()=>{ activeIdRef.current = activeId }, [activeId]);
  useEffect(()=>{ ghostBoxRef.current = ghostBox }, [ghostBox]);

  const predBoxes: Box[] = useMemo(()=>{
    if (!fm) return [];
    const out: Box[] = [];
    for (const p of predBase) {
      const [x,y,w,h] = p.bbox.map(Number) as [number,number,number,number];
      const base: Box = { id: Number(p.id), x, y, w, h, conf: (p as any).conf ?? 1.0 };
      const b = getPredBox(fm.i, base.id, base);
      if ((b.conf ?? 1) < confThr) continue;
      if (iouThr > 0 && gtBoxes.length > 0) {
        let maxI = 0;
        for (const g of gtBoxes) {
          const gbb = g.bbox as [number,number,number,number];
          const curI = iou([b.x,b.y,b.w,b.h], gbb);
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

  // single RAF draw loop (main-thread only)
  useEffect(()=>{
    let raf = 0;
    let mounted = true;

    const loop = () => {
      if (!mounted) return;
      try {
        const st = useFrameStore.getState();
        const f = st.frames[st.cur];
        const cnv = cnvRef.current;
        if (f && cnv) {
          const im = imgRef.current;
          const L = layoutRef.current || layout;

          const ctx = cnv.getContext('2d');
          if (!ctx) return;

          const cssW = cnv.clientWidth, cssH = cnv.clientHeight;
          const dpr = window.devicePixelRatio || 1;
          if (cnv.width !== Math.floor(cssW*dpr) || cnv.height !== Math.floor(cssH*dpr)) {
            cnv.width = Math.floor(cssW*dpr);
            cnv.height = Math.floor(cssH*dpr);
          }
          ctx.setTransform(dpr,0,0,dpr,0,0);
          ctx.clearRect(0,0,cssW,cssH);
          
          // drawImage 호출 시 에러 처리 (ImageBitmap이 detached된 경우)
          if (im) {
            try {
              ctx.drawImage(im as any, L.ox, L.oy, L.dw, L.dh);
            } catch (err) {
              console.warn('drawImage failed (detached ImageBitmap?), clearing cache:', err);
              // ImageBitmap이 detached되었다면 캐시에서 제거
              if (f.url) {
                try {
                  (useFrameStore.getState() as any).imgCache?.delete(f.url);
                } catch {}
              }
              ctx.fillStyle = '#f7f7f7';
              ctx.fillRect(0,0,cssW,cssH);
            }
          } else { 
            ctx.fillStyle = '#f7f7f7'; 
            ctx.fillRect(0,0,cssW,cssH); 
          }

          const keyG = `${gtId}:${f.i}`;
          const keyP = `${predId}:${f.i}`;
          const gboxes = gtCache.get(keyG) || gtBoxesRef.current || [];
          const pboxes = prCache.get(keyP) || predBaseRef.current || [];

          if (showGT && gboxes.length) {
            ctx.lineWidth = LINE_W; ctx.strokeStyle = COLORS.gtStroke; ctx.fillStyle = COLORS.gtFill;
            ctx.font = '12px ui-sans-serif';
            for (let gi=0; gi<gboxes.length; gi++){
              const g = gboxes[gi];
              const bb = g.bbox as [number,number,number,number];
              const px = L.ox + bb[0]*L.s;
              const py = L.oy + bb[1]*L.s;
              const cw = bb[2]*L.s, ch = bb[3]*L.s;
              ctx.fillRect(px, py, cw, ch);
              ctx.strokeRect(px, py, cw, ch);
              
              const text = String(g.id);
              const tw = ctx.measureText(text).width;
              const lx = px - 1, ly = Math.max(0, py - 18);
              ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
              ctx.fillRect(lx, ly, tw + 8, 16);
              ctx.fillStyle = 'rgba(80, 220, 120, 0.95)';
              ctx.fillText(text, lx + 4, ly + 12);
            }
          }

          if (showPred && pboxes.length) {
            ctx.lineWidth = LINE_W; ctx.strokeStyle = COLORS.predStroke; ctx.fillStyle = COLORS.predFill;
            ctx.font = '12px ui-sans-serif';
            for (let pi=0; pi<pboxes.length; pi++){
              const p = pboxes[pi];
              const bb = p.bbox.map(Number) as [number,number,number,number];
              const bid = Number(p.id);
              const ovmap = overridesRef.current?.get(f.i);
              let px, py, cw, ch;
              
              if (ovmap?.has(bid)) {
                const ov = ovmap.get(bid)!;
                px = L.ox + ov.x*L.s;
                py = L.oy + ov.y*L.s;
                cw = ov.w*L.s; ch = ov.h*L.s;
              } else {
                px = L.ox + bb[0]*L.s;
                py = L.oy + bb[1]*L.s;
                cw = bb[2]*L.s; ch = bb[3]*L.s;
              }
              
              ctx.fillRect(px, py, cw, ch);
              ctx.strokeRect(px, py, cw, ch);
              
              const text = String(bid);
              const tw = ctx.measureText(text).width;
              const lx = px - 1, ly = Math.max(0, py - 18);
              ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
              ctx.fillRect(lx, ly, tw + 8, 16);
              ctx.fillStyle = 'rgba(255, 140, 0, 0.95)';
              ctx.fillText(text, lx + 4, ly + 12);
            }
          }
        }
      } catch (err) {
        console.warn('overlay draw error', err);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { mounted = false; cancelAnimationFrame(raf); };
  }, [gtId, predId, showGT, showPred, fm?.url]);

  useEffect(()=>{ layoutRef.current = layout; }, [layout]);

  const getCanvasPt = (e:React.MouseEvent<HTMLCanvasElement>): Vec => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onMouseDown = (e:React.MouseEvent<HTMLCanvasElement>) => {
    if (!showPred) return;
    const ptC = getCanvasPt(e);
    const hit = hitPredBox(ptC);
    if (!hit){ setActiveId(null); setDragMode('none'); setGhostBox(null); dragAnchor.current = null; setIdEdit(v=>({...v,show:false})); return; }

    const handle = hitWhichHandle(ptC, hit);
    const mode: DragMode = handle !== 'none' ? handle : 'move';
    setActiveId(hit.id);
    setDragMode(mode);

    const ptI = fromCanvas(ptC);
    dragAnchor.current = { mode, box0: { ...hit }, startMouse: ptI }
    setGhostBox({ ...hit });
    setIdEdit(v=>({...v, show:false}))
  };

  const onDoubleClick = (e:React.MouseEvent<HTMLCanvasElement>) => {
    const frame = frames[cur]; if (!frame || !showPred) return
    const ptC = getCanvasPt(e)
    const hit = hitPredBox(ptC)
    if (!hit) return

    setActiveId(hit.id)
    setDragMode('none'); setGhostBox(null); dragAnchor.current = null

    const p = toCanvas({x: hit.x, y: hit.y})
    const left = p.x + 4
    const top  = Math.max(0, p.y - 20)

    setIdEdit({
      show: true,
      frame: frame.i,
      targetId: hit.id,
      value: String(hit.id),
      left, top,
      geom: { x: hit.x, y: hit.y, w: hit.w, h: hit.h, conf: hit.conf },
    })
  };

  const commitIdEdit = () => {
    if (!idEdit.show) return
    const newId = Number(idEdit.value)
    if (!Number.isInteger(newId) || newId <= 0) { setIdEdit(v=>({...v, show:false})); return }
    if (newId === idEdit.targetId) { setIdEdit(v=>({...v, show:false})); return }
    useFrameStore.getState().changeOverrideIdWithHistory(
      idEdit.frame, idEdit.targetId, newId, idEdit.geom
    )
    setActiveId(newId)
    setIdEdit(v=>({...v, show:false}))
  };

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
