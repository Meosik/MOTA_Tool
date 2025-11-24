import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Annotation } from '../../types/annotation';
import { useMapStore } from '../../store/mapStore';
import { getCategoryIdByName, getCategoryNameById } from '../../constants/cocoCategories';

interface InteractiveCanvasProps {
  imageUrl: string | null;
  gtAnnotations: Annotation[];
  predAnnotations: Annotation[];
  visibleCategories: Set<number>;
  confidenceThreshold: number;
  iouThreshold?: number;
  onAnnotationUpdate?: (annotation: Annotation) => void;
  categories?: Record<number, { name: string; color?: string }>;
}

// Calculate IoU (Intersection over Union) between two bounding boxes
function calculateIoU(box1: [number, number, number, number], box2: [number, number, number, number]): number {
  const [x1, y1, w1, h1] = box1;
  const [x2, y2, w2, h2] = box2;
  
  // Calculate intersection
  const xLeft = Math.max(x1, x2);
  const yTop = Math.max(y1, y2);
  const xRight = Math.min(x1 + w1, x2 + w2);
  const yBottom = Math.min(y1 + h1, y2 + h2);
  
  if (xRight < xLeft || yBottom < yTop) {
    return 0.0;  // No intersection
  }
  
  const intersectionArea = (xRight - xLeft) * (yBottom - yTop);
  const box1Area = w1 * h1;
  const box2Area = w2 * h2;
  const unionArea = box1Area + box2Area - intersectionArea;
  
  return unionArea > 0 ? intersectionArea / unionArea : 0.0;
}

type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r';

type DragState = {
  active: boolean;
  annotation: Annotation | null;
  annotationIndex: number;  // Index in predAnnotations array
  startX: number;
  startY: number;
  handle: 'move' | ResizeHandle | 'pan' | null;
};

const CATEGORY_COLORS = [
  '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
  '#800000', '#008000', '#000080', '#808000', '#800080', '#008080',
];

