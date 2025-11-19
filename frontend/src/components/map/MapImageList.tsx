import React from 'react';
import { useMapStore } from '../../store/mapStore';

interface MapImageListProps {
  folderId: string | null;
  currentImageId: number | null;
  onImageSelect: (imageId: number) => void;
}

export default function MapImageList({ folderId, currentImageId, onImageSelect }: MapImageListProps) {
  // Get images from store
  const images = useMapStore(s => s.images);

  // Debug logging
  console.log('[MapImageList] RENDER');
  console.log('[MapImageList] folderId:', folderId);
  console.log('[MapImageList] images.length:', images.length);
  console.log('[MapImageList] images:', images);
  console.log('[MapImageList] currentImageId:', currentImageId);

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

  // Simply display list of image IDs
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 text-xs text-gray-500 font-semibold">
        이미지 목록 ({images.length}개)
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-1 p-2">
          {images.map((image) => (
            <button
              key={image.id}
              onClick={() => {
                console.log('[MapImageList] Clicked image:', image.id);
                onImageSelect(image.id);
              }}
              className={`w-full text-left px-3 py-2 rounded border hover:bg-blue-50 ${
                currentImageId === image.id 
                  ? 'bg-blue-100 border-blue-500 border-2' 
                  : 'border-gray-200'
              }`}
            >
              <div className="text-sm font-medium">Image ID: {image.id}</div>
              <div className="text-xs text-gray-500">{image.name}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
