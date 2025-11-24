import { create } from 'zustand'

interface UIState {
  motaLeftCollapsed: boolean;
  mapImageListCollapsed: boolean;
  setMotaLeftCollapsed: (v: boolean) => void;
  setMapImageListCollapsed: (v: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  motaLeftCollapsed: false,
  mapImageListCollapsed: false,
  setMotaLeftCollapsed: (v) => set({ motaLeftCollapsed: v }),
  setMapImageListCollapsed: (v) => set({ mapImageListCollapsed: v }),
}));
