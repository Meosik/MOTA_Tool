import React, { useEffect, useMemo, useRef, useState } from 'react';
import useFrameStore, { Box } from '../store/frameStore';
import { fetchFrameBoxes, type FlatBox } from '../lib/api';

type DragKind = 'move' | 'nw' | 'ne' | 'sw' | 'se';
const HANDLE_SIZE = 12;
const MIN_W = 4;
const MIN_H = 4;

function toBoxArray(frame: number, arr: FlatBox[]): Box[] {
  return (arr || []).map(b => ({ id: Number(b.id), x: b.bbox[0], y: b.bbox[1], w: b.bbox[2], h: b.bbox[3] }));
}

function iouRect(a: Box, b: Box): number {
  const ax2 = a.x + a.w, ay2 = a.y + a.h;
  const bx2 = b.x + b.w, by2 = b.y + b.h;
  const iw = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const ih = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const inter = iw * ih;
  if (inter <= 0) return 0;
  const ua = a.w * a.h + b.w * b.h - inter;
  return ua > 0 ? inter / ua : 0;
}

export default function OverlayCanvas(){
  const {
    frames, cur,
    showGT, showPred, iou, conf,
    gtAnnotationId, predAnnotationId,
    getPredBox, applyOverride,
    imgCache, cacheImage, getImage, prefetchAround,
    overrideVersion,
  } = useFrameStore() as any;

  /** 캔버스/컨테이너 */
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  /** 현재 프레임 이미지/크기 */
  const [img, setImg]   = useState<HTMLImageElement | null>(null);
  const [imgSize, setImgSize] = useState<{w:number; h:number}>({ w: 1280, h: 720 });
  const [wrapSize, setWrapSize] = useState<{w:number; h:number}>({ w: 800, h: 600 });

  /** 현재 프레임 박스(지연 로드) */
  const [gtFrame, setGtFrame]   = useState<Box[]>([]);
  const [prFrame, setPrFrame]   = useState<Box[]>([]);

  /** 화면맞춤(레터박스) */
  const fit = useMemo(() => {
    const iw = imgSize.w, ih = imgSize.h;
    const ww = wrapSize.w, wh = wrapSize.h;
    if (iw <= 0 || ih <= 0 || ww <= 0 || wh <= 0) {
      return { scale: 1, dw: iw, dh: ih, ox: 0, oy: 0 };
    }
    const s = Math.min(ww / iw, wh / ih);
    const dw = Math.round(iw * s);
    const dh = Math.round(ih * s);
    const ox = Math.floor((ww - dw) / 2);
    const oy = Math.floor((wh - dh) / 2);
    return { scale: s, dw, dh, ox, oy };
  }, [imgSize, wrapSize]);

  /** 래퍼 리사이즈 감지 */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new (window as any).ResizeObserver((entries:any) => {
      for (const e of entries) {
        const cr = e.contentRect;
        setWrapSize({ w: Math.max(1, Math.floor(cr.width)), h: Math.max(1, Math.floor(cr.height)) });
      }
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setWrapSize({ w: Math.max(1, Math.floor(r.width)), h: Math.max(1, Math.floor(r.height)) });
    return () => ro.disconnect();
  }, []);

  /** 이미지 로더 (스토어 캐시 활용) */
  const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    if (typeof getImage === 'function') {
      getImage(url).then(resolve).catch(reject);
      return;
    }
    // 폴백 캐시
    const cached = imgCache?.get?.(url);
    if (cached && (cached.complete || (cached.naturalWidth + cached.naturalHeight) > 0)) {
      resolve(cached);
      return;
    }
    const im = new Image();
    im.onload = () => {
      try { cacheImage?.(url, im); } catch {}
      resolve(im);
    };
    im.onerror = reject;
    im.src = url;
  });

  /** 현재 프레임 이미지 불러오기 + 이웃 프리패치 */
  useEffect(() => {
    const meta = frames?.[cur];
    if (!meta?.url) { setImg(null); return; }
    let alive = true;
    loadImage(meta.url).then(im => {
      if (!alive) return;
      setImg(im);
      setImgSize({ w: im.naturalWidth || im.width, h: im.naturalHeight || im.height });
    }).catch(()=>{ if (alive) setImg(null); });
    // 프리패치
    if (typeof prefetchAround === 'function') prefetchAround(cur, 2);
    else {
      const neighbors = [-2,-1,1,2].map(d => frames?.[cur + d]).filter(Boolean);
      neighbors.forEach((m:any) => m?.url && loadImage(m.url).catch(()=>{}));
    }
    return () => { alive = false; };
  }, [frames, cur]);

  /** 현재 프레임 번호 */
  const fnum = useMemo(() => {
    const meta = frames?.[cur];
    return meta?.i ?? (cur + 1);
  }, [frames, cur]);

  /** 현재 프레임 GT/Pred — 서버에서 지연 로드 */
  useEffect(() => {
    let closed = false;
    (async () => {
      // GT
      if (gtAnnotationId) {
        try {
          const flat = await fetchFrameBoxes(gtAnnotationId, fnum);
          if (!closed) setGtFrame(toBoxArray(fnum, flat));
        } catch { if (!closed) setGtFrame([]); }
      } else {
        setGtFrame([]);
      }
      // Pred
      if (predAnnotationId) {
        try {
          const flat = await fetchFrameBoxes(predAnnotationId, fnum);
          if (!closed) setPrFrame(toBoxArray(fnum, flat));
        } catch { if (!closed) setPrFrame([]); }
      } else {
        setPrFrame([]);
      }
    })();
    return () => { closed = true; };
  }, [gtAnnotationId, predAnnotationId, fnum]);

  /** 오버라이드 적용 + IoU/Conf 필터 */
  const gtBoxes = useMemo<Box[]>(() => (showGT ? gtFrame : []), [gtFrame, showGT]);

  const prBoxesBase = useMemo<Box[]>(() => {
    const raw = showPred ? prFrame : [];
    return raw.map(b => {
      const ov = getPredBox?.(fnum, b.id, b);
      return ov && typeof ov === 'object' ? ({ ...ov, conf: (ov as any).conf ?? b.conf }) : b;
    });
  }, [prFrame, showPred, fnum, getPredBox, overrideVersion]);

  const iouThr  = useMemo(() => (Number.isFinite(iou)  ? Number(iou)  : 0.5), [iou]);
  const confThr = useMemo(() => (Number.isFinite(conf) ? Number(conf) : 0.0), [conf]);

  const prBoxesFiltered = useMemo<Box[]>(() => {
    const byConf = prBoxesBase.filter(pb => (pb.conf ?? 1) >= confThr);
    if (!gtBoxes?.length) return byConf; // GT 없으면 Conf만 적용
    return byConf.filter(pb => gtBoxes.some(g => iouRect(g, pb) >= iouThr));
  }, [prBoxesBase, gtBoxes, iouThr, confThr]);

  /** 드래그/리사이즈 상태 */
  const [drag, setDrag] = useState<{ id: number|null; kind: DragKind | null; startX: number; startY: number; orig: Box | null; }>({
    id: null, kind: null, startX: 0, startY: 0, orig: null
  });

  /** 좌표 변환 */
  function clientToImage(px:number, py:number){
    const { scale, ox, oy } = fit;
    const ix = (px - ox) / (scale || 1);
    const iy = (py - oy) / (scale || 1);
    return { ix, iy };
  }
  function imageToDisplay(x:number, y:number, w:number, h:number){
    const { scale, ox, oy } = fit;
    return { dx: Math.round(ox + x*scale), dy: Math.round(oy + y*scale), dw: Math.round(w*scale), dh: Math.round(h*scale) };
  }

  /** 히트 테스트 */
  function handleRectsImage(b: Box){
    const half = HANDLE_SIZE / (fit.scale || 1) / 2;
    const { x, y, w, h } = b;
    return {
      nw: { x: x - half,     y: y - half,     w: 2*half, h: 2*half },
      ne: { x: x + w - half, y: y - half,     w: 2*half, h: 2*half },
      sw: { x: x - half,     y: y + h - half, w: 2*half, h: 2*half },
      se: { x: x + w - half, y: y + h - half, w: 2*half, h: 2*half },
    };
  }
  function pointInRect(px:number, py:number, r:{x:number;y:number;w:number;h:number}){
    return px >= r.x && py >= r.y && px <= r.x + r.w && py <= r.y + r.h;
  }
  function hitTestImage(ix:number, iy:number){
    for (let i = prBoxesFiltered.length - 1; i >= 0; i--) {
      const b = prBoxesFiltered[i];
      const hr = handleRectsImage(b);
      if (pointInRect(ix, iy, hr.nw)) return { id: b.id, kind: 'nw' as DragKind, box: b };
      if (pointInRect(ix, iy, hr.ne)) return { id: b.id, kind: 'ne' as DragKind, box: b };
      if (pointInRect(ix, iy, hr.sw)) return { id: b.id, kind: 'sw' as DragKind, box: b };
      if (pointInRect(ix, iy, hr.se)) return { id: b.id, kind: 'se' as DragKind, box: b };
      if (pointInRect(ix, iy, { x: b.x, y: b.y, w: b.w, h: b.h })) return { id: b.id, kind: 'move' as DragKind, box: b };
    }
    return null;
  }

  /** 마우스 핸들러 */
  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>){
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { ix, iy } = clientToImage(px, py);

    const hit = hitTestImage(ix, iy);
    const el = e.currentTarget as HTMLCanvasElement;
    if (hit) {
      el.style.cursor =
        hit.kind === 'move' ? 'move' :
        hit.kind === 'nw' || hit.kind === 'se' ? 'nwse-resize' :
        'nesw-resize';
    } else {
      el.style.cursor = 'default';
    }

    if (drag.id == null || !drag.kind || !drag.orig) return;

    const dx = ix - drag.startX;
    const dy = iy - drag.startY;
    let nx = drag.orig.x, ny = drag.orig.y, nw = drag.orig.w, nh = drag.orig.h;

    switch(drag.kind){
      case 'move':
        nx = drag.orig.x + dx; ny = drag.orig.y + dy; break;
      case 'nw':
        nx = drag.orig.x + dx; ny = drag.orig.y + dy;
        nw = drag.orig.w - dx; nh = drag.orig.h - dy; break;
      case 'ne':
        ny = drag.orig.y + dy;
        nw = drag.orig.w + dx; nh = drag.orig.h - dy; break;
      case 'sw':
        nx = drag.orig.x + dx;
        nw = drag.orig.w - dx; nh = drag.orig.h + dy; break;
      case 'se':
        nw = drag.orig.w + dx; nh = drag.orig.h + dy; break;
    }

    if (nw < MIN_W) { nw = MIN_W; if (drag.kind === 'nw' || drag.kind === 'sw') nx = drag.orig.x + (drag.orig.w - nw); }
    if (nh < MIN_H) { nh = MIN_H; if (drag.kind === 'nw' || drag.kind === 'ne') ny = drag.orig.y + (drag.orig.h - nh); }

    const target = prBoxesFiltered.find(b => b.id === drag.id);
    const confKeep = target?.conf ?? drag.orig.conf;
    applyOverride?.(fnum, drag.id, { x: nx, y: ny, w: nw, h: nh, id: drag.id, conf: confKeep });
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>){
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { ix, iy } = clientToImage(px, py);
    const hit = hitTestImage(ix, iy);
    if (hit){
      setDrag({ id: hit.id, kind: hit.kind, startX: ix, startY: iy, orig: { ...hit.box } });
      (e.currentTarget as HTMLCanvasElement).style.cursor =
        hit.kind === 'move' ? 'move' :
        hit.kind === 'nw' || hit.kind === 'se' ? 'nwse-resize' :
        'nesw-resize';
    } else {
      setDrag({ id: null, kind: null, startX: 0, startY: 0, orig: null });
    }
  }
  function onMouseUp(){ setDrag({ id: null, kind: null, startX: 0, startY: 0, orig: null }); }

  /** 렌더링 */
  useEffect(() => {
    const cvs = canvasRef.current;
    const ctx = cvs?.getContext('2d');
    if (!cvs || !ctx) return;

    cvs.width = wrapSize.w;
    cvs.height = wrapSize.h;
    ctx.clearRect(0, 0, cvs.width, cvs.height);

    const { dw, dh, ox, oy } = fit;
    if (img) ctx.drawImage(img, ox, oy, dw, dh);

    const drawRect = (b:Box, stroke:string, fill:string) => {
      const a = imageToDisplay(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = stroke;
      ctx.fillStyle = fill;
      ctx.lineWidth = 2;
      ctx.strokeRect(a.dx, a.dy, a.dw, a.dh);
      ctx.fillRect(a.dx, a.dy, a.dw, a.dh);
    };
    const drawLabelTop = (b:Box, bg:string, fg:string, text:string) => {
      ctx.font = '14px ui-sans-serif, system-ui, -apple-system';
      const tw = ctx.measureText(text).width + 8;
      const a = imageToDisplay(b.x, b.y, b.w, b.h);
      const tx = Math.max(4, Math.min(cvs.width - tw - 4, a.dx));
      const ty = Math.max(16, a.dy - 6);
      ctx.fillStyle = bg;
      ctx.fillRect(tx, ty - 16, tw, 16);
      ctx.fillStyle = fg;
      ctx.fillText(text, tx + 4, ty - 3);
    };
    const handleRectsDisp = (b:Box) => {
      const half = HANDLE_SIZE/2;
      const a = imageToDisplay(b.x, b.y, b.w, b.h);
      const nw = { x: a.dx - half,         y: a.dy - half,         w: HANDLE_SIZE, h: HANDLE_SIZE };
      const ne = { x: a.dx + a.dw - half,  y: a.dy - half,         w: HANDLE_SIZE, h: HANDLE_SIZE };
      const sw = { x: a.dx - half,         y: a.dy + a.dh - half,  w: HANDLE_SIZE, h: HANDLE_SIZE };
      const se = { x: a.dx + a.dw - half,  y: a.dy + a.dh - half,  w: HANDLE_SIZE, h: HANDLE_SIZE };
      return { nw, ne, sw, se };
    };

    // GT
    if (showGT) {
      for (const b of gtBoxes) {
        drawRect(b, '#00e676', 'rgba(0,230,118,0.20)');
        drawLabelTop(b, 'rgba(0,230,118,0.9)', '#000', String(b.id));
      }
    }

    // Pred (필터 적용 후 + 핸들)
    for (const b of prBoxesFiltered) {
      drawRect(b, '#ff5252', 'rgba(255,82,82,0.18)');
      const confStr = (b.conf==null ? '' : ` (${Math.max(0, Math.min(1, b.conf)).toFixed(2)})`);
      drawLabelTop(b, 'rgba(255,82,82,0.9)', '#000', `${b.id}${confStr}`);
      const hr = handleRectsDisp(b);
      ctx.fillStyle = '#ff5252';
      ctx.fillRect(hr.nw.x, hr.nw.y, hr.nw.w, hr.nw.h);
      ctx.fillRect(hr.ne.x, hr.ne.y, hr.ne.w, hr.ne.h);
      ctx.fillRect(hr.sw.x, hr.sw.y, hr.sw.w, hr.sw.h);
      ctx.fillRect(hr.se.x, hr.se.y, hr.se.w, hr.se.h);
    }

    // HUD
    ctx.fillStyle = '#111';
    const shown = prBoxesFiltered.length, total = prFrame.length;
    const hud = `pred shown: ${shown} / ${total} (IoU ≥ ${(Number.isFinite(iou)?Number(iou):0.5).toFixed(2)}, conf ≥ ${(Number.isFinite(conf)?Number(conf):0.0).toFixed(2)})`;
    const w = ctx.measureText(hud).width + 12;
    const y = cvs.height - 10;
    ctx.fillRect(8, y - 16, w, 16);
    ctx.fillStyle = '#fff';
    ctx.fillText(hud, 14, y - 4);
  }, [img, wrapSize, fit, gtBoxes, prBoxesFiltered, prFrame.length, showGT, iou, conf, overrideVersion]);

  return (
    <div ref={wrapRef} className="w-full h-full overflow-hidden">
      <canvas
        ref={canvasRef}
        style={{ display:'block', width:'100%', height:'100%', cursor:'default' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      />
    </div>
  );
}

