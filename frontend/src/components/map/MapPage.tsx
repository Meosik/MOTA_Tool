import { useMapContext } from './MapContext';
import MapImageSidebar from './MapImageSidebar';
import InteractiveCanvas from './InteractiveCanvas';
import MapControlPanel from './MapControlPanel';
import React, { useState, useCallback } from 'react';
import { useMapStore } from '../../store/mapStore';
import CollapseBoundaryToggle from '../CollapseBoundaryToggle';
import { useUIStore } from '../../store/uiStore';



export default function MapPage() {
  // 상태 및 스토어 선언 먼저
  const { projectId, imageId, setImageId, folderId, setFolderId, gtId, setGtId, predId, setPredId } = useMapContext();
  const { setCurrentImageIndex, undo, redo, canUndo, canRedo, gtAnnotations, predAnnotations, categories, images, currentImageIndex, updateAnnotation } = useMapStore();
  const [selectedPrCurveCat, setSelectedPrCurveCat] = React.useState<number|null>(null);
  const [annotationIdList, setAnnotationIdList] = useState<string[]>([]);
  const annotationId = imageId ? String(imageId) : null;
  // (중복 선언 제거) 이미 위에서 선언됨


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
    // Find the index of the image with this ID (IDs may not be sequential)
    const index = images.findIndex(img => img.id === imgId);
    if (index >= 0) {
      setCurrentImageIndex(index);
    }
  }, [setImageId, setCurrentImageIndex, images]);



  // currentImage는 currentImageIndex 이후에 선언되어야 하며, useEffect보다 먼저 선언되어야 함
  const currentImage = images[currentImageIndex] || null;

  // 이미지/클래스 목록이 바뀔 때마다 첫 번째 클래스 catId로 자동 선택
  React.useEffect(() => {
    if (!currentImage) return;
    // 현재 이미지에 존재하는 클래스(catId) 목록
    const gtCats = gtAnnotations.filter(a => a.image_id === currentImage.id).map(a => a.category);
    const predCats = predAnnotations.filter(a => a.image_id === currentImage.id).map(a => a.category);
    const allCats = Array.from(new Set([...gtCats, ...predCats])).sort((a, b) => a - b);
    if (allCats.length > 0) {
      setSelectedPrCurveCat(allCats[0]);
    } else {
      setSelectedPrCurveCat(null);
    }
  }, [currentImage, gtAnnotations, predAnnotations]);

  // 안정적인 imageUrl 유지: annotation 편집 시에도 ObjectURL이 재생성되지 않도록 고정
  const [stableImageUrl, setStableImageUrl] = React.useState<string|null>(null);
  React.useEffect(() => {
    if (!currentImage) {
      setStableImageUrl(null);
      return;
    }
    if (currentImage.url) {
      setStableImageUrl(currentImage.url);
      return;
    }
    if (currentImage.file) {
      const url = URL.createObjectURL(currentImage.file);
      setStableImageUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setStableImageUrl(null);
  }, [currentImage?.id, currentImage?.url, currentImage?.file]);
  const imageUrl = stableImageUrl;
  const currentImageId = currentImage?.id;
  const mapImageListCollapsed = useUIStore(s=>s.mapImageListCollapsed);
  const setMapImageListCollapsed = useUIStore(s=>s.setMapImageListCollapsed);
  const leftWidthPx = 256; // 16rem
  
  // Filter by current image only - don't apply confidence/IoU filtering here
  // Let InteractiveCanvas handle that based on slider values
  const filteredGt = currentImageId ? gtAnnotations.filter(ann => ann.image_id === currentImageId) : [];
  const filteredPred = currentImageId ? predAnnotations.filter(ann => ann.image_id === currentImageId) : [];
  return (
    <div className={`h-full min-h-0 ${mapImageListCollapsed ? 'grid grid-cols-[1fr_20rem]' : 'grid grid-cols-[16rem_1fr_20rem]'} transition-[grid-template-columns] duration-200`}>
      {!mapImageListCollapsed && (
        <MapImageSidebar
          projectId={projectId}
          currentId={annotationId}
          setCurrentId={id => setImageId(id ? Number(id) : null)}
          annotationIdList={annotationIdList}
          onUploadSuccess={handleFolderUpload}
          folderId={folderId}
          currentImageId={currentImageId || null}
          onImageSelect={handleImageSelect}
          selectedPrCurveCat={selectedPrCurveCat}
          />
      )}
      <div className="min-h-0 min-w-0 flex flex-col relative">
        {/* 사이드바 접힘/펼침마다 InteractiveCanvas 강제 remount */}
        <InteractiveCanvas
          key={mapImageListCollapsed ? 'collapsed' : 'expanded'}
          imageUrl={imageUrl}
          gtAnnotations={filteredGt}
          predAnnotations={filteredPred}
          visibleCategories={new Set((categories && Object.keys(categories).map(Number)) || [])}
          confidenceThreshold={0}
          onAnnotationUpdate={ann => {
            if (!currentImageId) return;
            updateAnnotation({ ...ann, image_id: currentImageId }, 'pred');
          }}
          categories={categories ? Object.fromEntries(Object.entries(categories).map(([id, name]) => [id, { name }])) : {}}
        />
        <CollapseBoundaryToggle
          collapsed={mapImageListCollapsed}
          onToggle={()=> setMapImageListCollapsed(!mapImageListCollapsed)}
          expandedOffsetPx={leftWidthPx}
        />
      </div>
        <MapControlPanel 
          projectId={projectId} 
          annotationId={annotationId}
          gtId={gtId}
          predId={predId}
          selectedPrCurveCat={selectedPrCurveCat}
          setSelectedPrCurveCat={setSelectedPrCurveCat}
        />
    </div>
  );
}
