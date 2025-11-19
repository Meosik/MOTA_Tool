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
  iouThreshold = 0.0,
  onAnnotationUpdate,
  categories = {}
}: InteractiveCanvasProps) {
  // Read thresholds from store (like MOTA mode's OverlayCanvas)
  const iouThr = useMapStore(s => s.iou);
  const confThr = useMapStore(s => s.conf);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    
    if (!canvas || !ctx || !img || !img.complete) {
      console.log('InteractiveCanvas: Cannot draw -', { 
        hasCanvas: !!canvas, 
        hasCtx: !!ctx, 
        hasImg: !!img, 
        imgComplete: img?.complete 
      });
      return;
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
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
    const filteredGt = gtAnnotations.filter(ann =>
      visibleCategories.size === 0 || visibleCategories.has(ann.category as any)
    );

    // Filter pred annotations by confidence and IoU (using store values like MOTA mode)
    const filteredPred = predToRender.filter(ann => {
      // Check confidence threshold from store
      if ((ann.conf ?? 1) < confThr) return false;
      
      // Check visible categories
      if (visibleCategories.size > 0 && !visibleCategories.has(ann.category as any)) return false;
      
      // Check IoU threshold from store - pred must have IoU >= threshold with at least one GT box
      if (iouThr > 0 && filteredGt.length > 0) {
        const maxIoU = Math.max(...filteredGt.map(gt => calculateIoU(ann.bbox, gt.bbox)));
        if (maxIoU < iouThr) return false;
      }
      
      return true;
    });

    const allAnnotations = [...filteredGt, ...filteredPred];
    
    console.log('InteractiveCanvas: Drawing', { 
      gtCount: filteredGt.length, 
      predCount: filteredPred.length,
      totalAnnotations: allAnnotations.length
    });

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
  }, [gtAnnotations, predAnnotations, visibleCategories, confThr, iouThr, scale, offset, selectedAnnotation, categories, dragState]);

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

  useEffect(() => {
    drawAnnotations();
  }, [drawAnnotations]);

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
      {showCategoryPicker && selectedAnnotation && (() => {
        const [inputValue, setInputValue] = useState(getCategoryNameById(selectedAnnotation.category as number) || '');
        const [errorMsg, setErrorMsg] = useState('');
        
        const handleInputChange = (value: string) => {
          setInputValue(value);
          setErrorMsg('');  // Clear error when typing
        };
        
        const handleSubmit = () => {
          const categoryId = getCategoryIdByName(inputValue);
          if (categoryId !== null) {
            handleCategoryChange(categoryId);
            setShowCategoryPicker(false);
          } else {
            setErrorMsg(`"${inputValue}"는 COCO 카테고리에 없습니다`);
          }
        };
        
        return (
          <div 
            className="fixed bg-white border border-gray-300 rounded shadow-lg p-3 z-50"
            style={{ left: pickerPosition.x, top: pickerPosition.y }}
          >
            <div className="text-sm font-semibold mb-2">카테고리 입력 (COCO 이름)</div>
            <input
              type="text"
              autoFocus
              className="w-full border border-gray-300 rounded px-2 py-1"
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSubmit();
                } else if (e.key === 'Escape') {
                  setShowCategoryPicker(false);
                }
              }}
              onBlur={() => {
                // Don't auto-submit on blur, just close
                setTimeout(() => setShowCategoryPicker(false), 150);
              }}
              placeholder="예: person, car, dog"
            />
            {errorMsg && (
              <div className="text-xs text-red-500 mt-1">
                {errorMsg}
              </div>
            )}
            <div className="text-xs text-gray-500 mt-1">
              COCO 데이터셋 카테고리 이름 입력 (예: person, car, dog)
            </div>
          </div>
        );
      })()}
    </div>
  );
}
