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
  const [folderId, setFolderId] = useState<string | null>(null);
  const [gtId, setGtId] = useState<string | null>(null);
  const [predId, setPredId] = useState<string | null>(null);
  const annotationId = imageId ? String(imageId) : null;

  // Handle folder upload success
  const handleFolderUpload = useCallback((id: string) => {
    setFolderId(id);
    // Optionally select first image
    setImageId(1);
  }, [setImageId]);

  // Handle annotation upload success
  const handleUploadSuccess = useCallback((id: string) => {
    setAnnotationIdList(list => list.includes(id) ? list : [...list, id]);
    setImageId(Number(id));
  }, [setImageId]);

  const handleImageSelect = useCallback((imgId: number) => {
    setImageId(imgId);
  }, [setImageId]);

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
        <MapImageCanvas 
          annotationId={annotationId}
          gtAnnotationId={gtId}
          predAnnotationId={predId}
          interactive={true}
        />
      </div>
      <MapControlPanel 
        projectId={projectId} 
        annotationId={annotationId}
        gtId={gtId}
        predId={predId}
      />
    </div>
  );
}
