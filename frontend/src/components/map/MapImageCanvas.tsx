import { useImageAnnotations } from '../../hooks/mapApi';
import type { Annotation } from '../../types/annotation';
import React from 'react';

export default function MapImageCanvas({ annotationId }: { annotationId: string | null }) {
  const { data, isLoading, error } = useImageAnnotations(annotationId!);
  if (!annotationId) return <div className="flex-1 flex items-center justify-center">이미지를 선택하세요</div>
  if (isLoading) return <div className="flex-1 flex items-center justify-center text-gray-400">로딩중…</div>
  if (error) return <div className="flex-1 text-red-500">{String(error)}</div>

  const gt = Array.isArray(data?.gt) ? data.gt : [];
  const pred = Array.isArray(data?.pred) ? data.pred : [];
  const imageInfo = typeof data?.imageInfo === 'object' && data?.imageInfo !== null ? data.imageInfo : {};
  return (
    <div className="flex-1 flex justify-center items-center h-full bg-gray-100 relative">
      <div style={{ position: 'relative' }}>
        <img src={imageInfo.thumb_url || imageInfo.url} style={{ maxWidth: 800, maxHeight: 600, display: 'block' }} />
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