import type { Annotation } from '../../types/annotation';
import React, { useState, useMemo } from 'react';
import InteractiveCanvas from './InteractiveCanvas';
import { useMapStore } from '../../store/mapStore';

interface MapImageCanvasProps {
  annotationId: string | null;
  gtAnnotationId?: string | null;
  predAnnotationId?: string | null;
  imageUrl?: string | null;
  interactive?: boolean;
}

export default function MapImageCanvas({ 
  annotationId, 
  gtAnnotationId,
  predAnnotationId,
  imageUrl,
  interactive = false 
}: MapImageCanvasProps) {
  const { currentImageIndex, getImageUrl, gtAnnotations, predAnnotations } = useMapStore();
  const [visibleCategories, setVisibleCategories] = useState<Set<number>>(new Set());
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);

  // Get the current image URL from the store
  const localImageUrl = useMemo(() => {
    return getImageUrl(currentImageIndex);
  }, [currentImageIndex, getImageUrl]);

  const displayImageUrl = imageUrl || localImageUrl;

  if (!displayImageUrl) {
    return <div className="flex-1 flex items-center justify-center text-gray-400">이미지를 선택하세요</div>;
  }

  const gt = gtAnnotations;
  const pred = predAnnotations;

  const { updateAnnotation } = useMapStore();
  
  const handleAnnotationUpdate = (annotation: Annotation) => {
    updateAnnotation(annotation, 'pred');
  };

  // Use interactive canvas if requested and available
  if (interactive && displayImageUrl) {
    return (
      <InteractiveCanvas
        imageUrl={displayImageUrl}
        gtAnnotations={gt}
        predAnnotations={pred}
        visibleCategories={visibleCategories}
        confidenceThreshold={confidenceThreshold}
        onAnnotationUpdate={handleAnnotationUpdate}
      />
    );
  }

  // Fallback to simple SVG overlay
  return (
    <div className="flex-1 flex justify-center items-center h-full bg-gray-100 relative">
      <div style={{ position: 'relative' }}>
        <img src={displayImageUrl} style={{ maxWidth: 800, maxHeight: 600, display: 'block' }} alt="annotation view" />
        <svg
          style={{
            position: 'absolute',
            left: 0, top: 0,
            width: '100%', height: '100%',
            pointerEvents: 'none'
          }}>
          {[...gt, ...pred].map((ann: Annotation, idx: number) =>
            <rect
              key={ann.id || idx}
              x={ann.bbox[0]} y={ann.bbox[1]}
              width={ann.bbox[2]} height={ann.bbox[3]}
              stroke={ann.type === 'gt' ? '#22c55e' : '#6366f1'}
              strokeWidth={2}
              fill={ann.type === 'gt' ? 'rgba(34,197,94,0.15)' : 'rgba(99,102,241,0.13)'}
            />
          )}
        </svg>
      </div>
    </div>
  );
}