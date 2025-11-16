// frontend/src/workers/overlay.worker.ts
// Worker for OffscreenCanvas overlay drawing (PoC)

self.onmessage = async (ev) => {
  const data = ev.data || {};
  try {
    if (data.type === 'init') {
      // data.canvas is an OffscreenCanvas transferred
      const off = data.canvas as OffscreenCanvas;
      // store in worker scope
      (self as any).__off = off;
      (self as any).__ctx = off.getContext('2d');
      return;
    }
    if (data.type === 'draw') {
      const ctx = (self as any).__ctx as OffscreenCanvasRenderingContext2D;
      const off = (self as any).__off as OffscreenCanvas;
      if (!ctx || !off) return;

      const img = data.img as ImageBitmap | null;
      const boxes = data.boxes || { gt: [], pred: [] };
      const layout = data.layout || { ox:0, oy:0, dw:off.width, dh:off.height, s:1 };

      // clear
      ctx.clearRect(0,0,off.width, off.height);
      if (img) {
        try { ctx.drawImage(img, layout.ox, layout.oy, layout.dw, layout.dh); } catch {}
      } else {
        ctx.fillStyle = '#f7f7f7'; ctx.fillRect(0,0,off.width, off.height);
      }

      // draw GT
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(80,220,120,0.95)'; ctx.fillStyle='rgba(80,220,120,0.18)';
      for (let i=0;i<boxes.gt.length;i++){
        const g = boxes.gt[i];
        const bb = g.bbox;
        const px = layout.ox + bb[0]*layout.s;
        const py = layout.oy + bb[1]*layout.s;
        const cw = bb[2]*layout.s, ch = bb[3]*layout.s;
        ctx.beginPath(); ctx.rect(px, py, cw, ch); ctx.fill(); ctx.stroke();
      }

      // draw Pred
      ctx.strokeStyle='rgba(255,140,0,0.95)'; ctx.fillStyle='rgba(255,140,0,0.18)';
      for (let i=0;i<boxes.pred.length;i++){
        const p = boxes.pred[i];
        const bb = p.bbox;
        const px = layout.ox + bb[0]*layout.s;
        const py = layout.oy + bb[1]*layout.s;
        const cw = bb[2]*layout.s, ch = bb[3]*layout.s;
        ctx.beginPath(); ctx.rect(px, py, cw, ch); ctx.fill(); ctx.stroke();
      }

      // no need to post back; canvas is visible
      return;
    }
  } catch (e) {
    // swallow
    // @ts-ignore
    console.warn('worker draw error', e);
  }
};
