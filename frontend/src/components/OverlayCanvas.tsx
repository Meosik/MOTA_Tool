// frontend/src/components/OverlayCanvas.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import useFrameStore from '../store/frameStore';

type Box = { x:number; y:number; w:number; h:number; id:number; conf?: number };
type MotRecord = { frame:number; id:number; x:number; y:number; w:number; h:number; conf?: number };

function filterFrame(arr: MotRecord[], f: number): Box[] {
  return arr
    .filter(r => Number(r.frame) === Number(f))
    .map(r => ({ x:r.x, y:r.y, w:r.w, h:r.h, id:Number(r.id), conf: r.conf }));
}

// IoU on (x,y,w,h)
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
    frames, cur, gt, pred,
    showGT, showPred, iou, conf,
    getPredBox, applyOverride,
  } = useFrameStore() as any;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [size, setSize] = useState<{w:number; h:number}>({w: 1280, h: 720});

  // current frame image
  useEffect(() => {
    const meta = frames?.[cur];
    if (!meta?.url) { setImg(null); return; }
    const im = new Image();
    im.onload = () => {
      setSize({ w: im.naturalWidth || im.width, h: im.naturalHeight || im.height });
      setImg(im);
    };
    im.src = meta.url;
  }, [frames, cur]);

  const fnum = useMemo(() => {
    const meta = frames?.[cur];
    return meta?.i ?? (cur + 1);
  }, [frames, cur]);

  const gtBoxes = useMemo<Box[]>(() => filterFrame(gt || [], fnum), [gt, fnum]);

  // pred 원본(+override 반영)
  const prBoxesBase = useMemo<Box[]>(() => {
    const raw = filterFrame(pred || [], fnum);
    return raw.map(b => {
      const ov = getPredBox?.(fnum, b.id, b);
      // override가 conf를 잃었으면 원본 conf 유지
      return ov && typeof ov === 'object' ? ({ ...ov, conf: (ov as any).conf ?? b.conf }) : b;
    });
  }, [pred, fnum, getPredBox]);

  // thresholds
  const iouThr  = useMemo(() => (Number.isFinite(iou)  ? Number(iou)  : 0.5), [iou]);
  const confThr = useMemo(() => (Number.isFinite(conf) ? Number(conf) : 0.0), [conf]);

  // 필터: (1) confidence, (2) IoU(대상 프레임에 GT가 있을 때만)
  const prBoxesFiltered = useMemo<Box[]>(() => {
    if (!showPred) return [];
    const byConf = prBoxesBase.filter(pb => (pb.conf ?? 1) >= confThr);
    if (!gtBoxes?.length) return byConf; // GT 없음 → conf만 필터
    return byConf.filter(pb => {
      for (const g of gtBoxes) if (iouRect(g, pb) >= iouThr) return true;
      return false;
    });
  }, [prBoxesBase, gtBoxes, iouThr, confThr, showPred]);

  // drag-move (보이는 pred만 조작)
  const [drag, setDrag] = useState<{ id:number|null; dx:number; dy:number; start?:{x:number;y:number} }>({
    id: null, dx: 0, dy: 0
  });

  function hitBox(x:number, y:number, boxes: Box[]): number | null {
    for (let i = boxes.length - 1; i >= 0; i--) {
      const b = boxes[i];
      if (x >= b.x && y >= b.y && x <= b.x + b.w && y <= b.y + b.h) return b.id;
    }
    return null;
  }

  function onDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const id = hitBox(px, py, prBoxesFiltered);
    if (id != null) {
      setDrag({ id, dx: px, dy: py, start: { x: px, y: py } });
    }
  }

  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (drag.id == null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const ddx = px - (drag.dx);
    const ddy = py - (drag.dy);
    setDrag(prev => ({ ...prev, dx: px, dy: py }));

    const target = prBoxesFiltered.find(b => b.id === drag.id);
    if (target) {
      const moved: Box = { ...target, x: target.x + ddx, y: target.y + ddy, conf: target.conf };
      applyOverride?.(fnum, target.id, moved);
    }
  }

  function onUp() {
    setDrag({ id: null, dx: 0, dy: 0, start: undefined });
  }

  // draw
  useEffect(() => {
    const cvs = canvasRef.current;
    const ctx = cvs?.getContext('2d');
    if (!cvs || !ctx) return;

    cvs.width = size.w;
    cvs.height = size.h;

    ctx.clearRect(0, 0, cvs.width, cvs.height);
    if (img) ctx.drawImage(img, 0, 0, size.w, size.h);

    // GT
    if (showGT) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#00e676';
      ctx.font = '14px ui-sans-serif, system-ui, -apple-system';
      ctx.fillStyle = 'rgba(0,230,118,0.25)';
      for (const b of gtBoxes) {
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = '#00e676';
        ctx.fillText(String(b.id), b.x + 4, b.y + 16);
        ctx.fillStyle = 'rgba(0,230,118,0.25)';
      }
    }

    // Pred (IoU + conf)
    if (showPred) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ff5252';
      ctx.font = '14px ui-sans-serif, system-ui, -apple-system';
      ctx.fillStyle = 'rgba(255,82,82,0.2)';
      for (const b of prBoxesFiltered) {
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = '#ff5252';
        const label = (b.conf==null ? `${b.id}` : `${b.id}  (${Math.max(0, Math.min(1, b.conf)).toFixed(2)})`);
        ctx.fillText(label, b.x + 4, b.y + 16);
        ctx.fillStyle = 'rgba(255,82,82,0.2)';
      }

      // HUD
      ctx.fillStyle = '#111';
      const shown = prBoxesFiltered.length, total = prBoxesBase.length;
      const txt = `pred shown: ${shown} / ${total} (IoU ≥ ${iouThr.toFixed(2)}, conf ≥ ${confThr.toFixed(2)})`;
      const w = ctx.measureText(txt).width + 12;
      ctx.fillRect(8, size.h - 28, w, 22);
      ctx.fillStyle = '#fff';
      ctx.fillText(txt, 14, size.h - 12);
    }
  }, [img, size, gtBoxes, prBoxesFiltered, prBoxesBase.length, showGT, showPred, iouThr, confThr]);

  return (
    <div className="relative w-full h-full overflow-auto">
      <canvas
        ref={canvasRef}
        style={{ display:'block', width:'100%', height:'auto', imageRendering:'pixelated' }}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
      />
    </div>
  );
}
