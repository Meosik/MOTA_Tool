import React, { useState, useDeferredValue } from 'react'
import { useMapMetrics } from '../../hooks/mapApi'
import { useMapStore } from '../../store/mapStore'

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

// Calculate simple AP for a single image
function calculateImageAP(gtBoxes: any[], predBoxes: any[], iouThreshold: number): number {
  if (gtBoxes.length === 0) return predBoxes.length === 0 ? 1.0 : 0.0;
  if (predBoxes.length === 0) return 0.0;
  
  // Sort predictions by confidence (descending)
  const sortedPreds = [...predBoxes].sort((a, b) => (b.conf || 0) - (a.conf || 0));
  
  let tp = 0;
  const matched = new Set<number>();
  
  // For each prediction, find best matching GT
  for (const pred of sortedPreds) {
    let bestIou = 0;
    let bestGtIdx = -1;
    
    gtBoxes.forEach((gt, idx) => {
      if (matched.has(idx)) return;
      const iou = calculateIoU(pred.bbox, gt.bbox);
      if (iou > bestIou) {
        bestIou = iou;
        bestGtIdx = idx;
      }
    });
    
    if (bestIou >= iouThreshold && bestGtIdx >= 0) {
      tp++;
      matched.add(bestGtIdx);
    }
  }
  
  // Simple precision = TP / (TP + FP)
  const precision = tp / sortedPreds.length;
  // Simple recall = TP / total GT
  const recall = tp / gtBoxes.length;
  
  // Simple AP as average of precision and recall
  return (precision + recall) / 2;
}

interface MapControlPanelProps {
  projectId: string;
  annotationId: string | null;
  gtId?: string | null;
  predId?: string | null;
}



