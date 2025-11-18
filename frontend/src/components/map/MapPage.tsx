import { MapProvider, useMapContext } from './MapContext';
import MapImageSidebar from './MapImageSidebar';
import MapImageCanvas from './MapImageCanvas';
import MapControlPanel from './MapControlPanel';
import React, { useState, useCallback } from 'react';

export default function MapPage() {
  return (
    <MapProvider>
      <MapPageInner />
    </MapProvider>
  );
}

function MapPageInner() {
  const { projectId, imageId, setImageId } = useMapContext();
  const [annotationIdList, setAnnotationIdList] = useState<string[]>([]);
  const annotationId = imageId ? String(imageId) : null;

  // 업로드 성공 시 annotationId 추가 및 선택
  const handleUploadSuccess = useCallback((id: string) => {
    setAnnotationIdList(list => list.includes(id) ? list : [...list, id]);
    setImageId(Number(id));
  }, [setImageId]);

  return (
    <div className="h-full grid grid-cols-[16rem_1fr_20rem] min-h-0">
      <MapImageSidebar
        projectId={projectId}
        currentId={annotationId}
        setCurrentId={id => setImageId(id ? Number(id) : null)}
        annotationIdList={annotationIdList}
        onUploadSuccess={handleUploadSuccess}
      />
      <div className="min-h-0 min-w-0 flex flex-col">
        <MapImageCanvas annotationId={annotationId} />
      </div>
      <MapControlPanel projectId={projectId} annotationId={annotationId} />
    </div>
  );
}
