import React, { useState } from 'react';
import { useMapStore } from '../../store/mapStore';

interface MapImageListProps {
  folderId: string | null;
  currentImageId: number | null;
  onImageSelect: (imageId: number) => void;
}

export default function MapImageList({ folderId, currentImageId, onImageSelect }: MapImageListProps) {
  const { images, getImageUrl, gtAnnotations, predAnnotations } = useMapStore();
  const [searchTerm, setSearchTerm] = useState('');

  // Debug logging
  console.log('[MapImageList] folderId:', folderId, 'images.length:', images.length, 'currentImageId:', currentImageId);

  if (!folderId || images.length === 0) {
    console.log('[MapImageList] Showing placeholder - folderId:', folderId, 'images.length:', images.length);
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm p-4">
        {!folderId ? 'TopBar에서 이미지 폴더를 업로드하세요' : 'Upload images to get started'}
      </div>
    );
  }

  const filteredImages = images.filter(img => 
    img.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">
      <div className="p-2">
        <input
          type="text"
          placeholder="Search images..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <div className="px-3 py-1 text-xs text-gray-500 font-semibold">
        Images ({filteredImages.length})
      </div>
      <div className="flex-1 overflow-y-auto">
        {filteredImages.length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-sm">
            {searchTerm ? 'No images match your search' : 'No images found'}
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {filteredImages.map((image, idx) => {
              // Find the actual index of this image in the full images array
              const actualIndex = images.findIndex(img => img.id === image.id);
              const thumbnailUrl = actualIndex >= 0 ? getImageUrl(actualIndex) : null;
              const gtCount = gtAnnotations.filter(a => a.image_id === image.id).length;
              const predCount = predAnnotations.filter(a => a.image_id === image.id).length;
              
              console.log(`[MapImageList] Image ${image.id} (${image.name}): actualIndex=${actualIndex}, thumbnailUrl=${thumbnailUrl}`);
              
              return (
                <button
                  key={image.id}
                  onClick={() => onImageSelect(image.id)}
                  className={`w-full text-left px-2 py-2 rounded hover:bg-brand-50 transition-colors ${
                    currentImageId === image.id ? 'bg-brand-100 border-2 border-brand-500' : 'border-2 border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {thumbnailUrl ? (
                      <img 
                        src={thumbnailUrl} 
                        alt={image.name}
                        className="w-16 h-16 object-cover rounded flex-shrink-0 bg-gray-200"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-gray-200 rounded flex-shrink-0 flex items-center justify-center text-gray-400 text-xs">
                        IMG
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate font-medium">{image.name || `Image ${image.id}`}</div>
                      <div className="text-xs text-gray-500">ID: {image.id}</div>
                      {(gtCount > 0 || predCount > 0) && (
                        <div className="text-xs text-gray-600 mt-0.5">
                          {gtCount > 0 && <span className="text-green-600">GT: {gtCount}</span>}
                          {gtCount > 0 && predCount > 0 && <span> | </span>}
                          {predCount > 0 && <span className="text-orange-600">Pred: {predCount}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
