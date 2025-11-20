import React from 'react';
import { useMapStore } from '../../store/mapStore';

interface MapImageListProps {
  folderId: string | null;
  currentImageId: number | null;
  onImageSelect: (imageId: number) => void;
}

// Calculate IoU (Intersection over Union) between two bounding boxes
function calculateIoU(box1: [number, number, number, number], box2: [number, number, number, number]): number {
  const [x1, y1, w1, h1] = box1;
  const [x2, y2, w2, h2] = box2;
  
  const xLeft = Math.max(x1, x2);
  const yTop = Math.max(y1, y2);
  const xRight = Math.min(x1 + w1, x2 + w2);
  const yBottom = Math.min(y1 + h1, y2 + h2);
  
  if (xRight < xLeft || yBottom < yTop) return 0.0;
  
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
  
  const sortedPreds = [...predBoxes].sort((a, b) => (b.conf || 0) - (a.conf || 0));
  let tp = 0;
  const matched = new Set<number>();
  
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
  
  const precision = tp / sortedPreds.length;
  const recall = tp / gtBoxes.length;
  return (precision + recall) / 2;
}

// Calculate PR curve points for current image
function calculatePRCurve(gtBoxes: any[], predBoxes: any[], iouThreshold: number): Array<{precision: number, recall: number, threshold: number}> {
  if (gtBoxes.length === 0 || predBoxes.length === 0) {
    return [{precision: 0, recall: 0, threshold: 0}];
  }
  
  // Sort predictions by confidence descending
  const sortedPreds = [...predBoxes].sort((a, b) => (b.conf || 0) - (a.conf || 0));
  const points: Array<{precision: number, recall: number, threshold: number}> = [];
  
  // Start with point at recall=0, precision=1 (or first valid point)
  points.push({precision: 1, recall: 0, threshold: 1});
  
  let tp = 0;
  let fp = 0;
  const matched = new Set<number>();
  
  // Calculate precision/recall at each prediction
  sortedPreds.forEach((pred, idx) => {
    let bestIou = 0;
    let bestGtIdx = -1;
    
    gtBoxes.forEach((gt, gtIdx) => {
      if (matched.has(gtIdx)) return;
      const iou = calculateIoU(pred.bbox, gt.bbox);
      if (iou > bestIou) {
        bestIou = iou;
        bestGtIdx = gtIdx;
      }
    });
    
    if (bestIou >= iouThreshold && bestGtIdx >= 0) {
      tp++;
      matched.add(bestGtIdx);
    } else {
      fp++;
    }
    
    const precision = tp / (tp + fp);
    const recall = tp / gtBoxes.length;
    const threshold = pred.conf || 0;
    
    points.push({precision, recall, threshold});
  });
  
  return points;
}

