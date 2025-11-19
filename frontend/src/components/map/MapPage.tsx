import { MapProvider, useMapContext } from './MapContext';
import MapImageSidebar from './MapImageSidebar';
import InteractiveCanvas from './InteractiveCanvas';
import MapControlPanel from './MapControlPanel';
import React, { useState, useCallback } from 'react';

export default function MapPage() {
  return (
    <MapProvider>
      <MapPageInner />
    </MapProvider>
  );
}

import { useMapStore } from '../../store/mapStore';

function MapPageInner() {
  const { projectId, imageId, setImageId, folderId, setFolderId, gtId, setGtId, predId, setPredId } = useMapContext();
  const { setCurrentImageIndex, undo, redo, canUndo, canRedo, gtAnnotations, predAnnotations, categories, images, currentImageIndex, updateAnnotation } = useMapStore();
  const [annotationIdList, setAnnotationIdList] = useState<string[]>([]);
  const [iouThreshold, setIouThreshold] = useState(0.5);
  const [confThreshold, setConfThreshold] = useState(0.0);
  const annotationId = imageId ? String(imageId) : null;

  // Keyboard shortcuts for undo/redo
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo()) undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        if (canRedo()) redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);

  // Handle folder upload success
  const handleFolderUpload = useCallback((id: string) => {
    setFolderId(id);
    // Select first image
    setImageId(1);
    setCurrentImageIndex(0);
  }, [setFolderId, setImageId, setCurrentImageIndex]);

  // Handle annotation upload success
  const handleUploadSuccess = useCallback((id: string) => {
    setAnnotationIdList(list => list.includes(id) ? list : [...list, id]);
    setImageId(Number(id));
  }, [setImageId]);

  const handleImageSelect = useCallback((imgId: number) => {
    setImageId(imgId);
    // Update mapStore index (imgId is 1-based, index is 0-based)
    setCurrentImageIndex(imgId - 1);
  }, [setImageId, setCurrentImageIndex]);

  const currentImage = images[currentImageIndex] || null;
  const imageUrl = currentImage ? (currentImage.url || URL.createObjectURL(currentImage.file)) : null;
  const currentImageId = currentImage?.id;
  const filteredGt = currentImageId ? gtAnnotations.filter(ann => ann.image_id === currentImageId) : [];
  // 디버깅: predAnnotations의 image_id와 currentImageId를 콘솔로 출력
  if (currentImageId) {
    console.log('[MapPage] currentImageId:', currentImageId);
    console.log('[MapPage] predAnnotations image_ids:', predAnnotations.map(a => a.image_id));
  }
  const filteredPred = currentImageId ? predAnnotations.filter(ann => ann.image_id === currentImageId) : [];
  return (
    <div className="h-full grid grid-cols-[16rem_1fr_20rem] min-h-0">
      <MapImageSidebar
        projectId={projectId}
        currentId={annotationId}
        setCurrentId={id => setImageId(id ? Number(id) : null)}
        annotationIdList={annotationIdList}
        onUploadSuccess={handleFolderUpload}
        folderId={folderId}
        currentImageId={imageId}
        onImageSelect={handleImageSelect}
      />
      <div className="min-h-0 min-w-0 flex flex-col">
        <InteractiveCanvas
          imageUrl={imageUrl}
          gtAnnotations={filteredGt}
          predAnnotations={filteredPred}
          visibleCategories={new Set()}
          confidenceThreshold={confThreshold}
          iouThreshold={iouThreshold}
          onAnnotationUpdate={ann => {
            if (!currentImageId) return;
            updateAnnotation({ ...ann, image_id: currentImageId }, 'pred');
          }}
          categories={categories ? Object.fromEntries(Object.entries(categories).map(([id, name]) => [id, { name }])) : {}}
        />
      </div>
      <MapControlPanel 
        projectId={projectId} 
        annotationId={annotationId}
        gtId={gtId}
        predId={predId}
        onThresholdsChange={(iou, conf) => {
          setIouThreshold(iou);
          setConfThreshold(conf);
        }}
      />
    </div>
  );
}
