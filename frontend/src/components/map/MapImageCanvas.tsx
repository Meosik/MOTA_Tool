import type { Annotation } from '../../types/annotation';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useMapStore } from '../../store/mapStore';

interface MapImageCanvasProps {
  annotationId: string | null;
  gtAnnotationId?: string | null;
  predAnnotationId?: string | null;
  imageUrl?: string | null;
  interactive?: boolean;
}

const COLORS = {
  gtStroke: 'rgba(80, 220, 120, 0.95)',
  gtFill:   'rgba(80, 220, 120, 0.18)',
  predStroke: 'rgba(255, 140, 0, 0.95)',
  predFill:   'rgba(255, 140, 0, 0.18)',
};
const LINE_W = 2;

type Vec = { x: number; y: number };

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

export default function MapImageCanvas({ 
  annotationId, 
  gtAnnotationId,
  predAnnotationId,
  imageUrl,
  interactive = false 
}: MapImageCanvasProps) {
  const { currentImageIndex, getImageUrl, gtAnnotations, predAnnotations, images } = useMapStore();
  const cnvRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement|null>(null);

  // Get the current image
  const currentImage = useMemo(() => {
    return images[currentImageIndex] || null;
  }, [images, currentImageIndex]);

  // Get the current image URL from the store
  const displayImageUrl = useMemo(() => {
    if (imageUrl) return imageUrl;
    if (!currentImage) return null;
    return getImageUrl(currentImageIndex);
  }, [imageUrl, currentImage, currentImageIndex, getImageUrl]);

  // Filter annotations for current image (image_id matches currentImageIndex + 1)
  const currentImageId = currentImageIndex + 1;
  
  // More lenient filtering: if no image_id OR matches current image
  const gt = useMemo(() => {
    console.log('Filtering GT annotations:', {
      totalGt: gtAnnotations.length,
      currentImageId,
      sampleAnn: gtAnnotations[0]
    });
    const filtered = gtAnnotations.filter(ann => {
      // If no image_id field, show all (for non-COCO formats)
      if (!ann.image_id) return true;
      // Otherwise match current image
      return ann.image_id === currentImageId;
    });
    console.log('Filtered GT result:', filtered.length);
    return filtered;
  }, [gtAnnotations, currentImageId]);
  
  const pred = useMemo(() => {
    console.log('Filtering Pred annotations:', {
      totalPred: predAnnotations.length,
      currentImageId,
      sampleAnn: predAnnotations[0]
    });
    const filtered = predAnnotations.filter(ann => {
      // If no image_id field, show all (for non-COCO formats)
      if (!ann.image_id) return true;
      // Otherwise match current image
      return ann.image_id === currentImageId;
    });
    console.log('Filtered Pred result:', filtered.length);
    return filtered;
  }, [predAnnotations, currentImageId]);

  console.log('MapImageCanvas:', { 
    currentImageIndex, 
    currentImageId, 
    imageUrl: displayImageUrl?.substring(0, 50),
    gtCount: gt.length,
    predCount: pred.length,
    totalGt: gtAnnotations.length,
    totalPred: predAnnotations.length,
    hasImage: !!currentImage,
    gtSample: gt[0],
    predSample: pred[0]
  });

  // Calculate layout (same as MOTA OverlayCanvas)
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

  // Load image when URL changes
  useEffect(()=>{
    if (!displayImageUrl) { 
      console.log('MapImageCanvas: No displayImageUrl');
      setImg(null); 
      return; 
    }
    console.log('MapImageCanvas: Loading image from:', displayImageUrl.substring(0, 50));
    const image = new Image();
    image.onload = () => {
      console.log('MapImageCanvas: Image loaded successfully', image.width, 'x', image.height);
      setImg(image);
    };
    image.onerror = (err) => {
      console.error('MapImageCanvas: Image loading failed', err);
      setImg(null);
    };
    image.src = displayImageUrl;
  }, [displayImageUrl]);

  // Draw canvas
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
    
    // Clear canvas FIRST
    ctx.clearRect(0,0,cssW,cssH);

    // Draw image
    if (img) {
      ctx.drawImage(img, layout.ox, layout.oy, layout.dw, layout.dh);
      console.log('MapImageCanvas: Drew image', { layout });
    } else { 
      ctx.fillStyle='#f7f7f7'; 
      ctx.fillRect(0,0,cssW,cssH); 
    }

    // Draw GT boxes (ON TOP of image)
    if (gt.length > 0){
      ctx.lineWidth = 3;  // Thicker for visibility
      ctx.strokeStyle = 'rgba(80, 220, 120, 1.0)';  // Fully opaque
      ctx.fillStyle   = 'rgba(80, 220, 120, 0.25)'; // Semi-transparent fill

      for (const g of gt){
        const [x,y,w,h] = g.bbox;
        const p = toCanvas({x,y});
        const cw = w*layout.s, ch = h*layout.s;

        ctx.beginPath(); 
        ctx.rect(p.x, p.y, cw, ch); 
        ctx.fill(); 
        ctx.stroke();
        drawIdLabel(ctx, String(g.id || g.category || 'GT'), p.x, Math.max(12, p.y - 4), 'rgba(80, 220, 120, 1.0)');
      }
      console.log('MapImageCanvas: Drew', gt.length, 'GT boxes (green)');
    }

    // Draw Pred boxes (ON TOP of image)
    if (pred.length > 0){
      ctx.lineWidth = 3;  // Thicker for visibility
      ctx.strokeStyle = 'rgba(255, 140, 0, 1.0)';  // Fully opaque
      ctx.fillStyle   = 'rgba(255, 140, 0, 0.25)'; // Semi-transparent fill

      for (const b of pred){
        const [x,y,w,h] = b.bbox;
        const p = toCanvas({x,y});
        const cw = w*layout.s, ch = h*layout.s;

        ctx.beginPath(); 
        ctx.rect(p.x, p.y, cw, ch); 
        ctx.fill(); 
        ctx.stroke();
        const label = b.conf !== undefined ? `${b.id || b.category || ''} ${b.conf.toFixed(2)}` : String(b.id || b.category || 'Pred');
        drawIdLabel(ctx, label, p.x, Math.max(12, p.y - 4), 'rgba(255, 140, 0, 1.0)');
      }
      console.log('MapImageCanvas: Drew', pred.length, 'Pred boxes (orange)');
    }

    console.log('MapImageCanvas: Finished drawing', { gtCount: gt.length, predCount: pred.length });
  }, [img, layout.W, layout.H, layout.ox, layout.oy, layout.s, layout.dw, layout.dh, gt, pred]);

  if (!displayImageUrl && !currentImage) {
    return <div className="flex-1 flex items-center justify-center text-gray-400">이미지를 선택하세요</div>;
  }

  return (
    <div className="relative w-full h-full bg-black/2 select-none">
      <canvas
        ref={cnvRef}
        className="w-full h-full block"
      />
    </div>
  );
}