import React from 'react';
import { useMapStore } from '../../store/mapStore';
import MapImageList from './MapImageList';

interface SidebarProps {
  projectId: string;
  currentId: string | null;
  setCurrentId: (id: string) => void;
  annotationIdList: string[];
  onUploadSuccess?: (id: string) => void;
  folderId?: string | null;
  currentImageId?: number | null;
  onImageSelect?: (imageId: number) => void;
}

export default function MapImageSidebar({ 
  projectId, 
  currentId, 
  setCurrentId, 
  annotationIdList,
  onUploadSuccess,
  folderId,
  currentImageId,
  onImageSelect
}: SidebarProps) {
  const { openMapFolder } = useMapStore();

  const handleUploadFolder = () => {
    openMapFolder((fId) => {
      console.log('Folder uploaded:', fId);
      if (onUploadSuccess) {
        onUploadSuccess(fId);
      }
    });
  };

  return (
    <aside className="p-2 w-64 border-r flex flex-col gap-3 bg-gray-50 h-full min-h-0">
      <div className="flex flex-col gap-2">
        <div className="font-bold">Images</div>
        <button
          onClick={handleUploadFolder}
          className="w-full px-3 py-2 bg-brand-600 text-white rounded hover:bg-brand-700 text-sm"
        >
          Upload Folder
        </button>
      </div>

      {/* Image list */}
      {folderId && onImageSelect ? (
        <div className="flex-1 min-h-0">
          <MapImageList
            folderId={folderId}
            currentImageId={currentImageId || null}
            onImageSelect={onImageSelect}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="text-sm text-gray-500 mb-2">Annotations</div>
          <ul>
            {annotationIdList.map(id => (
              <li key={id}>
                <button
                  className={`w-full text-left px-2 py-1 hover:bg-brand-50 rounded ${
                    currentId === id ? 'bg-brand-100 font-bold' : ''
                  }`}
                  onClick={() => setCurrentId(id)}
                >
                  <span className="text-xs mr-2">{id}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}