import React, { useState } from 'react';
import MapImageSidebar from '../../components/map/MapImageSidebar';
import MapImageCanvas from '../../components/map/MapImageCanvas';
import MapControlPanel from '../../components/map/MapControlPanel';

const DUMMY_PROJECT_ID = "your_project_id"; // 실제 라우터 연동시 교체

export default function MapMainPage() {
  const [currentImageId, setCurrentImageId] = useState<number | null>(null);

  return (
    <div className="flex h-full">
      <MapImageSidebar projectId={DUMMY_PROJECT_ID} currentId={currentImageId} setCurrentId={setCurrentImageId} />
      <main className="flex-1 flex items-center justify-center relative bg-gray-50">
        <MapImageCanvas imageId={currentImageId} />
      </main>
      <MapControlPanel projectId={DUMMY_PROJECT_ID} imageId={currentImageId} />
    </div>
  );
}