export default function InteractiveCanvas({
  imageUrl,
  gtAnnotations,
  predAnnotations,
  visibleCategories,
  confidenceThreshold,
  iouThreshold = 0.0,
  onAnnotationUpdate,
  categories = {}
}: InteractiveCanvasProps) {
  // Read thresholds and visibility from store (like MOTA mode's OverlayCanvas)
  const iouThr = useMapStore(s => s.iou);
  const confThr = useMapStore(s => s.conf);
  const visibleInstances = useMapStore(s => s.visibleInstances);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [dragState, setDragState] = useState<DragState>({
    active: false,
    annotation: null,
    annotationIndex: -1,
    startX: 0,
    startY: 0,
    handle: null
  });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [pickerPosition, setPickerPosition] = useState({ x: 0, y: 0 });
  const [categoryInputValue, setCategoryInputValue] = useState('');
  const [categoryErrorMsg, setCategoryErrorMsg] = useState('');

  const getCategoryColor = (categoryId: number | undefined, isGt: boolean) => {
    if (isGt) return '#22c55e'; // Green for GT
    if (categoryId !== undefined && categories[categoryId]?.color) {
      return categories[categoryId].color;
    }
    return categoryId !== undefined ? CATEGORY_COLORS[categoryId % CATEGORY_COLORS.length] : '#6366f1';
  };

  const drawAnnotations = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !img.complete) return;
    // Prepare offscreen buffer
    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement('canvas');
      offscreenRef.current.width = canvas.width;
      offscreenRef.current.height = canvas.height;
    } else if (offscreenRef.current.width !== canvas.width || offscreenRef.current.height !== canvas.height) {
      offscreenRef.current.width = canvas.width;
      offscreenRef.current.height = canvas.height;
    }
    const ctx = offscreenRef.current.getContext('2d');
    if (!ctx) return;
    // Clear offscreen
    ctx.clearRect(0, 0, offscreenRef.current.width, offscreenRef.current.height);
    // Draw image
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    ctx.restore();

    // If dragging, replace the annotation being dragged with the updated version from dragState
    let predToRender = predAnnotations;
    if (dragState.active && dragState.annotation && dragState.annotationIndex >= 0) {
      predToRender = predAnnotations.map((ann, idx) => 
        idx === dragState.annotationIndex ? dragState.annotation! : ann
      );
    }

    // Filter GT annotations
    const filteredGt = gtAnnotations.filter(ann => {
      // Check instance visibility
      if (visibleInstances.size > 0 && !visibleInstances.has(`gt-${ann.id}`)) return false;
      
      // Check visible categories
      return visibleCategories.size === 0 || visibleCategories.has(ann.category as any);
    });

    // Filter pred annotations by confidence and visibility ONLY (IoU not for hiding; used only for TP/FP classification per COCO)
    const filteredPred = predToRender.filter(ann => {
      // Check instance visibility
      if (visibleInstances.size > 0 && !visibleInstances.has(`pred-${ann.id}`)) return false;
      
      // Check confidence threshold from store
      if ((ann.conf ?? 1) < confThr) return false;
      
      // Check visible categories
      if (visibleCategories.size > 0 && !visibleCategories.has(ann.category as any)) return false;
      
      return true;
    });

    // Classification for TP/FP relative to filteredGt using IoU threshold (COCO: IoU threshold determines TP vs FP, predictions are still shown)
    const gtMatched = new Set<number>();
    const tpPredIds = new Set<number>();
    filteredPred.forEach(p => {
      let bestIou = 0; let bestIdx = -1;
      filteredGt.forEach((g, idx) => {
        if (gtMatched.has(idx)) return;
        const iou = calculateIoU(p.bbox as any, g.bbox as any);
        if (iou > bestIou) { bestIou = iou; bestIdx = idx; }
      });
      if (bestIou >= iouThr && bestIdx >= 0) {
        gtMatched.add(bestIdx);
        tpPredIds.add(p.id as any);
      }
    });
    // Colors aligned with MOTA OverlayCanvas
    const COLOR_GT_STROKE = 'rgba(80, 220, 120, 0.95)';
    const COLOR_GT_FILL   = 'rgba(80, 220, 120, 0.18)';
    const COLOR_TP_STROKE = 'rgba(255, 140, 0, 0.95)';
    const COLOR_TP_FILL   = 'rgba(255, 140, 0, 0.18)';
    const COLOR_FP_STROKE = 'rgba(255, 0, 80, 0.95)';
    const COLOR_FP_FILL   = 'rgba(255, 0, 80, 0.18)';

    // Draw GT boxes
    filteredGt.forEach((g, idx) => {
      const [x,y,w,h] = g.bbox;
      const matched = gtMatched.has(idx);
      ctx.save(); ctx.translate(offset.x, offset.y); ctx.scale(scale, scale);
      ctx.strokeStyle = COLOR_GT_STROKE;
      ctx.lineWidth = 2;
      ctx.strokeRect(x,y,w,h);
      ctx.fillStyle = matched ? COLOR_GT_FILL : 'rgba(80,220,120,0.10)';
      ctx.fillRect(x,y,w,h);
      const label = categories[g.category as any]?.name ?? g.category;
      if (label) { ctx.fillStyle = COLOR_GT_STROKE; ctx.font='12px sans-serif'; ctx.fillText(String(label), x, y-4); }
      ctx.restore();
    });
    // Draw prediction boxes
    filteredPred.forEach(p => {
      const [x,y,w,h] = p.bbox;
      const isTP = tpPredIds.has(p.id as any);
      const strokeColor = isTP ? COLOR_TP_STROKE : COLOR_FP_STROKE;
      const fillColor   = isTP ? COLOR_TP_FILL   : COLOR_FP_FILL;
      const isSelected = selectedAnnotation?.id === p.id;
      ctx.save(); ctx.translate(offset.x, offset.y); ctx.scale(scale, scale);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.strokeRect(x,y,w,h);
      ctx.fillStyle = fillColor;
      ctx.fillRect(x,y,w,h);
      const label = categories[p.category as any]?.name ?? p.category;
      if (label) { ctx.fillStyle = strokeColor; ctx.font='12px sans-serif'; ctx.fillText(String(label), x, y-4); }
      // Resize handles if selected
      if (isSelected) {
        const handleSize = 8; const half = handleSize/2;
        ctx.fillStyle = strokeColor;
        ctx.fillRect(x-half, y-half, handleSize, handleSize);
        ctx.fillRect(x+w-half, y-half, handleSize, handleSize);
        ctx.fillRect(x-half, y+h-half, handleSize, handleSize);
        ctx.fillRect(x+w-half, y+h-half, handleSize, handleSize);
        ctx.fillRect(x+w/2-half, y-half, handleSize, handleSize);
        ctx.fillRect(x+w/2-half, y+h-half, handleSize, handleSize);
        ctx.fillRect(x-half, y+h/2-half, handleSize, handleSize);
        ctx.fillRect(x+w-half, y+h/2-half, handleSize, handleSize);
      }
      ctx.restore();
    });
    // Blit offscreen to visible to avoid flicker and prevent ghosting
    const visibleCtx = canvas.getContext('2d');
    if (visibleCtx && offscreenRef.current) {
      // Use 'copy' to fully replace previous frame (no transparent ghosting)
      visibleCtx.save();
      visibleCtx.globalCompositeOperation = 'copy';
      visibleCtx.drawImage(offscreenRef.current, 0, 0);
      visibleCtx.restore();
    }
  }, [gtAnnotations, predAnnotations, visibleCategories, confThr, iouThr, visibleInstances, scale, offset, selectedAnnotation, categories, dragState]);

  // Debounce rapid slider changes to prevent flicker
  const redrawPending = useRef<number | null>(null);
  useEffect(() => {
    if (redrawPending.current) cancelAnimationFrame(redrawPending.current);
    redrawPending.current = requestAnimationFrame(() => { drawAnnotations(); });
    return () => { if (redrawPending.current) cancelAnimationFrame(redrawPending.current); };
  }, [drawAnnotations]);

  useEffect(() => {
    if (!imageUrl) {
      console.log('InteractiveCanvas: No imageUrl provided');
      return;
    }

    console.log('InteractiveCanvas: Loading image from URL:', imageUrl.substring(0, 50));
    const img = new Image();
    img.onload = () => {
      console.log('InteractiveCanvas: Image loaded successfully', img.width, 'x', img.height);
      imageRef.current = img;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      
      if (canvas && container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        
        // Fit image to canvas
        const scaleX = canvas.width / img.width;
        const scaleY = canvas.height / img.height;
        const newScale = Math.min(scaleX, scaleY) * 0.9;
        setScale(newScale);
        setOffset({
          x: (canvas.width - img.width * newScale) / 2,
          y: (canvas.height - img.height * newScale) / 2
        });
        console.log('InteractiveCanvas: Canvas setup complete', { scale: newScale, offset: { x: (canvas.width - img.width * newScale) / 2, y: (canvas.height - img.height * newScale) / 2 } });
      }
    };
    img.onerror = (err) => {
      console.error('InteractiveCanvas: Image loading failed', err);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Initial draw still relies on debounced effect above

  const canvasToImageCoords = (canvasX: number, canvasY: number) => {
    return {
      x: (canvasX - offset.x) / scale,
      y: (canvasY - offset.y) / scale
    };
  };

  const findAnnotationAt = (x: number, y: number): { annotation: Annotation; index: number; handle: 'move' | ResizeHandle } | null => {
    const imgCoords = canvasToImageCoords(x, y);
    const handleSize = 10; // Detection area for handles
    
    // Check predictions only (GT is not editable)
    for (let i = predAnnotations.length - 1; i >= 0; i--) {
      const ann = predAnnotations[i];
      const [bx, by, bw, bh] = ann.bbox;
      
      // Check corner handles first
      if (Math.abs(imgCoords.x - bx) < handleSize && Math.abs(imgCoords.y - by) < handleSize) {
        return { annotation: ann, index: i, handle: 'tl' }; // Top-left
      }
      if (Math.abs(imgCoords.x - (bx + bw)) < handleSize && Math.abs(imgCoords.y - by) < handleSize) {
        return { annotation: ann, index: i, handle: 'tr' }; // Top-right
      }
      if (Math.abs(imgCoords.x - bx) < handleSize && Math.abs(imgCoords.y - (by + bh)) < handleSize) {
        return { annotation: ann, index: i, handle: 'bl' }; // Bottom-left
      }
      if (Math.abs(imgCoords.x - (bx + bw)) < handleSize && Math.abs(imgCoords.y - (by + bh)) < handleSize) {
        return { annotation: ann, index: i, handle: 'br' }; // Bottom-right
      }
      
      // Check edge handles
      if (Math.abs(imgCoords.x - (bx + bw/2)) < handleSize && Math.abs(imgCoords.y - by) < handleSize) {
        return { annotation: ann, index: i, handle: 't' }; // Top
      }
      if (Math.abs(imgCoords.x - (bx + bw/2)) < handleSize && Math.abs(imgCoords.y - (by + bh)) < handleSize) {
        return { annotation: ann, index: i, handle: 'b' }; // Bottom
      }
      if (Math.abs(imgCoords.x - bx) < handleSize && Math.abs(imgCoords.y - (by + bh/2)) < handleSize) {
        return { annotation: ann, index: i, handle: 'l' }; // Left
      }
      if (Math.abs(imgCoords.x - (bx + bw)) < handleSize && Math.abs(imgCoords.y - (by + bh/2)) < handleSize) {
        return { annotation: ann, index: i, handle: 'r' }; // Right
      }
      
      // Check if inside bbox
      if (imgCoords.x >= bx && imgCoords.x <= bx + bw && imgCoords.y >= by && imgCoords.y <= by + bh) {
        return { annotation: ann, index: i, handle: 'move' };
      }
    }
    
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const hit = findAnnotationAt(x, y);
    if (hit) {
      setDragState({
        active: true,
        annotation: hit.annotation,
        annotationIndex: hit.index,
        startX: x,
        startY: y,
        handle: hit.handle
      });
      setSelectedAnnotation(hit.annotation);
      e.preventDefault();
    } else {
      // Start panning when clicking empty area
      setDragState({
        active: true,
        annotation: null,
        annotationIndex: -1,
        startX: x,
        startY: y,
        handle: 'pan'
      });
      setSelectedAnnotation(null);
      setShowCategoryPicker(false);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const hit = findAnnotationAt(x, y);
    if (hit && hit.handle === 'move') {
      // Show category picker for the selected annotation
      setSelectedAnnotation(hit.annotation);
      setPickerPosition({ x: e.clientX, y: e.clientY });
      // Initialize input value with current category name
      setCategoryInputValue(getCategoryNameById(hit.annotation.category as number) || '');
      setCategoryErrorMsg('');
      setShowCategoryPicker(true);
      e.preventDefault();
    }
  };

  const handleCategoryChange = (newCategoryId: number) => {
    if (selectedAnnotation && onAnnotationUpdate) {
      // image_id, id를 항상 유지
      const updatedAnnotation = { ...selectedAnnotation, category: newCategoryId, image_id: selectedAnnotation.image_id, id: selectedAnnotation.id };
      onAnnotationUpdate(updatedAnnotation);
      setSelectedAnnotation(updatedAnnotation);
    }
    setShowCategoryPicker(false);
  };

  const getCursorForHandle = (handle: string): string => {
    const cursorMap: Record<string, string> = {
      'move': 'move',
      'tl': 'nwse-resize',
      'tr': 'nesw-resize',
      'bl': 'nesw-resize',
      'br': 'nwse-resize',
      't': 'ns-resize',
      'b': 'ns-resize',
      'l': 'ew-resize',
      'r': 'ew-resize'
    };
    return cursorMap[handle] || 'default';
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (dragState.active && dragState.handle === 'pan') {
      // Pan in canvas coordinate space
      const dx = x - dragState.startX;
      const dy = y - dragState.startY;
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setDragState(prev => ({ ...prev, startX: x, startY: y }));
      drawAnnotations();
    } else if (dragState.active && dragState.annotation) {
      const dx = (x - dragState.startX) / scale;
      const dy = (y - dragState.startY) / scale;
      
      const newAnnotation = { ...dragState.annotation };
      const [bx, by, bw, bh] = newAnnotation.bbox;
      const minSize = 10;
      
      if (dragState.handle === 'move') {
        newAnnotation.bbox = [bx + dx, by + dy, bw, bh];
      } else if (dragState.handle === 'br') {
        // Bottom-right: resize width and height
        newAnnotation.bbox = [bx, by, Math.max(minSize, bw + dx), Math.max(minSize, bh + dy)];
      } else if (dragState.handle === 'tl') {
        // Top-left: move position and resize
        const newW = Math.max(minSize, bw - dx);
        const newH = Math.max(minSize, bh - dy);
        newAnnotation.bbox = [bx + (bw - newW), by + (bh - newH), newW, newH];
      } else if (dragState.handle === 'tr') {
        // Top-right: resize width, move top
        const newW = Math.max(minSize, bw + dx);
        const newH = Math.max(minSize, bh - dy);
        newAnnotation.bbox = [bx, by + (bh - newH), newW, newH];
      } else if (dragState.handle === 'bl') {
        // Bottom-left: move left, resize height
        const newW = Math.max(minSize, bw - dx);
        const newH = Math.max(minSize, bh + dy);
        newAnnotation.bbox = [bx + (bw - newW), by, newW, newH];
      } else if (dragState.handle === 't') {
        // Top edge: move top
        const newH = Math.max(minSize, bh - dy);
        newAnnotation.bbox = [bx, by + (bh - newH), bw, newH];
      } else if (dragState.handle === 'b') {
        // Bottom edge: resize height
        newAnnotation.bbox = [bx, by, bw, Math.max(minSize, bh + dy)];
      } else if (dragState.handle === 'l') {
        // Left edge: move left
        const newW = Math.max(minSize, bw - dx);
        newAnnotation.bbox = [bx + (bw - newW), by, newW, bh];
      } else if (dragState.handle === 'r') {
        // Right edge: resize width
        newAnnotation.bbox = [bx, by, Math.max(minSize, bw + dx), bh];
      }
      
      setDragState(prev => ({ ...prev, startX: x, startY: y, annotation: newAnnotation }));
      drawAnnotations();
    } else {
      // Update cursor
      const hit = findAnnotationAt(x, y);
      if (hit) {
        canvas.style.cursor = getCursorForHandle(hit.handle);
      } else {
        canvas.style.cursor = 'grab';
      }
    }
  };

  const handleMouseUp = () => {
    if (dragState.active && dragState.annotation && onAnnotationUpdate) {
      // image_id, id를 항상 유지
      const ann = dragState.annotation;
      onAnnotationUpdate({ ...ann, image_id: ann.image_id, id: ann.id });
    }
    setDragState({
      active: false,
      annotation: null,
      annotationIndex: -1,
      startX: 0,
      startY: 0,
      handle: null
    });
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    // Center-based zoom (image center)
    const canvasCenterX = (rect.right - rect.left) / 2;
    const canvasCenterY = (rect.bottom - rect.top) / 2;
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(5, scale * zoomFactor));
    
    // Keep the image center fixed while zooming
    const imgX = (canvasCenterX - offset.x) / scale;
    const imgY = (canvasCenterY - offset.y) / scale;
    
    setScale(newScale);
    setOffset({
      x: canvasCenterX - imgX * newScale,
      y: canvasCenterY - imgY * newScale
    });
  };

  if (!imageUrl) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        Select an image
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 relative bg-gray-100">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
      />
      <div className="absolute bottom-4 right-4 bg-white px-3 py-2 rounded shadow text-sm">
        Zoom: {(scale * 100).toFixed(0)}%
      </div>
      
      {/* Category Picker Modal */}
      {showCategoryPicker && selectedAnnotation && (
        <div 
          className="fixed bg-white border border-gray-300 rounded shadow-lg p-3 z-50"
          style={{ left: pickerPosition.x, top: pickerPosition.y }}
        >
          <div className="text-sm font-semibold mb-2">Enter category (COCO name)</div>
          <input
            type="text"
            autoFocus
            className="w-full border border-gray-300 rounded px-2 py-1"
            value={categoryInputValue}
            onChange={(e) => {
              setCategoryInputValue(e.target.value);
              setCategoryErrorMsg('');  // Clear error when typing
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const categoryId = getCategoryIdByName(categoryInputValue);
                if (categoryId !== null) {
                  handleCategoryChange(categoryId);
                  setShowCategoryPicker(false);
                } else {
                  setCategoryErrorMsg(`"${categoryInputValue}" is not a COCO category`);
                }
              } else if (e.key === 'Escape') {
                setShowCategoryPicker(false);
              }
            }}
            onBlur={() => {
              // Don't auto-submit on blur, just close
              setTimeout(() => setShowCategoryPicker(false), 150);
            }}
            placeholder="e.g. person, car, dog"
          />
          {categoryErrorMsg && (
            <div className="text-xs text-red-500 mt-1">
              {categoryErrorMsg}
            </div>
          )}
          <div className="text-xs text-gray-500 mt-1">
            Enter a COCO category name (e.g. person, car, dog)
          </div>
        </div>
      )}
    </div>
  );
}
