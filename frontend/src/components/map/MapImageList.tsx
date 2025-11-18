import React, { useState } from 'react';
import { useMapImages } from '../../hooks/mapApi';

interface MapImageListProps {
  folderId: string | null;
  currentImageId: number | null;
  onImageSelect: (imageId: number) => void;
}

export default function MapImageList({ folderId, currentImageId, onImageSelect }: MapImageListProps) {
  const { data: images, isLoading, error } = useMapImages(folderId);
  const [searchTerm, setSearchTerm] = useState('');

  if (!folderId) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm p-4">
        Upload images to get started
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        Loading images...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-red-500 text-sm p-4">
        Error loading images
      </div>
    );
  }

  const imageList = Array.isArray(images) ? images : [];
  const filteredImages = imageList.filter(img => 
    img.file_name?.toLowerCase().includes(searchTerm.toLowerCase())
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
      <div className="px-3 py-1 text-xs text-gray-500">
        {filteredImages.length} {filteredImages.length === 1 ? 'image' : 'images'}
      </div>
      <div className="flex-1 overflow-y-auto">
        {filteredImages.length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-sm">
            {searchTerm ? 'No images match your search' : 'No images found'}
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {filteredImages.map((image) => (
              <button
                key={image.id}
                onClick={() => onImageSelect(image.id)}
                className={`w-full text-left px-3 py-2 rounded hover:bg-brand-50 transition-colors ${
                  currentImageId === image.id ? 'bg-brand-100 font-semibold' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-12 h-12 bg-gray-200 rounded flex-shrink-0 flex items-center justify-center text-gray-400 text-xs">
                    IMG
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{image.file_name || `Image ${image.id}`}</div>
                    <div className="text-xs text-gray-500">ID: {image.id}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