// PR Curve visualization component
function PRCurveChart({ gtBoxes, predBoxes, iouThreshold }: {gtBoxes: any[], predBoxes: any[], iouThreshold: number}) {
  const points = React.useMemo(() => 
    calculatePRCurve(gtBoxes, predBoxes, iouThreshold),
    [gtBoxes, predBoxes, iouThreshold]
  );
  
  const width = 240;
  const height = 200;
  const padding = 30;
  const chartWidth = width - 2 * padding;
  const chartHeight = height - 2 * padding;
  
  // Create path for PR curve
  const pathData = points.map((p, idx) => {
    const x = padding + p.recall * chartWidth;
    const y = padding + (1 - p.precision) * chartHeight;
    return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
  
  return (
    <div className="p-2 border-t border-gray-200 bg-gray-50">
      <div className="text-xs font-semibold text-gray-700 mb-1">PR Curve (Current Image)</div>
      <svg width={width} height={height} className="bg-white rounded border border-gray-300">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(val => (
          <g key={val}>
            <line 
              x1={padding} y1={padding + (1-val) * chartHeight} 
              x2={padding + chartWidth} y2={padding + (1-val) * chartHeight}
              stroke="#e5e7eb" strokeWidth="1"
            />
            <line 
              x1={padding + val * chartWidth} y1={padding} 
              x2={padding + val * chartWidth} y2={padding + chartHeight}
              stroke="#e5e7eb" strokeWidth="1"
            />
          </g>
        ))}
        
        {/* Axes */}
        <line x1={padding} y1={padding} x2={padding} y2={padding + chartHeight} stroke="#374151" strokeWidth="2"/>
        <line x1={padding} y1={padding + chartHeight} x2={padding + chartWidth} y2={padding + chartHeight} stroke="#374151" strokeWidth="2"/>
        
        {/* PR Curve */}
        <path d={pathData} fill="none" stroke="#3b82f6" strokeWidth="2"/>
        
        {/* Axis labels */}
        <text x={padding + chartWidth/2} y={height - 5} fontSize="10" textAnchor="middle" fill="#374151">Recall</text>
        <text x="10" y={padding + chartHeight/2} fontSize="10" textAnchor="middle" fill="#374151" transform={`rotate(-90, 10, ${padding + chartHeight/2})`}>Precision</text>
        
        {/* Tick labels */}
        {[0, 0.5, 1].map(val => (
          <g key={val}>
            <text x={padding + val * chartWidth} y={padding + chartHeight + 12} fontSize="8" textAnchor="middle" fill="#6b7280">{val.toFixed(1)}</text>
            <text x={padding - 5} y={padding + (1-val) * chartHeight + 3} fontSize="8" textAnchor="end" fill="#6b7280">{val.toFixed(1)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function MapImageList({ folderId, currentImageId, onImageSelect }: MapImageListProps) {
  // Get images and annotations from store
  const images = useMapStore(s => s.images);
  const gtAnnotations = useMapStore(s => s.gtAnnotations);
  const predAnnotations = useMapStore(s => s.predAnnotations);
  const getImageUrl = useMapStore(s => s.getImageUrl);
  const iou = useMapStore(s => s.iou);

  // Cache mAP values calculated at initial load (with default IoU=0.5)
  // These values don't change when thresholds are adjusted
  const [cachedMapValues, setCachedMapValues] = React.useState<Map<number, number>>(new Map());
  
  // Calculate mAP for all images only once when annotations or images change
  React.useEffect(() => {
    if (images.length === 0 || gtAnnotations.length === 0 || predAnnotations.length === 0) {
      return;
    }
    
    const mapValues = new Map<number, number>();
    const defaultIoU = 0.5; // Use default IoU for initial calculation
    
    images.forEach(image => {
      const gtForImage = gtAnnotations.filter(a => a.image_id === image.id);
      const predForImage = predAnnotations.filter(a => a.image_id === image.id);
      const imageMap = calculateImageAP(gtForImage, predForImage, defaultIoU);
      mapValues.set(image.id, imageMap);
    });
    
    setCachedMapValues(mapValues);
  }, [images, gtAnnotations, predAnnotations]);

  // Simple check - show placeholder if no folder or no images
  if (!folderId) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm p-4">
        TopBar에서 이미지 폴더를 업로드하세요
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm p-4">
        이미지 로딩 중...
      </div>
    );
  }

  // Display list with thumbnails and metadata (scrollable, up to 8 visible)
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 text-xs text-gray-500 font-semibold">
        <span>이미지 목록 ({images.length}개)</span>
      </div>
      <div className="flex-1 overflow-y-auto" style={{maxHeight: '340px'}}>
        <div className="space-y-1 p-2">
          {images.map((image, idx) => {
            const thumbnailUrl = getImageUrl(idx);
            const gtCount = gtAnnotations.filter(a => a.image_id === image.id).length;
            const predCount = predAnnotations.filter(a => a.image_id === image.id).length;
            
            // Use cached mAP value (calculated once at initial load)
            const imageMap = cachedMapValues.get(image.id) || 0;
            
            return (
              <button
                key={image.id}
                onClick={() => onImageSelect(image.id)}
                className={`w-full text-left p-2 rounded border hover:bg-blue-50 ${
                  currentImageId === image.id 
                    ? 'bg-blue-100 border-blue-500 border-2' 
                    : 'border-gray-200'
                }`}
              >
                <div className="flex gap-2 items-center">
                  {/* Thumbnail - 32x32 */}
                  {thumbnailUrl ? (
                    <img 
                      src={thumbnailUrl} 
                      alt={image.name}
                      className="w-8 h-8 object-cover rounded flex-shrink-0 bg-gray-200"
                    />
                  ) : (
                    <div className="w-8 h-8 bg-gray-200 rounded flex-shrink-0 flex items-center justify-center text-gray-400" style={{fontSize: '8px'}}>
                      IMG
                    </div>
                  )}
                  
                  {/* Metadata */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate" title={image.name}>
                      {image.name}
                    </div>
                    <div className="flex gap-2 text-xs mt-0.5">
                      <span className="text-gray-600">mAP: {(imageMap * 100).toFixed(1)}%</span>
                      <span className="text-green-600">GT: {gtCount}</span>
                      <span className="text-orange-600">Pred: {predCount}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      
      {/* PR Curve for current image */}
      {currentImageId !== null && (() => {
        const gtForCurrent = gtAnnotations.filter(a => a.image_id === currentImageId);
        const predForCurrent = predAnnotations.filter(a => a.image_id === currentImageId);
        return <PRCurveChart gtBoxes={gtForCurrent} predBoxes={predForCurrent} iouThreshold={iou} />;
      })()}
    </div>
  );
}
