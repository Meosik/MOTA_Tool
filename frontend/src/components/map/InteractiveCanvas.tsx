import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Annotation } from '../../types/annotation';

interface InteractiveCanvasProps {
  imageUrl: string | null;
  gtAnnotations: Annotation[];
  predAnnotations: Annotation[];
  visibleCategories: Set<number>;
  confidenceThreshold: number;
  onAnnotationUpdate?: (annotation: Annotation) => void;
  categories?: Record<number, { name: string; color?: string }>;
}

type DragState = {
  active: boolean;
  annotation: Annotation | null;
  startX: number;
  startY: number;
  handle: 'move' | 'resize' | null;
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
  onAnnotationUpdate,
  categories = {}
}: InteractiveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [dragState, setDragState] = useState<DragState>({
    active: false,
    annotation: null,
    startX: 0,
    startY: 0,
    handle: null
  });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);

  const getCategoryColor = (categoryId: number | undefined, isGt: boolean) => {
    if (isGt) return '#22c55e'; // Green for GT
    if (categoryId !== undefined && categories[categoryId]?.color) {
      return categories[categoryId].color;
    }
    return categoryId !== undefined ? CATEGORY_COLORS[categoryId % CATEGORY_COLORS.length] : '#6366f1';
  };

  const drawAnnotations = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = imageRef.current;
    
    if (!canvas || !ctx || !img || !img.complete) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw image
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    ctx.restore();

    // Filter and draw annotations
    const filteredPred = predAnnotations.filter(ann => 
      (ann.conf ?? 1) >= confidenceThreshold &&
      (visibleCategories.size === 0 || visibleCategories.has(ann.category as any))
    );

    const filteredGt = gtAnnotations.filter(ann =>
      visibleCategories.size === 0 || visibleCategories.has(ann.category as any)
    );

    const allAnnotations = [...filteredGt, ...filteredPred];

    allAnnotations.forEach(ann => {
      const [x, y, w, h] = ann.bbox;
      const isGt = ann.type === 'gt';
      const color = getCategoryColor(ann.category as any, isGt);
      const isSelected = selectedAnnotation?.id === ann.id;

      ctx.save();
      ctx.translate(offset.x, offset.y);
      ctx.scale(scale, scale);

      // Draw bbox
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.strokeRect(x, y, w, h);

      // Fill with transparency
      ctx.fillStyle = isGt ? 'rgba(34,197,94,0.15)' : 'rgba(99,102,241,0.13)';
      ctx.fillRect(x, y, w, h);

      // Draw label
      if (ann.category !== undefined || ann.conf !== undefined) {
        const label = `${categories[ann.category as any]?.name ?? ann.category ?? ''} ${ann.conf !== undefined ? ann.conf.toFixed(2) : ''}`.trim();
        if (label) {
          ctx.fillStyle = color;
          ctx.font = '12px sans-serif';
          ctx.fillText(label, x, y - 4);
        }
      }

      // Draw resize handle if selected
      if (isSelected && !isGt) {
        ctx.fillStyle = color;
        ctx.fillRect(x + w - 6, y + h - 6, 6, 6);
      }

      ctx.restore();
    });
  }, [gtAnnotations, predAnnotations, visibleCategories, confidenceThreshold, scale, offset, selectedAnnotation, categories]);

  useEffect(() => {
    if (!imageUrl) return;

    const img = new Image();
    img.onload = () => {
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
      }
    };
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    drawAnnotations();
  }, [drawAnnotations]);

  const canvasToImageCoords = (canvasX: number, canvasY: number) => {
    return {
      x: (canvasX - offset.x) / scale,
      y: (canvasY - offset.y) / scale
    };
  };

  const findAnnotationAt = (x: number, y: number): { annotation: Annotation; handle: 'move' | 'resize' } | null => {
    const imgCoords = canvasToImageCoords(x, y);
    
    // Check predictions only (GT is not editable)
    for (let i = predAnnotations.length - 1; i >= 0; i--) {
      const ann = predAnnotations[i];
      const [bx, by, bw, bh] = ann.bbox;
      
      // Check resize handle
      if (Math.abs(imgCoords.x - (bx + bw)) < 10 && Math.abs(imgCoords.y - (by + bh)) < 10) {
        return { annotation: ann, handle: 'resize' };
      }
      
      // Check if inside bbox
      if (imgCoords.x >= bx && imgCoords.x <= bx + bw && imgCoords.y >= by && imgCoords.y <= by + bh) {
        return { annotation: ann, handle: 'move' };
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
        startX: x,
        startY: y,
        handle: hit.handle
      });
      setSelectedAnnotation(hit.annotation);
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (dragState.active && dragState.annotation) {
      const dx = (x - dragState.startX) / scale;
      const dy = (y - dragState.startY) / scale;
      
      const newAnnotation = { ...dragState.annotation };
      const [bx, by, bw, bh] = newAnnotation.bbox;
      
      if (dragState.handle === 'move') {
        newAnnotation.bbox = [bx + dx, by + dy, bw, bh];
      } else if (dragState.handle === 'resize') {
        newAnnotation.bbox = [bx, by, Math.max(10, bw + dx), Math.max(10, bh + dy)];
      }
      
      setDragState(prev => ({ ...prev, startX: x, startY: y, annotation: newAnnotation }));
      drawAnnotations();
    } else {
      // Update cursor
      const hit = findAnnotationAt(x, y);
      canvas.style.cursor = hit ? (hit.handle === 'resize' ? 'nwse-resize' : 'move') : 'default';
    }
  };

  const handleMouseUp = () => {
    if (dragState.active && dragState.annotation && onAnnotationUpdate) {
      onAnnotationUpdate(dragState.annotation);
    }
    setDragState({
      active: false,
      annotation: null,
      startX: 0,
      startY: 0,
      handle: null
    });
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(5, scale * zoomFactor));
    
    // Zoom towards mouse position
    const imgX = (mouseX - offset.x) / scale;
    const imgY = (mouseY - offset.y) / scale;
    
    setScale(newScale);
    setOffset({
      x: mouseX - imgX * newScale,
      y: mouseY - imgY * newScale
    });
  };

  if (!imageUrl) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        이미지를 선택하세요
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
      />
      <div className="absolute bottom-4 right-4 bg-white px-3 py-2 rounded shadow text-sm">
        Zoom: {(scale * 100).toFixed(0)}%
      </div>
    </div>
  );
}
