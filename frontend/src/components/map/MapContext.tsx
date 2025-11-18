import React, { createContext, useContext, useState } from 'react';

interface MapContextProps {
  projectId: string;
  setProjectId: (id: string) => void;
  imageId: number | null;
  setImageId: (id: number | null) => void;
  folderId: string | null;
  setFolderId: (id: string | null) => void;
  gtId: string | null;
  setGtId: (id: string | null) => void;
  predId: string | null;
  setPredId: (id: string | null) => void;
}

const MapContext = createContext<MapContextProps | undefined>(undefined);

export const useMapContext = () => {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error('useMapContext must be used within MapProvider');
  return ctx;
};

export const MapProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [projectId, setProjectId] = useState<string>('default');
  const [imageId, setImageId] = useState<number | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [gtId, setGtId] = useState<string | null>(null);
  const [predId, setPredId] = useState<string | null>(null);
  
  return (
    <MapContext.Provider value={{ 
      projectId, setProjectId, 
      imageId, setImageId,
      folderId, setFolderId,
      gtId, setGtId,
      predId, setPredId
    }}>
      {children}
    </MapContext.Provider>
  );
};
