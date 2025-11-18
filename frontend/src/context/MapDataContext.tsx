import React, { createContext, useContext, useState } from 'react';

export interface GTImageInfo { id: number; file_name: string; [k: string]: any }
export interface Annotation { id: number; image_id: number; category_id: number; bbox: number[]; [key: string]: any; }
export interface Category { id: number; name: string; [k: string]: any }

interface MapDataCtx {
  gtImages: Record<number, GTImageInfo>|null
  setGTImages: (imgs: Record<number, GTImageInfo>) => void
  gtAnnotations: Record<number, Annotation[]>|null
  setGTAnnotations: (anns: Record<number, Annotation[]>) => void
  categories: Record<number, Category>|null
  setCategories: (cats: Record<number, Category>) => void
  predAnnotations: Record<number, Annotation[]>|null
  setPredAnnotations: (anns: Record<number, Annotation[]>) => void
  imageDir: File[]|null
  setImageDir: (files: File[]) => void
  currentImageId: number|null
  setCurrentImageId: (id: number|null) => void
}

const Ctx = createContext<MapDataCtx|null>(null)

export function useMapData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMapData must be used within <MapDataProvider>');
  return ctx;
}

export function MapDataProvider({children}: {children: React.ReactNode}) {
  const [gtImages, setGTImages] = useState<Record<number, GTImageInfo>|null>(null)
  const [gtAnnotations, setGTAnnotations] = useState<Record<number, Annotation[]>|null>(null)
  const [categories, setCategories] = useState<Record<number, Category>|null>(null)
  const [predAnnotations, setPredAnnotations] = useState<Record<number, Annotation[]>|null>(null)
  const [imageDir, setImageDir] = useState<File[]|null>(null)
  const [currentImageId, setCurrentImageId] = useState<number|null>(null)
  return (
    <Ctx.Provider value={{
      gtImages, setGTImages,
      gtAnnotations, setGTAnnotations,
      categories, setCategories,
      predAnnotations, setPredAnnotations,
      imageDir, setImageDir,
      currentImageId, setCurrentImageId
    }}>
      {children}
    </Ctx.Provider>
  )
}