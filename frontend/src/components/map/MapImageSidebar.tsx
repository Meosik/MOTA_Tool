import React from 'react';

interface SidebarProps {
  projectId: string;
  currentId: string | null;
  setCurrentId: (id: string) => void;
  annotationIdList: string[];
  onUploadSuccess?: (id: string) => void;
}

export default function MapImageSidebar({ projectId, currentId, setCurrentId, annotationIdList }: SidebarProps) {
  return (
    <aside className="p-2 w-64 border-r flex flex-col gap-3 bg-gray-50 h-full min-h-0">
      <div className="font-bold">어노테이션 목록</div>
      <div className="flex-1 overflow-auto">
        <ul>
          {annotationIdList.map(id => (
            <li key={id}>
              <button
                className={`w-full text-left px-2 py-1 hover:bg-brand-50 ${currentId === id ? 'bg-brand-100 font-bold' : ''}`}
                onClick={() => setCurrentId(id)}
              >
                <span className="text-xs mr-2">{id}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}