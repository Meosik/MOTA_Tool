import { create } from 'zustand';
import { uploadAnnotation } from '../lib/api';

export type Box = { x:number; y:number; w:number; h:number; id:number; conf?: number };
export type MotRecord = { frame:number; id:number; x:number; y:number; w:number; h:number; conf?: number };
type FrameMeta = { i:number; url:string };
type ImgCache = Map<string, HTMLImageElement>;

type State = {
  // 플레이 프레임들
  frames: FrameMeta[];
  cur: number;

  // 메모리 GT/Pred (서버 /tracks 미동작시 폴백용)
  gt: MotRecord[];
  pred: MotRecord[];

  // 업로드 후 받은 annotation id
  gtAnnotationId?: string;
  predAnnotationId?: string;

  // 표시 옵션 & 필터
  showGT: boolean;
  showPred: boolean;
  iou: number;   // 0~1
  conf: number;  // 0~1
  setIou: (v:number) => void;
  setConf: (v:number) => void;

  // 이미지 캐시 & 프리패치
  imgCache: ImgCache;
  cacheImage: (url: string, img: HTMLImageElement) => void;
  getImage: (url: string) => Promise<HTMLImageElement>;
  prefetchAround: (centerIndex: number, radius: number) => void;

  // 사용자가 수정한 Pred 오버라이드 (프레임별 id별)
  overrides: Map<number, Map<number, Box>>;
  overrideVersion: number;
  applyOverride: (frame: number, id: number, box: Box) => void;
  removeOverride: (frame: number, id: number) => void;
  clearOverridesFrame: (frame: number) => void;
  clearAllOverrides: () => void;
  getPredBox: (frame: number, id: number, base: Box) => Box;

  // UI 조작
  openFrameDir: () => void;
  openGT: () => void;
  openPred: () => void;

  // 상태 갱신
  setCur: (idx:number) => void;
  setFrames: (arr: FrameMeta[]) => void;
  setGT: (records: MotRecord[]) => void;
  setPred: (records: MotRecord[]) => void;
};

const useFrameStore = create<State>((set, get) => ({
  frames: [],
  cur: 0,

  gt: [],
  pred: [],
  gtAnnotationId: undefined,
  predAnnotationId: undefined,

  showGT: true,
  showPred: true,
  iou: 0.5,
  conf: 0.0,
  setIou: (v) => set({ iou: Math.max(0, Math.min(1, Number(v) || 0)) }),
  setConf: (v) => set({ conf: Math.max(0, Math.min(1, Number(v) || 0)) }),

  // 이미지 캐시
  imgCache: new Map<string, HTMLImageElement>(),
  cacheImage: (url, img) => {
    const next = new Map(get().imgCache);
    next.set(url, img);
    set({ imgCache: next });
  },
  getImage: (url) => new Promise((resolve, reject) => {
    const cache = get().imgCache;
    const cached = cache.get(url);
    if (cached && (cached.complete || (cached.naturalWidth + cached.naturalHeight) > 0)) {
      resolve(cached);
      return;
    }
    const im = new Image();
    im.onload = () => {
      const next = new Map(get().imgCache);
      next.set(url, im);
      set({ imgCache: next });
      resolve(im);
    };
    im.onerror = reject;
    im.src = url;
  }),
  prefetchAround: (center, radius) => {
    const { frames, getImage } = get();
    for (let d = -radius; d <= radius; d++) {
      if (d === 0) continue;
      const m = frames[center + d];
      if (m?.url) getImage(m.url).catch(() => {});
    }
  },

  // 사용자 오버라이드
  overrides: new Map(),
  overrideVersion: 0,
  applyOverride: (frame, id, box) => {
    const curMap = get().overrides;
    const next = new Map(curMap);
    const byFrame = new Map(next.get(frame) || new Map());
    byFrame.set(id, { ...box });
    next.set(frame, byFrame);
    set({ overrides: next, overrideVersion: get().overrideVersion + 1 });
  },
  removeOverride: (frame, id) => {
    const curMap = get().overrides;
    const next = new Map(curMap);
    const byFrame = new Map(next.get(frame) || new Map());
    if (byFrame.has(id)) {
      byFrame.delete(id);
      next.set(frame, byFrame);
      set({ overrides: next, overrideVersion: get().overrideVersion + 1 });
    }
  },
  clearOverridesFrame: (frame) => {
    const curMap = get().overrides;
    if (!curMap.has(frame)) return;
    const next = new Map(curMap);
    next.delete(frame);
    set({ overrides: next, overrideVersion: get().overrideVersion + 1 });
  },
  clearAllOverrides: () => {
    set({ overrides: new Map(), overrideVersion: get().overrideVersion + 1 });
  },
  getPredBox: (frame, id, base) => {
    const m = get().overrides.get(frame);
    const ov = m?.get(id);
    return ov ? ov : base;
  },

  // 프레임 폴더 열기(로컬 디렉토리)
  openFrameDir: () => {
    const input = document.createElement('input');
    // @ts-ignore
    input.webkitdirectory = true;
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const files = Array.from(input.files || []);
      files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      const metas: FrameMeta[] = files.map((f, idx) => ({ i: idx + 1, url: URL.createObjectURL(f) }));
      set({ frames: metas, cur: 0 });
    };
    input.click();
  },

  // GT 업로드 → annotation_id 저장
  openGT: () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.json';
    input.onchange = async () => {
      const f = (input.files && input.files[0]) || null;
      if (!f) return;
      try {
        const { annotation_id } = await uploadAnnotation('gt', f);
        set({ gtAnnotationId: annotation_id });
      } catch (e) {
        console.error('openGT failed', e);
      }
    };
    input.click();
  },

  // Pred 업로드 → annotation_id 저장
  openPred: () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.json';
    input.onchange = async () => {
      const f = (input.files && input.files[0]) || null;
      if (!f) return;
      try {
        const { annotation_id } = await uploadAnnotation('pred', f);
        set({ predAnnotationId: annotation_id });
      } catch (e) {
        console.error('openPred failed', e);
      }
    };
    input.click();
  },

  // 기본 상태 갱신
  setCur: (idx) => set({ cur: Math.max(0, Math.min(idx, get().frames.length - 1)) }),
  setFrames: (arr) => set({ frames: arr ?? [] }),
  setGT: (records) => set({ gt: records ?? [] }),
  setPred: (records) => set({ pred: records ?? [] }),
}));

// 프로젝트 내 파일들이 각각 named import 혹은 default import를 쓰는 경우가 있으므로 둘 다 제공
export { useFrameStore };
export default useFrameStore;
