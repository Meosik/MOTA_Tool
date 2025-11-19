import { create } from 'zustand';
import type { Annotation } from '../types/annotation';
import { API_BASE } from '../lib/api';

export type MapImage = { id: number; name: string; file: File; url?: string };

interface MapState {
  // Image storage (like MOTA's frames)
  images: MapImage[];
  currentImageIndex: number;
  
  gtAnnotations: Annotation[];
  predAnnotations: Annotation[];
  originalPredAnnotations: Annotation[];  // Store original pred annotations for reset
  categories?: { [id: number]: string };
  undoStack: Annotation[][];
  redoStack: Annotation[][];
  editHistory: Array<{ type: 'gt' | 'pred'; annotations: Annotation[] }>;
  historyIndex: number;
  
  // Threshold values (like MOTA mode)
  iou: number;
  conf: number;
  setIou: (v: number) => void;
  setConf: (v: number) => void;
  
  setImages: (images: MapImage[]) => void;
  setCurrentImageIndex: (index: number) => void;
  getCurrentImage: () => MapImage | null;
  getImageUrl: (index: number) => string | null;
  
  setGT: (anns: Annotation[]) => void;
  setPred: (anns: Annotation[]) => void;
  updateAnnotation: (ann: Annotation, type: 'gt' | 'pred') => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  reset: () => void;
  resetCurrentFrame: () => void;  // New: reset only current frame
  openMapFolder: (cb?: (folderId: string) => void) => void;
  openMapGT: (cb?: (annotationId: string) => void) => void;
  openMapPred: (cb?: (annotationId: string) => void) => void;
  exportMapPred: () => void;
}

// ObjectURL management (similar to frameStore)
const urlCache = new Map<number, string>();

function getOrCreateImageUrl(image: MapImage, index: number): string {
  if (urlCache.has(index)) {
    return urlCache.get(index)!;
  }
  const url = URL.createObjectURL(image.file);
  urlCache.set(index, url);
  return url;
}

function clearUrlCache() {
  urlCache.forEach(url => {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  });
  urlCache.clear();
}

