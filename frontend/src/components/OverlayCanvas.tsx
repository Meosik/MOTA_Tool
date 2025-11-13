import React, { useEffect, useMemo, useRef, useState } from 'react';
import useFrameStore, { Box } from '../store/frameStore';
import { fetchFrameBoxes, type FlatBox } from '../lib/api';

// ===== 스타일/상수 =====
// GT = 밝은 연두, Pred = 주황 계열
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

// ===== 라벨 유틸 =====
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
function drawIdLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  px: number,
  py: number,
  bgColor: string,
) {
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
  // ---- store selectors ----
  const frames         = useFrameStore(s => s.frames);
  const cur            = useFrameStore(s => s.cur);
  const iouThr         = useFrameStore(s => s.iou);
  const confThr        = useFrameStore(s => s.conf);
  const getImage       = useFrameStore(s => s.getImage);
  const prefetchAround = useFrameStore(s => s.prefetchAround);

  const gtId           = useFrameStore(s => s.gtAnnotationId);
  const predId         = useFrameStore(s => s.predAnnotationId);
  const getPredBox     = useFrameStore(s => s.getPredBox);
  const overrideVer    = useFrameStore(s => s.overrideVersion);

  const showGT         = useFrameStore(s => s.showGT);
  const showPred       = useFrameStore(s => s.showPred);

  // ---- local states ----
  const cnvRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement|null>(null);

  const fm = frames[cur] || null;

  const [gtBoxes, setGtBoxes] = useState<FlatBox[]>([]);
  const [predBase, setPredBase] = useState<FlatBox[]>([]);

  const [activeId, setActiveId] = useState<number|null>(null);
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const dragAnchor = useRef<{
    mode: DragMode;
    box0: Box;
    startMouse: Vec;
  } | null>(null);
  const [ghostBox, setGhostBox] = useState<Box|null>(null);

  // ---- 레이아웃(이미지 -> 캔버스) ----
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

  // ---- 이미지/박스 로딩 ----
  useEffect(()=>{
    if (!fm) { setImg(null); return; }
    getImage(fm.url).then(setImg).catch(()=>setImg(null));
    prefetchAround(cur, 3);
    // 프레임 바뀌면 드래그 상태 초기화
    setActiveId(null); setDragMode('none'); setGhostBox(null); dragAnchor.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fm?.url]);

  useEffect(()=>{
    let aborted = false;
    (async ()=>{
      if (gtId && fm) {
        try { const bb = await fetchFrameBoxes(gtId, fm.i); if (!aborted) setGtBoxes(bb); }
        catch { if(!aborted) setGtBoxes([]); }
      } else setGtBoxes([]);
    })();
    return ()=>{aborted = true;}
  }, [gtId, fm?.i]);

  useEffect(()=>{
    let aborted = false;
    (async ()=>{
      if (predId && fm) {
        try { const bb = await fetchFrameBoxes(predId, fm.i); if (!aborted) setPredBase(bb); }
        catch { if(!aborted) setPredBase([]); }
      } else setPredBase([]);
    })();
    return ()=>{aborted = true;}
  }, [predId, fm?.i]);

  // override 변경(=reset 포함) 시 드래그 상태 초기화
  useEffect(()=>{
    setActiveId(null);
    setDragMode('none');
    setGhostBox(null);
    dragAnchor.current = null;
  }, [overrideVer]);

  // ---- Pred 표시용(override 반영 + IoU/Conf 필터) ----
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

  // ---- hit helpers ----
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

  // ---- 그리기 ----
  useEffect(()=>{
    const cnv = cnvRef.current; if (!cnv) return;
    const ctx = cnv.getContext('2d'); if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = cnv.clientWidth, cssH = cnv.clientHeight;
    if (cnv.width !== Math.floor(cssW*dpr) || cnv.height !== Math.floor(cssH*dpr)) {
      cnv.width = Math.floor(cssW*dpr);
      cnv.height = Math.floor(cssH*dpr);
    }
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,cssW,cssH);

    if (img) ctx.drawImage(img, layout.ox, layout.oy, layout.dw, layout.dh);
    else { ctx.fillStyle='#f7f7f7'; ctx.fillRect(0,0,cssW,cssH); }

    // GT
    if (showGT && gtBoxes.length){
      ctx.lineWidth = LINE_W;
      ctx.strokeStyle = COLORS.gtStroke;
      ctx.fillStyle   = COLORS.gtFill;

      for (const g of gtBoxes){
        const [x,y,w,h] = g.bbox as [number,number,number,number];
        const p = toCanvas({x,y});
        const cw = w*layout.s, ch = h*layout.s;

        ctx.beginPath(); ctx.rect(p.x, p.y, cw, ch); ctx.fill(); ctx.stroke();

        // 라벨 (박스 밖 위쪽) - 박스색 배경
        drawIdLabel(ctx, String(g.id), p.x, Math.max(12, p.y - 4), 'rgba(80, 220, 120, 0.95)');

        // 색 복원
        ctx.strokeStyle = COLORS.gtStroke;
        ctx.fillStyle   = COLORS.gtFill;
      }
    }

    // Pred
    if (showPred && predBoxes.length){
      for (const b of predBoxes){
        const isActive = activeId === b.id && ghostBox
        const rb = isActive ? ghostBox! : b
        const p = toCanvas({x:rb.x, y:rb.y})
        const cw = rb.w*layout.s, ch = rb.h*layout.s

        ctx.lineWidth = LINE_W
        ctx.strokeStyle = COLORS.predStroke
        ctx.fillStyle   = COLORS.predFill
        ctx.beginPath(); ctx.rect(p.x, p.y, cw, ch); ctx.fill(); ctx.stroke()

        // 라벨 (박스 밖 위쪽) - 박스색 배경(주황)
        drawIdLabel(ctx, String(rb.id), p.x, Math.max(12, p.y - 4), 'rgba(255, 140, 0, 0.95)');

        // 핸들
        ctx.fillStyle = COLORS.predStroke
        const handles = [
          {x:p.x, y:p.y},
          {x:p.x+cw, y:p.y},
          {x:p.x, y:p.y+ch},
          {x:p.x+cw, y:p.y+ch},
        ]
        for (const h of handles){
          ctx.beginPath()
          ctx.rect(h.x - HANDLE_SIZE/2, h.y - HANDLE_SIZE/2, HANDLE_SIZE, HANDLE_SIZE)
          ctx.fill()
        }
      }
    }
  }, [img, layout.W, layout.H, layout.ox, layout.oy, layout.s, gtBoxes, predBoxes, showGT, showPred, activeId, ghostBox])

  // ---- 마우스 처리 ----
  function getCanvasPt(e:React.MouseEvent<HTMLCanvasElement>): Vec {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  const onMouseDown = (e:React.MouseEvent<HTMLCanvasElement>) => {
    if (!showPred) return;
    const ptC = getCanvasPt(e);
    const hit = hitPredBox(ptC);
    if (!hit){ setActiveId(null); setDragMode('none'); setGhostBox(null); dragAnchor.current = null; return; }

    const handle = hitWhichHandle(ptC, hit);
    const mode: DragMode = handle !== 'none' ? handle : 'move';
    setActiveId(hit.id);
    setDragMode(mode);

    const ptI = fromCanvas(ptC);
    dragAnchor.current = {
      mode,
      box0: { ...hit },
      startMouse: ptI,
    }
    setGhostBox({ ...hit });
  };

  const updateHoverCursor = (ptC:Vec) => {
    const el = cnvRef.current; if (!el) return;
    if (dragMode !== 'none') return;
    const hit = hitPredBox(ptC);
    if (!hit) { el.style.cursor = 'default'; return; }
    const h = hitWhichHandle(ptC, hit);
    if (h === 'resize-nw' || h === 'resize-se') { el.style.cursor = 'nwse-resize'; return; }
    if (h === 'resize-ne' || h === 'resize-sw') { el.style.cursor = 'nesw-resize'; return; }
    el.style.cursor = 'move';
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

    // 리사이즈: 앵커 고정, 반대편 코너만 이동
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
    if (dragMode !== 'none' && ghostBox && activeId != null && fm) {
      const nextBox: Box = { ...ghostBox, id: activeId };
      // 커밋(히스토리 포함) — frame key는 Frame.i
      useFrameStore.getState().applyOverrideWithHistory(fm.i, activeId, nextBox);
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

  // 드래그 중 커서 강제
  useEffect(()=>{
    const el = cnvRef.current; if (!el) return;
    if (dragMode==='none') { el.style.cursor = 'default'; return; }
    if (dragMode==='move') { el.style.cursor = 'move'; return; }
    if (dragMode==='resize-nw' || dragMode==='resize-se') { el.style.cursor = 'nwse-resize'; return; }
    if (dragMode==='resize-ne' || dragMode==='resize-sw') { el.style.cursor = 'nesw-resize'; return; }
  }, [dragMode]);

  return (
    <div className="relative w-full h-full bg-black/2">
      <canvas
        ref={cnvRef}
        className="w-full h-full block"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      />
    </div>
  );
}
