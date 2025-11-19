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

export default function MapImageList({ folderId, currentImageId, onImageSelect }: MapImageListProps) {
  // Get images and annotations from store
  const images = useMapStore(s => s.images);
  const gtAnnotations = useMapStore(s => s.gtAnnotations);
  const predAnnotations = useMapStore(s => s.predAnnotations);
  const getImageUrl = useMapStore(s => s.getImageUrl);
  const iou = useMapStore(s => s.iou);
  
  // Pagination state - show 5 images at a time
  const [currentPage, setCurrentPage] = React.useState(0);
  const itemsPerPage = 5;
  const totalPages = Math.ceil(images.length / itemsPerPage);
  const startIdx = currentPage * itemsPerPage;
  const endIdx = Math.min(startIdx + itemsPerPage, images.length);
  const visibleImages = images.slice(startIdx, endIdx);

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

  // Display list with thumbnails and metadata (5 at a time)
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 text-xs text-gray-500 font-semibold flex items-center justify-between">
        <span>이미지 목록 ({images.length}개)</span>
        <span className="text-xs">Page {currentPage + 1}/{totalPages}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-1 p-2">
          {visibleImages.map((image, relIdx) => {
            const idx = startIdx + relIdx;
            const thumbnailUrl = getImageUrl(idx);
            const gtCount = gtAnnotations.filter(a => a.image_id === image.id).length;
            const predCount = predAnnotations.filter(a => a.image_id === image.id).length;
            
            // Calculate mAP for this image
            const gtForImage = gtAnnotations.filter(a => a.image_id === image.id);
            const predForImage = predAnnotations.filter(a => a.image_id === image.id);
            const imageMap = calculateImageAP(gtForImage, predForImage, iou);
            
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
      
      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="p-2 border-t border-gray-200 flex items-center justify-between text-xs">
          <button
            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="px-2 py-1 rounded border hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <span className="text-gray-600">
            {startIdx + 1}-{endIdx} of {images.length}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
            className="px-2 py-1 rounded border hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
