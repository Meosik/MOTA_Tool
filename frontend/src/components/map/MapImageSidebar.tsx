import { useMapImages } from '../../hooks/mapApi';
import React from 'react';

export default function MapImageSidebar({ projectId, currentId, setCurrentId }: {
  projectId: string, currentId: number | null, setCurrentId: (id: number) => void
}) {
  const { data: images, isLoading, error } = useMapImages(projectId);
  if (isLoading) return <aside className="w-64">Loading...</aside>
  if (error) return <aside className="w-64 text-red-700">{String(error)}</aside>
  return (
    <aside className="p-2 w-64 border-r flex flex-col gap-3 bg-gray-50 h-full min-h-0">
      <div className="font-bold">이미지 목록</div>
      <div className="flex-1 overflow-auto">
        <ul>
          {(Array.isArray(images) ? images : []).map((img: any) => (
            <li key={img.id}>
              <button
                className={`w-full text-left px-2 py-1 hover:bg-brand-50 ${currentId === img.id ? 'bg-brand-100 font-bold' : ''}`}
                onClick={() => setCurrentId(img.id)}
              >
                <span className="text-xs mr-2">{img.id}</span>
                <span>{img.file_name}</span>
                {img.num_gt != null && <span className="inline-block ml-2 text-xs text-slate-400">GT: {img.num_gt} P: {img.num_pred}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}