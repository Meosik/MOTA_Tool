import { create } from 'zustand';
import type { Annotation } from '../types/annotation';

interface MapState {
  gtAnnotations: Annotation[];
  predAnnotations: Annotation[];
  undoStack: Annotation[][];
  redoStack: Annotation[][];
  editHistory: Array<{ type: 'gt' | 'pred'; annotations: Annotation[] }>;
  historyIndex: number;
  setGT: (anns: Annotation[]) => void;
  setPred: (anns: Annotation[]) => void;
  updateAnnotation: (ann: Annotation, type: 'gt' | 'pred') => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  reset: () => void;
  openMapFolder: (cb?: (annotationId: string) => void) => void;
  openMapGT: (cb?: (annotationId: string) => void) => void;
  openMapPred: (cb?: (annotationId: string) => void) => void;
  exportMapPred: () => void;
}

export const useMapStore = create<MapState>((set, get) => ({
  gtAnnotations: [],
  predAnnotations: [],
  undoStack: [],
  redoStack: [],
  editHistory: [],
  historyIndex: -1,
  
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
      editHistory: newHistory,
      historyIndex: newHistory.length - 1,
      undoStack: [...state.undoStack, state.predAnnotations],
      redoStack: [],
    };
  }),
  
  updateAnnotation: (ann: Annotation, type: 'gt' | 'pred') => set(state => {
    const annotations = type === 'gt' ? state.gtAnnotations : state.predAnnotations;
    const updated = annotations.map(a => a.id === ann.id ? ann : a);
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
  openMapFolder: (cb?: (annotationId: string) => void) => {
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
    input.onchange = async (e: any) => {
      const fileList = Array.from(input.files || []);
      if (fileList.length === 0) return;
      // 이미지 파일만 필터
      const images = fileList.filter(f => f.type.startsWith('image/'));
      // 상대경로 기준 숫자 인지 정렬
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      images.sort((a, b) => {
        const pa = (a as any).webkitRelativePath || a.name;
        const pb = (b as any).webkitRelativePath || b.name;
        return collator.compare(pa, pb);
      });
      const form = new FormData();
      images.forEach((file) => {
        form.append('images', file, (file as any).webkitRelativePath || file.name);
      });
      try {
        const res = await fetch('/images/folder', { method: 'POST', body: form });
        if (!res.ok) throw new Error('업로드 실패');
        const data = await res.json();
        alert('이미지 폴더 업로드 성공: ' + (data.folder_id || '성공'));
        if (cb && data.folder_id) cb(data.folder_id);
      } catch (err) {
        alert('이미지 폴더 업로드 실패: ' + err);
      }
    };
    input.click();
  },
  openMapGT: (cb) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.json';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const form = new FormData();
      form.append('file', file);
      try {
        const res = await fetch('/annotations', { method: 'POST', body: form });
        if (!res.ok) throw new Error('업로드 실패');
        const data = await res.json();
        alert('GT 업로드 성공: ' + data.annotation_id);
        if (cb) cb(data.annotation_id);
      } catch (err) {
        alert('GT 업로드 실패: ' + err);
      }
    };
    input.click();
  },
  openMapPred: (cb) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.json';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const form = new FormData();
      form.append('file', file);
      try {
        const res = await fetch('/annotations', { method: 'POST', body: form });
        if (!res.ok) throw new Error('업로드 실패');
        const data = await res.json();
        alert('Pred 업로드 성공: ' + data.annotation_id);
        if (cb) cb(data.annotation_id);
      } catch (err) {
        alert('Pred 업로드 실패: ' + err);
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
