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

type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r';

type DragState = {
  active: boolean;
  annotation: Annotation | null;
  startX: number;
  startY: number;
  handle: 'move' | ResizeHandle | null;
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
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [pickerPosition, setPickerPosition] = useState({ x: 0, y: 0 });

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

      // Draw resize handles if selected (8 handles: 4 corners + 4 edges)
      if (isSelected && !isGt) {
        const handleSize = 8;
        const halfHandle = handleSize / 2;
        ctx.fillStyle = color;
        
        // Corner handles
        ctx.fillRect(x - halfHandle, y - halfHandle, handleSize, handleSize); // Top-left
        ctx.fillRect(x + w - halfHandle, y - halfHandle, handleSize, handleSize); // Top-right
        ctx.fillRect(x - halfHandle, y + h - halfHandle, handleSize, handleSize); // Bottom-left
        ctx.fillRect(x + w - halfHandle, y + h - halfHandle, handleSize, handleSize); // Bottom-right
        
        // Edge handles
        ctx.fillRect(x + w/2 - halfHandle, y - halfHandle, handleSize, handleSize); // Top
        ctx.fillRect(x + w/2 - halfHandle, y + h - halfHandle, handleSize, handleSize); // Bottom
        ctx.fillRect(x - halfHandle, y + h/2 - halfHandle, handleSize, handleSize); // Left
        ctx.fillRect(x + w - halfHandle, y + h/2 - halfHandle, handleSize, handleSize); // Right
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

  const findAnnotationAt = (x: number, y: number): { annotation: Annotation; handle: 'move' | ResizeHandle } | null => {
    const imgCoords = canvasToImageCoords(x, y);
    const handleSize = 10; // Detection area for handles
    
    // Check predictions only (GT is not editable)
    for (let i = predAnnotations.length - 1; i >= 0; i--) {
      const ann = predAnnotations[i];
      const [bx, by, bw, bh] = ann.bbox;
      
      // Check corner handles first
      if (Math.abs(imgCoords.x - bx) < handleSize && Math.abs(imgCoords.y - by) < handleSize) {
        return { annotation: ann, handle: 'tl' }; // Top-left
      }
      if (Math.abs(imgCoords.x - (bx + bw)) < handleSize && Math.abs(imgCoords.y - by) < handleSize) {
        return { annotation: ann, handle: 'tr' }; // Top-right
      }
      if (Math.abs(imgCoords.x - bx) < handleSize && Math.abs(imgCoords.y - (by + bh)) < handleSize) {
        return { annotation: ann, handle: 'bl' }; // Bottom-left
      }
      if (Math.abs(imgCoords.x - (bx + bw)) < handleSize && Math.abs(imgCoords.y - (by + bh)) < handleSize) {
        return { annotation: ann, handle: 'br' }; // Bottom-right
      }
      
      // Check edge handles
      if (Math.abs(imgCoords.x - (bx + bw/2)) < handleSize && Math.abs(imgCoords.y - by) < handleSize) {
        return { annotation: ann, handle: 't' }; // Top
      }
      if (Math.abs(imgCoords.x - (bx + bw/2)) < handleSize && Math.abs(imgCoords.y - (by + bh)) < handleSize) {
        return { annotation: ann, handle: 'b' }; // Bottom
      }
      if (Math.abs(imgCoords.x - bx) < handleSize && Math.abs(imgCoords.y - (by + bh/2)) < handleSize) {
        return { annotation: ann, handle: 'l' }; // Left
      }
      if (Math.abs(imgCoords.x - (bx + bw)) < handleSize && Math.abs(imgCoords.y - (by + bh/2)) < handleSize) {
        return { annotation: ann, handle: 'r' }; // Right
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
    } else {
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
      setShowCategoryPicker(true);
      e.preventDefault();
    }
  };

  const handleCategoryChange = (newCategoryId: number) => {
    if (selectedAnnotation && onAnnotationUpdate) {
      const updatedAnnotation = { ...selectedAnnotation, category: newCategoryId };
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
    
    if (dragState.active && dragState.annotation) {
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
      canvas.style.cursor = hit ? getCursorForHandle(hit.handle) : 'default';
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
        onDoubleClick={handleDoubleClick}
      />
      <div className="absolute bottom-4 right-4 bg-white px-3 py-2 rounded shadow text-sm">
        Zoom: {(scale * 100).toFixed(0)}%
      </div>
      
      {/* Category Picker Modal */}
      {showCategoryPicker && selectedAnnotation && (
        <div 
          className="fixed bg-white border border-gray-300 rounded shadow-lg p-2 z-50"
          style={{ left: pickerPosition.x, top: pickerPosition.y }}
        >
          <div className="text-sm font-semibold mb-2">카테고리 선택</div>
          <select
            autoFocus
            className="w-full border border-gray-300 rounded px-2 py-1"
            value={selectedAnnotation.category}
            onChange={(e) => handleCategoryChange(Number(e.target.value))}
            onBlur={() => setShowCategoryPicker(false)}
          >
            {Object.entries(categories).map(([id, cat]) => (
              <option key={id} value={id}>
                {cat.name}
              </option>
            ))}
          </select>
          <div className="text-xs text-gray-500 mt-1">
            더블클릭으로 카테고리 변경
          </div>
        </div>
      )}
    </div>
  );
}