export default function MapControlPanel({ projectId, annotationId, gtId, predId }: MapControlPanelProps) {
  // Read thresholds from store (like MOTA mode's RightPanel)
  const iou = useMapStore(s => s.iou);
  const conf = useMapStore(s => s.conf);
  const setIou = useMapStore(s => s.setIou);
  const setConf = useMapStore(s => s.setConf);
  
  // Defer expensive calculations to avoid blocking slider interactions
  const deferredIou = useDeferredValue(iou);
  const deferredConf = useDeferredValue(conf);
  
  // Get current image and annotations from store with stable selectors
  const currentImageIndex = useMapStore(s => s.currentImageIndex);
  const images = useMapStore(s => s.images);
  const gtAnnotations = useMapStore(s => s.gtAnnotations);
  const predAnnotations = useMapStore(s => s.predAnnotations);
  const currentImage = images[currentImageIndex] || null;
  
  // Use gtId/predId if provided, fallback to projectId/annotationId
  const effectiveGtId = gtId || projectId
  const effectivePredId = predId || annotationId
  
  // Manual trigger for overall mAP calculation
  const [shouldCalculateOverall, setShouldCalculateOverall] = useState(false);
  
  // Call backend API only when manually triggered (use deferred values to reduce API calls)
  const { data, isLoading, error, refetch } = useMapMetrics(
    effectiveGtId, 
    effectivePredId!, 
    deferredConf, 
    deferredIou,
    shouldCalculateOverall
  );
  
  // Handle calculate overall mAP button click
  const handleCalculateOverallMap = () => {
    setShouldCalculateOverall(true);
    refetch();
  };
  
  // Memoize GT filtering separately (only depends on currentImage and gtAnnotations)
  const gtForImage = React.useMemo(() => {
    if (!currentImage) return [];
    return gtAnnotations.filter(a => {
      // If no image_id, show for all images
      if (!a.image_id) return true;
      // Otherwise match current image
      return a.image_id === currentImage.id;
    });
  }, [currentImage, gtAnnotations]);

  // Memoize pred filtering (uses deferred values to avoid blocking slider)
  const predForImage = React.useMemo(() => {
    if (!currentImage) return [];
    
    return predAnnotations.filter(a => {
      // Check image_id
      if (a.image_id && a.image_id !== currentImage.id) return false;
      
      // Check confidence threshold
      if ((a.conf || 0) < deferredConf) return false;
      
      // Check IoU threshold - pred must have IoU >= threshold with at least one GT box
      if (deferredIou > 0 && gtForImage.length > 0) {
        const maxIoU = Math.max(...gtForImage.map(gt => calculateIoU(a.bbox, gt.bbox)));
        if (maxIoU < deferredIou) return false;
      }
      
      return true;
    });
  }, [currentImage, predAnnotations, deferredConf, deferredIou, gtForImage]);

  // Calculate per-image statistics (uses deferred values)
  const imageStats = React.useMemo(() => {
    if (!currentImage) return null;
    
    console.log('MapControlPanel: Calculating stats for image', currentImage.id);
    console.log('MapControlPanel: Filtered GT', gtForImage.length, 'Filtered Pred', predForImage.length);
    
    // Calculate AP for current image
    const imageAP = calculateImageAP(gtForImage, predForImage, deferredIou);
    
    return {
      gtCount: gtForImage.length,
      predCount: predForImage.length,
      imageName: currentImage.name,
      imageId: currentImage.id,
      mAP: imageAP,
    };
  }, [currentImage, gtForImage, predForImage, deferredIou]);

  // Slider adjustment utilities (matching MOTA RightPanel)
  const stepSmall = 0.01
  const stepLarge = 0.05
  const round2 = (v: number) => Math.round(v * 100) / 100
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
  const adjustIou = (d: number) => setIou(clamp01(round2(iou + d)))
  const adjustConf = (d: number) => setConf(clamp01(round2(conf + d)))

  return (
    <aside className="w-80 shrink-0 border-l border-neutral-200 p-3 flex flex-col gap-4">
      {/* IoU Threshold */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">IoU Threshold</div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustIou(-stepLarge)} title="IoU -0.05">
            <svg viewBox="0 0 20 12" width="16" height="12"><polygon points="9,6 17,1 17,11"/><polygon points="1,6 9,1 9,11"/></svg>
          </button>
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustIou(-stepSmall)} title="IoU -0.01">
            <svg viewBox="0 0 12 12" width="12" height="12" style={{ transform: 'scaleX(-1)' }}><polygon points="2,1 10,6 2,11"/></svg>
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={iou}
            onChange={e => setIou(clamp01(parseFloat(e.currentTarget.value)))}
            className="flex-1"
          />
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustIou(+stepSmall)} title="IoU +0.01">
            <svg viewBox="0 0 12 12" width="12" height="12"><polygon points="2,1 10,6 2,11"/></svg>
          </button>
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustIou(+stepLarge)} title="IoU +0.05">
            <svg viewBox="0 0 20 12" width="16" height="12"><polygon points="3,1 11,6 3,11"/><polygon points="11,1 19,6 11,11"/></svg>
          </button>
        </div>
        <div className="text-xs text-neutral-600 font-mono">IoU = {iou.toFixed(2)}</div>
      </div>

      {/* Confidence Threshold */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">Confidence Threshold</div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustConf(-stepLarge)} title="conf -0.05">
            <svg viewBox="0 0 20 12" width="16" height="12"><polygon points="9,6 17,1 17,11"/><polygon points="1,6 9,1 9,11"/></svg>
          </button>
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustConf(-stepSmall)} title="conf -0.01">
            <svg viewBox="0 0 12 12" width="12" height="12" style={{ transform: 'scaleX(-1)' }}><polygon points="2,1 10,6 2,11"/></svg>
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={conf}
            onChange={e => setConf(clamp01(parseFloat(e.currentTarget.value)))}
            className="flex-1"
          />
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustConf(+stepSmall)} title="conf +0.01">
            <svg viewBox="0 0 12 12" width="12" height="12"><polygon points="2,1 10,6 2,11"/></svg>
          </button>
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustConf(+stepLarge)} title="conf +0.05">
            <svg viewBox="0 0 20 12" width="16" height="12"><polygon points="3,1 11,6 3,11"/><polygon points="11,1 19,6 11,11"/></svg>
          </button>
        </div>
        <div className="text-xs text-neutral-600 font-mono">conf ≥ {conf.toFixed(2)}</div>
      </div>

      {/* Current Image mAP */}
      {imageStats && (
        <div className="space-y-1">
          <div className="text-sm font-semibold">Current Image mAP</div>
          <div className="text-2xl font-mono">{(imageStats.mAP * 100).toFixed(2)}%</div>
          <div className="text-xs text-neutral-600">Average Precision for this image</div>
        </div>
      )}

      {/* Overall Dataset Metrics */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Overall Dataset</div>
          <button
            onClick={handleCalculateOverallMap}
            disabled={!effectiveGtId || !effectivePredId || isLoading}
            className="px-3 py-1 text-xs rounded bg-brand-600 text-white hover:bg-brand-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Calculating...' : 'Calculate Overall mAP'}
          </button>
        </div>
        
        {error && (
          <div className="text-xs text-red-500">Error loading metrics</div>
        )}
        
        {isLoading ? (
          <div className="text-xs text-neutral-600">Calculating metrics...</div>
        ) : data ? (
          <>
            <div className="text-2xl font-mono">{typeof data.mAP === 'number' ? (data.mAP * 100).toFixed(2) + '%' : '—'}</div>
            <div className="text-xs text-neutral-600">Mean Average Precision</div>

            {data.class_aps && typeof data.class_aps === 'object' && Object.keys(data.class_aps).length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="text-sm font-semibold">Per-Class AP</div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {Object.entries(data.class_aps).map(([cls, ap]) => (
                    <div key={cls} className="flex justify-between items-center text-xs">
                      <span className="text-neutral-700">{cls}</span>
                      <span className="font-mono text-neutral-600">
                        {((ap as number) * 100).toFixed(2)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.num_categories !== undefined && (
              <div className="text-xs text-neutral-600 mt-2">
                Categories: {data.num_categories} | Images: {data.num_images || 'N/A'}
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-neutral-600">GT와 Predictions를 업로드하고 버튼을 눌러 전체 데이터셋 mAP를 계산하세요.</div>
        )}
      </div>
    </aside>
  )
}