export const useMapStore = create<MapState>((set, get) => ({
  images: [],
  currentImageIndex: 0,
  gtAnnotations: [],
  predAnnotations: [],
  originalPredAnnotations: [],
  categories: undefined,
  undoStack: [],
  redoStack: [],
  editHistory: [],
  historyIndex: -1,
  
  // Threshold values (matching MOTA mode defaults)
  iou: 0.5,
  conf: 0.0,
  setIou: (v) => set({ iou: v }),
  setConf: (v) => set({ conf: v }),
  
  setImages: (images) => {
    clearUrlCache();
    set({ images, currentImageIndex: 0 });
  },
  
  setCurrentImageIndex: (index) => set({ currentImageIndex: index }),
  
  getCurrentImage: () => {
    const state = get();
    return state.images[state.currentImageIndex] || null;
  },
  
  getImageUrl: (index) => {
    const state = get();
    const image = state.images[index];
    if (!image) return null;
    return getOrCreateImageUrl(image, index);
  },
  
  setGT: (anns) => set(state => {
    const newHistory = state.editHistory.slice(0, state.historyIndex + 1);
    newHistory.push({ type: 'gt', annotations: anns });
    return {
      gtAnnotations: anns,
      editHistory: newHistory,
      historyIndex: newHistory.length - 1,
      undoStack: [...state.undoStack, state.gtAnnotations],
      redoStack: [],
    };
  }),
  
  setPred: (anns) => set(state => {
    const newHistory = state.editHistory.slice(0, state.historyIndex + 1);
    newHistory.push({ type: 'pred', annotations: anns });
    return {
      predAnnotations: anns,
      originalPredAnnotations: anns,  // Store original for reset functionality
      editHistory: newHistory,
      historyIndex: newHistory.length - 1,
      undoStack: [...state.undoStack, state.predAnnotations],
      redoStack: [],
    };
  }),
  
  updateAnnotation: (ann: Annotation, type: 'gt' | 'pred') => set(state => {
    // id와 image_id가 모두 일치하는 어노테이션만 교체
    const annotations = type === 'gt' ? state.gtAnnotations : state.predAnnotations;
    const updated = annotations.map(a => (a.id === ann.id && a.image_id === ann.image_id) ? { ...a, ...ann } : a);
    // 디버깅: predAnnotations 배열 전체를 콘솔로 출력
    if (type === 'pred') {
      console.log('[updateAnnotation] Incoming annotation ID:', ann.id, 'image_id:', ann.image_id);
      console.log('[updateAnnotation] First 5 pred IDs:', annotations.slice(0, 5).map(a => ({ id: a.id, image_id: a.image_id })));
      const changedCount = updated.filter((a, idx) => a !== annotations[idx]).length;
      console.log('[updateAnnotation] Number of annotations changed:', changedCount);
      console.log('[updateAnnotation] Total predictions:', annotations.length);
    }
    const newHistory = state.editHistory.slice(0, state.historyIndex + 1);
    newHistory.push({ type, annotations: updated });
    return {
      ...(type === 'gt' ? { gtAnnotations: updated } : { predAnnotations: updated }),
      editHistory: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),
  
  undo: () => set(state => {
    if (state.historyIndex <= 0) return state;
    const prevIndex = state.historyIndex - 1;
    const prevState = state.editHistory[prevIndex];
    
    return {
      ...state,
      ...(prevState.type === 'gt' 
        ? { gtAnnotations: prevState.annotations }
        : { predAnnotations: prevState.annotations }
      ),
      historyIndex: prevIndex,
    };
  }),
  
  redo: () => set(state => {
    if (state.historyIndex >= state.editHistory.length - 1) return state;
    const nextIndex = state.historyIndex + 1;
    const nextState = state.editHistory[nextIndex];
    
    return {
      ...state,
      ...(nextState.type === 'gt'
        ? { gtAnnotations: nextState.annotations }
        : { predAnnotations: nextState.annotations }
      ),
      historyIndex: nextIndex,
    };
  }),
  
  canUndo: () => {
    const state = get();
    return state.historyIndex > 0;
  },
  
  canRedo: () => {
    const state = get();
    return state.historyIndex < state.editHistory.length - 1;
  },
  
  reset: () => set(state => {
    const newHistory = state.editHistory.slice(0, state.historyIndex + 1);
    newHistory.push({ type: 'pred', annotations: [] });
    return {
      gtAnnotations: [],
      predAnnotations: [],
      editHistory: newHistory,
      historyIndex: newHistory.length - 1,
      undoStack: [...state.undoStack, state.gtAnnotations],
      redoStack: [],
    };
  }),
  
  resetCurrentFrame: () => set(state => {
    const currentImage = state.images[state.currentImageIndex];
    if (!currentImage) {
      console.log('[resetCurrentFrame] No current image found');
      return state;
    }
    
    const currentImageId = currentImage.id;
    console.log('[resetCurrentFrame] Current image ID:', currentImageId);
    console.log('[resetCurrentFrame] Total pred annotations:', state.predAnnotations.length);
    console.log('[resetCurrentFrame] Total original pred annotations:', state.originalPredAnnotations.length);
    
    // Get original pred annotations for current frame
    const originalForCurrentFrame = state.originalPredAnnotations.filter(
      ann => ann.image_id === currentImageId
    );
    console.log('[resetCurrentFrame] Original annotations for current frame:', originalForCurrentFrame.length);
    
    // Get current pred annotations for other frames
    const otherFramePreds = state.predAnnotations.filter(
      ann => ann.image_id !== currentImageId
    );
    console.log('[resetCurrentFrame] Pred annotations for other frames:', otherFramePreds.length);
    
    // Combine: original annotations for current frame + unchanged annotations for other frames
    const resetPredAnnotations = [...otherFramePreds, ...originalForCurrentFrame];
    console.log('[resetCurrentFrame] Total after reset:', resetPredAnnotations.length);
    
    const newHistory = state.editHistory.slice(0, state.historyIndex + 1);
    newHistory.push({ type: 'pred', annotations: resetPredAnnotations });
    
    return {
      predAnnotations: resetPredAnnotations,
      editHistory: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),
  
  openMapFolder: (cb?: (folderId: string) => void) => {
    const input = document.createElement('input');
    input.type = 'file';
    // 폴더 업로드 속성 (크로스브라우저)
    (input as any).webkitdirectory = true;
    // @ts-expect-error
    input.directory = true;
    // @ts-expect-error
    input.mozdirectory = true;
    // @ts-expect-error
    input.msdirectory = true;
    input.multiple = true;
    input.accept = 'image/*';
    input.onchange = (e: any) => {
      const fileList = Array.from(input.files || []) as File[];
      if (fileList.length === 0) return;
      
      // 이미지 파일만 필터 (type이 없는 경우 확장자로 판단)
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
      const imageFiles = fileList.filter(f => {
        if (f.type && f.type.startsWith('image/')) return true;
        // fallback: check file extension
        const ext = f.name.toLowerCase().slice(f.name.lastIndexOf('.'));
        return imageExtensions.includes(ext);
      });
      
      if (imageFiles.length === 0) {
        alert('이미지 파일이 없습니다.');
        return;
      }
      
      // 상대경로 기준 숫자 인지 정렬
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      imageFiles.sort((a, b) => {
        const pa = (a as any).webkitRelativePath || a.name;
        const pb = (b as any).webkitRelativePath || b.name;
        return collator.compare(pa, pb);
      });
      
      // COCO GT/Pred json이 먼저 로드되어 있으면 file_name -> image_id 매핑 시도
      let fileNameToImageId: Record<string, number> = {};
      const gtAnns = get().gtAnnotations;
      const predAnns = get().predAnnotations;
      // GT/Pred 어노테이션에서 image_id -> file_name 매핑 추출 (COCO images 정보 필요)
      // 실제로는 openMapGT/openMapPred에서 images 정보를 저장해두는 게 더 정확함
      // 여기서는 file_name이 id로 쓰인 경우만 우선 지원
      // 기본적으로 idx+1, file_name이 숫자면 그걸 id로 사용
      const mapImages: MapImage[] = imageFiles.map((file, idx) => {
        // 파일명에서 확장자 제거
        const base = file.name.replace(/\.[^/.]+$/, "");
        let id = idx + 1;
        // 파일명이 숫자면 id로 사용
        if (/^\d+$/.test(base)) {
          id = parseInt(base, 10);
        }
        return {
          id,
          name: file.name,
          file: file,
        };
      });
      get().setImages(mapImages);
      const folderId = `local_${Date.now()}`;
      alert(`이미지 폴더 로드 성공: ${imageFiles.length}개 이미지`);
      if (cb) cb(folderId);
    };
    input.click();
  },
  openMapGT: (cb) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const cocoData = JSON.parse(text);
        
        // Parse COCO format annotations
        const annotations: Annotation[] = [];
        let categories: { [id: number]: string } | undefined = undefined;
        if (cocoData.categories && Array.isArray(cocoData.categories)) {
          if (!categories) categories = {};
          cocoData.categories.forEach((cat: any) => {
            categories![cat.id] = cat.name;
          });
        }
        if (cocoData.annotations && Array.isArray(cocoData.annotations)) {
          cocoData.annotations.forEach((ann: any, idx: number) => {
            annotations.push({
              id: ann.id !== undefined ? ann.id : `gt_${idx}`,  // Generate ID if missing
              image_id: ann.image_id,
              category: ann.category_id || 1,
              bbox: ann.bbox || [0, 0, 0, 0],
              conf: 1.0,
              type: 'gt'
            });
          });
        }
        get().setGT(annotations);
        if (categories) set({ categories });
        const annotationId = `gt_${Date.now()}`;
        alert(`GT 로드 성공: ${annotations.length}개 annotations`);
        if (cb) cb(annotationId);
      } catch (err) {
        alert('GT 로드 실패: ' + err);
        console.error('GT loading error:', err);
      }
    };
    input.click();
  },
  openMapPred: (cb) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const cocoData = JSON.parse(text);
        
        // Parse COCO format annotations
        const annotations: Annotation[] = [];
        let categories: { [id: number]: string } | undefined = undefined;
        if (cocoData.categories && Array.isArray(cocoData.categories)) {
          if (!categories) categories = {};
          cocoData.categories.forEach((cat: any) => {
            categories![cat.id] = cat.name;
          });
        }
        if (Array.isArray(cocoData)) {
          // Array format (predictions only)
          cocoData.forEach((ann: any, idx: number) => {
            annotations.push({
              id: ann.id !== undefined ? ann.id : `pred_${idx}`,  // Generate ID if missing
              image_id: ann.image_id,
              category: ann.category_id || 1,
              bbox: ann.bbox || [0, 0, 0, 0],
              conf: ann.score !== undefined ? ann.score : 1.0,
              type: 'pred'
            });
          });
        } else if (cocoData.annotations && Array.isArray(cocoData.annotations)) {
          // Full COCO format
          cocoData.annotations.forEach((ann: any, idx: number) => {
            annotations.push({
              id: ann.id !== undefined ? ann.id : `pred_${idx}`,  // Generate ID if missing
              image_id: ann.image_id,
              category: ann.category_id || 1,
              bbox: ann.bbox || [0, 0, 0, 0],
              conf: ann.score !== undefined ? ann.score : 1.0,
              type: 'pred'
            });
          });
        }
        get().setPred(annotations);
        if (categories) set({ categories });
        const annotationId = `pred_${Date.now()}`;
        alert(`Predictions 로드 성공: ${annotations.length}개 annotations`);
        if (cb) cb(annotationId);
      } catch (err) {
        alert('Predictions 로드 실패: ' + err);
        console.error('Predictions loading error:', err);
      }
    };
    input.click();
  },
  exportMapPred: async () => {
    const state = get();
    if (state.predAnnotations.length === 0) {
      alert('No predictions to export');
      return;
    }
    
    // Convert to COCO format
    const cocoFormat = state.predAnnotations.map((ann, idx) => ({
      id: ann.id || idx + 1,
      image_id: ann.image_id || 1,
      category_id: ann.category || 1,
      bbox: ann.bbox,
      score: ann.conf || 1.0,
    }));
    
    // Create blob and download
    const blob = new Blob([JSON.stringify(cocoFormat, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `predictions_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('Predictions exported successfully');
  },
}));
