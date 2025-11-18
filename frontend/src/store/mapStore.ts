  // ... (불필요한 }, 제거)
import { create } from 'zustand';
import type { Annotation } from '../types/annotation';

interface MapState {
  gtAnnotations: Annotation[];
  predAnnotations: Annotation[];
  undoStack: Annotation[][];
  redoStack: Annotation[][];
  setGT: (anns: Annotation[]) => void;
  setPred: (anns: Annotation[]) => void;
  undo: () => void;
  redo: () => void;
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
  setGT: (anns) => set(state => ({
    undoStack: [...state.undoStack, state.gtAnnotations],
    gtAnnotations: anns,
    redoStack: [],
  })),
  setPred: (anns) => set(state => ({
    undoStack: [...state.undoStack, state.predAnnotations],
    predAnnotations: anns,
    redoStack: [],
  })),
  undo: () => set(state => {
    if (state.undoStack.length === 0) return state;
    const prev = state.undoStack[state.undoStack.length - 1];
    return {
      ...state,
      gtAnnotations: prev,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [state.gtAnnotations, ...state.redoStack],
    };
  }),
  redo: () => set(state => {
    if (state.redoStack.length === 0) return state;
    const next = state.redoStack[0];
    return {
      ...state,
      gtAnnotations: next,
      redoStack: state.redoStack.slice(1),
      undoStack: [...state.undoStack, state.gtAnnotations],
    };
  }),
  reset: () => set(state => ({
    undoStack: [...state.undoStack, state.gtAnnotations],
    gtAnnotations: [],
    predAnnotations: [],
    redoStack: [],
  })),
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
  exportMapPred: () => {
    // TODO: 파일 다운로드 구현
    alert('MAP Pred 어노테이션 내보내기');
  },
}));
