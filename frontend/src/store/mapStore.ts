/**
 * Map mode store for mAP calculation and display
 */
import { create } from 'zustand';
import { MapMetrics, Category, BBoxAnnotation, calculateMap } from '../lib/api';

interface MapState {
  // Mode toggle
  isMapMode: boolean;
  setMapMode: (enabled: boolean) => void;

  // Categories/Classes
  categories: Record<number, Category>;
  setCategories: (cats: Record<number, Category>) => void;

  // Current frame annotations (for single frame mAP)
  gtAnnotations: BBoxAnnotation[];
  predAnnotations: BBoxAnnotation[];
  setGtAnnotations: (anns: BBoxAnnotation[]) => void;
  setPredAnnotations: (anns: BBoxAnnotation[]) => void;

  // Metrics results
  mapMetrics: MapMetrics | null;
  isCalculating: boolean;
  error: string | null;

  // Calculate mAP
  calculateCurrentMap: (iouThreshold: number, confThreshold: number) => Promise<void>;

  // Clear state
  clear: () => void;
}

const useMapStore = create<MapState>((set, get) => ({
  // Initial state
  isMapMode: false,
  categories: {},
  gtAnnotations: [],
  predAnnotations: [],
  mapMetrics: null,
  isCalculating: false,
  error: null,

  // Actions
  setMapMode: (enabled: boolean) => set({ isMapMode: enabled }),

  setCategories: (cats: Record<number, Category>) => set({ categories: cats }),

  setGtAnnotations: (anns: BBoxAnnotation[]) => set({ gtAnnotations: anns }),

  setPredAnnotations: (anns: BBoxAnnotation[]) => set({ predAnnotations: anns }),

  calculateCurrentMap: async (iouThreshold: number, confThreshold: number) => {
    const state = get();
    
    // Validate we have data
    if (Object.keys(state.categories).length === 0) {
      set({ error: 'No categories defined' });
      return;
    }

    if (state.gtAnnotations.length === 0 && state.predAnnotations.length === 0) {
      set({ error: 'No annotations to evaluate' });
      return;
    }

    set({ isCalculating: true, error: null });

    try {
      const metrics = await calculateMap({
        gt_annotations: state.gtAnnotations,
        pred_annotations: state.predAnnotations,
        categories: state.categories,
        iou_threshold: iouThreshold,
        confidence_threshold: confThreshold
      });

      set({ mapMetrics: metrics, isCalculating: false });
    } catch (err) {
      set({ 
        error: err instanceof Error ? err.message : 'Failed to calculate mAP',
        isCalculating: false 
      });
    }
  },

  clear: () => set({
    gtAnnotations: [],
    predAnnotations: [],
    mapMetrics: null,
    error: null
  })
}));

export default useMapStore;
