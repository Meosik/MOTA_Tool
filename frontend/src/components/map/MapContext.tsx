import React, { createContext, useContext, useState } from 'react';

interface MapContextProps {
  projectId: string;
  setProjectId: (id: string) => void;
  imageId: number | null;
  setImageId: (id: number | null) => void;
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
  return (
    <MapContext.Provider value={{ projectId, setProjectId, imageId, setImageId }}>
      {children}
    </MapContext.Provider>
  );
};
