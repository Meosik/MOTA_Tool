// frontend/src/store/frameStore.ts
import { create } from 'zustand';
import { fetchFrameBoxes, fetchTracksWindow, type FlatBox } from '../lib/api';
import type { Box } from '../types/annotation';

export type Frame = { i:number; url?:string; file?:File };
// Box 타입은 공통 타입 사용 (src/types/annotation)

type EditEntry = { frame:number; id:number; before?:Box; after?:Box };

type State = {
  // 타임라인/이미지
  frames: Frame[];
  cur: number;
  isPlaying: boolean;

  // 로딩 표시(선택)
  isLoading: boolean;
  loadProgress: number; // 0~1

  // 어노테이션 id
  gtAnnotationId?: string;
  predAnnotationId?: string;

  // 표시 옵션/슬라이더
  iou: number;
  conf: number;
  showGT: boolean;
  showPred: boolean;

  // 오버레이 오버라이드 + 히스토리
  overrides: Map<number, Map<number, Box>>;
  overrideVersion: number;
  undoStack: EditEntry[];
  redoStack: EditEntry[];

  // ID Switch 감지
  idswFrames: number[];

  // 이미지 캐시 (디코드된 Image)
  imgCache: Map<string, Promise<HTMLImageElement>>;

  // 액션
  setFrames: (frames: Frame[]) => void;
  setCur: (idx:number)=>void;
  setPlaying: (v:boolean)=>void;

  openFrameDir: ()=>void;
  openGT: ()=>void;
  openPred: ()=>void;

  setGT: (annId?:string)=>void;
  setPred: (annId?:string)=>void;

  setIou: (v:number)=>void;
  setConf: (v:number)=>void;

  getImage: (url:string)=>Promise<HTMLImageElement>;
  prefetchAround: (center:number, radius?:number)=>void;

  // 배치 캐시
  fillCacheWindow: (kind:'gt'|'pred', f0:number, f1:number)=>Promise<void>;
  getPredBox: (frame:number, id:number, base:Box)=>Box;

  applyOverrideWithHistory:(frame:number, id:number, next:Box)=>void;
  changeOverrideIdWithHistory:(frame:number, oldId:number, newId:number, geom:Omit<Box,'id'>)=>void;
  undo: ()=>void;
  redo: ()=>void;
  resetFrame: (frame:number)=>void;
  resetCurrentFrame: ()=>void;
  exportModifiedPred: ()=>void;
  scanIdSwitches: ()=>Promise<void>;
};

// ---- Tracks 캐시 (변경 없음)
const gtCache = new Map<string, FlatBox[]>();
const prCache = new Map<string, FlatBox[]>();
const inFlight = new Map<string, Promise<void>>();
function toBox(fb:FlatBox): Box {
  const [x,y,w,h] = fb.bbox.map(Number) as [number,number,number,number];
  return { id: Number(fb.id), x,y,w,h, ...(fb.conf!=null?{conf:Number(fb.conf)}:{}) };
}

// ---- ObjectURL LRU (핵심 개선)
const MAX_URLS = 150; // Phase 1: 축소 (400 → 150) - 메모리 절약
const urlLRU: string[] = [];             // 최근 사용 순
const urlOwner = new Map<string, number>(); // url -> frameIndex

// ---- Image Cache LRU (Phase 1: 새로 추가)
const MAX_DECODED_IMAGES = 200; // ~600MB 최대
const imgCacheLRU: string[] = [];

function touchURL(url:string){
  const i = urlLRU.indexOf(url);
  if (i>=0) urlLRU.splice(i,1);
  urlLRU.push(url);
  while (urlLRU.length > MAX_URLS){
    const old = urlLRU.shift()!;
    try { URL.revokeObjectURL(old); } catch {}
  }
}

// Phase 1: 디코드된 이미지 LRU 관리
function touchDecodedImage(url: string, cache: Map<string, Promise<HTMLImageElement>>) {
  const i = imgCacheLRU.indexOf(url);
  if (i >= 0) imgCacheLRU.splice(i, 1);
  imgCacheLRU.push(url);
  
  // 가장 오래된 디코드 이미지 제거
  while (imgCacheLRU.length > MAX_DECODED_IMAGES) {
    const oldUrl = imgCacheLRU.shift()!;
    cache.delete(oldUrl);
  }
}

function attachURLToFrame(frames: Frame[], idx:number, url:string): Frame[] {
  const nf = frames.slice();
  nf[idx] = { ...nf[idx], url };
  return nf;
}

// 지연 URL 생성: 현재/주변만 필요 때 생성
function ensureObjectURLFor(index:number){
  const st = useFrameStore.getState();
  const frames = st.frames;
  if (index<0 || index>=frames.length) return;
  const f = frames[index];
  if (f.url) { touchURL(f.url); return; }
  if (!f.file) return; // URL 생성 불가
  const url = URL.createObjectURL(f.file);
  urlOwner.set(url, index);
  touchURL(url);
  useFrameStore.setState({ frames: attachURLToFrame(frames, index, url) });
}

// Phase 2: 메모리 압박 감지 (적응형 prefetch)
function getAdaptiveRadius(): number {
  // @ts-ignore - performance.memory는 Chrome 전용
  const memInfo = performance.memory;
  if (memInfo) {
    const usedPercent = memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit;
    if (usedPercent > 0.8) return 1;  // 메모리 부족: 최소 prefetch
    if (usedPercent > 0.6) return 2;  // 보통: 기본 prefetch
    return 3;  // 여유: 적극적 prefetch
  }
  return 2;  // 기본값: 보수적
}

// ---- Prefetch 스케줄링 (과도한 폭주 방지)
let prefetchTimer: number | null = null;
let lastPrefetchCenter = -1;

function schedulePrefetch(center:number, radius:number, prioritizeForward = false){
  if (prefetchTimer!=null) { cancelAnimationFrame(prefetchTimer); prefetchTimer = null; }
  prefetchTimer = requestAnimationFrame(()=>{
    const st = useFrameStore.getState();
    const N = st.frames.length;
    
    if (prioritizeForward) {
      // 재생 중: 앞쪽 프레임 우선 프리페치 (디코딩 시간 확보)
      // forward: center+1 ~ center+radius*2
      // backward: center-1 ~ center-radius
      const forwardLo = Math.min(N-1, center + 1);
      const forwardHi = Math.min(N-1, center + radius * 2);
      const backwardLo = Math.max(0, center - radius);
      const backwardHi = Math.max(0, center - 1);
      
      // 앞쪽 먼저 prefetch (더 중요)
      for (let i = forwardLo; i <= forwardHi; i++) {
        ensureObjectURLFor(i);
        // 즉시 디코딩 시작 (Image decode 병렬화)
        const frame = st.frames[i];
        if (frame.url) st.getImage(frame.url).catch(()=>{});
      }
      // 뒤쪽 prefetch
      for (let i = backwardHi; i >= backwardLo; i--) {
        ensureObjectURLFor(i);
      }
    } else {
      // 일반 모드: 양방향 균등 prefetch
      const lo = Math.max(0, center - radius);
      const hi = Math.min(N-1, center + radius);
      for (let i=lo; i<=hi; i++) {
        ensureObjectURLFor(i);
      }
    }
    
    lastPrefetchCenter = center;
  });
}

// ---- Zustand
const useFrameStore = create<State>((set, get) => ({
  frames: [],
  cur: 0,
  isPlaying: false,

  isLoading: false,
  loadProgress: 0,

  gtAnnotationId: undefined,
  predAnnotationId: undefined,

  iou: 0.5,
  conf: 0.0,
  showGT: true,
  showPred: true,

  overrides: new Map(),
  overrideVersion: 0,
  undoStack: [],
  redoStack: [],

  idswFrames: [],

  imgCache: new Map(),

  setFrames: (frames)=> set({ frames, cur: 0 }),

  setCur: (idx)=>{
    const N = get().frames.length;
    if (N===0) return;
    const clamped = Math.max(0, Math.min(N-1, idx));
    set({ cur: clamped });
    // 현재 + 주변만 URL 보장
    ensureObjectURLFor(clamped);
    schedulePrefetch(clamped, 2);
  },

  setPlaying: (v)=> set({ isPlaying: v }),

  openFrameDir: ()=>{
    const input = document.createElement('input');
    input.type = 'file';
    // 폴더 업로드
    
    input.webkitdirectory = true;
    // @ts-expect-error
    input.directory = true;
    // @ts-expect-error
    input.mozdirectory = true;
    // @ts-expect-error
    input.msdirectory = true;
    input.multiple = true;
    input.accept = 'image/*';

    input.onchange = () => {
      const fileList = Array.from(input.files || []);
      if (fileList.length === 0) return;

      set({ isLoading: true, loadProgress: 0 });

      // 이미지 파일만
      const images = fileList.filter(f => f.type.startsWith('image/'));
      // 상대경로 기준 숫자 인지 정렬
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      images.sort((a, b) => {
        const pa = (a as any).webkitRelativePath || a.name;
        const pb = (b as any).webkitRelativePath || b.name;
        return collator.compare(pa, pb);
      });

      // URL은 만들지 않고 파일만 보관 (지연 생성)
      const frames: Frame[] = images.map((f, idx) => ({ i: idx+1, file: f }));

      // 기존 캐시/URL 풀 리셋
      get().imgCache.clear();
      for (const u of urlLRU.splice(0)) { try{ URL.revokeObjectURL(u) }catch{} }
      urlOwner.clear();

      // 세팅
      set({ frames, cur: 0, isPlaying: false });

      // 첫 프레임과 주변 몇 장만 즉시 URL 확보
      ensureObjectURLFor(0);
      schedulePrefetch(0, 3);

      set({ isLoading: false, loadProgress: 1 });
    };

    input.click();
  },

  openGT: ()=>{
    const input = document.createElement('input');
    input.type='file'; input.accept='.txt,.json';
    input.onchange = async ()=>{
      const f = input.files?.[0]; if(!f) return;
      const fd = new FormData();
      fd.append('kind','gt'); fd.append('file', f);
      const base = (import.meta as any).env?.VITE_API_BASE || 'http://127.0.0.1:8000';
      const r = await fetch(base + '/annotations', { method:'POST', body:fd }).catch(()=>null);
      if(!r || !r.ok){ alert('GT 업로드 실패'); return; }
      const js = await r.json();
      set({ gtAnnotationId: js.annotation_id });
    };
    input.click();
  },

  openPred: ()=>{
    const input = document.createElement('input');
    input.type='file'; input.accept='.txt,.json';
    input.onchange = async ()=>{
      const f = input.files?.[0]; if(!f) return;
      const fd = new FormData();
      fd.append('kind','pred'); fd.append('file', f);
      const base = (import.meta as any).env?.VITE_API_BASE || 'http://127.0.0.1:8000';
      const r = await fetch(base + '/annotations', { method:'POST', body:fd }).catch(()=>null);
      if(!r || !r.ok){ alert('Pred 업로드 실패'); return; }
      const js = await r.json();
      set({ predAnnotationId: js.annotation_id });
    };
    input.click();
  },

  setGT: (id)=> {
    // Phase 1: 새 GT 파일 로드 시 이전 GT 캐시 정리
    const oldId = get().gtAnnotationId;
    if (id !== oldId && oldId) {
      // 이전 GT 캐시의 모든 항목 제거
      for (const key of Array.from(gtCache.keys())) {
        if (key.startsWith(`${oldId}:`)) {
          gtCache.delete(key);
        }
      }
    }
    set({ gtAnnotationId: id });
  },
  setPred: (id)=> {
    // Phase 1: 새 Pred 파일 로드 시 이전 Pred 캐시 정리
    const oldId = get().predAnnotationId;
    if (id !== oldId && oldId) {
      // 이전 Pred 캐시의 모든 항목 제거
      for (const key of Array.from(prCache.keys())) {
        if (key.startsWith(`${oldId}:`)) {
          prCache.delete(key);
        }
      }
    }
    set({ predAnnotationId: id });
  },

  setIou: (v)=> set({ iou: Math.max(0, Math.min(1, v)) }),
  setConf: (v)=> set({ conf: Math.max(0, Math.min(1, v)) }),

  getImage: async(url:string)=>{
    const cache = get().imgCache;
    const hit = cache.get(url);
    if (hit) {
      // Phase 1: 캐시 히트 시 LRU 업데이트
      touchDecodedImage(url, cache);
      return hit;
    }
    const p = new Promise<HTMLImageElement>((resolve,reject)=>{
      const img = new Image();
      img.onload = ()=> { 
        touchURL(url);
        // Phase 1: 디코드 완료 시 LRU 추가
        touchDecodedImage(url, cache);
        resolve(img); 
      };
      img.onerror = reject;
      img.src = url;
      // modern 브라우저에서 디코드 힌트
      // @ts-ignore
      img.decoding = 'async';
    });
    cache.set(url, p);
    return p;
  },

  prefetchAround: (center, radius?, prioritizeForward?)=>{
    // Phase 2: radius가 지정되지 않으면 적응형 사용
    const adaptiveRadius = radius ?? getAdaptiveRadius();
    const isPlaying = get().isPlaying;
    schedulePrefetch(center, adaptiveRadius, prioritizeForward ?? isPlaying);
  },

  fillCacheWindow: async(kind, f0, f1)=>{
    const ann = kind==='gt' ? get().gtAnnotationId : get().predAnnotationId;
    if(!ann) return;
    const key = `${kind}:${ann}:${f0}-${f1}`;
    if (inFlight.has(key)) return inFlight.get(key)!;
    const p = (async()=>{
      const data = await fetchTracksWindow(ann, f0, f1);
      const target = (kind==='gt'? gtCache : prCache);
      for (const tr of data.tracks || []) {
        for (const fr of tr.frames || []) {
          const k = `${ann}:${fr.f}`;
          const list = target.get(k) || [];
          if (!list.find(v => String(v.id)===String(tr.id))) {
            const fb: FlatBox = { id: tr.id, bbox: fr.bbox.map(Number) as any, ...(fr.conf!=null?{conf:Number(fr.conf)}:{}) };
            list.push(fb);
            target.set(k, list);
          }
        }
      }
    })().finally(()=> inFlight.delete(key));
    inFlight.set(key, p);
    return p;
  },

  getPredBox: (frame, id, base)=>{
    const ov = get().overrides.get(frame)?.get(id);
    return ov ? ov : base;
  },

  applyOverrideWithHistory: (frame, id, next)=>{
    const curMap = new Map(get().overrides.get(frame) || []);
    const before = curMap.get(id);
    curMap.set(id, { ...next });
    const overrides = new Map(get().overrides);
    overrides.set(frame, curMap);
    
    // Phase 2: undo 스택 크기 제한 (최대 100개)
    const MAX_UNDO_STACK = 100;
    let undoStack = [...get().undoStack, { frame, id, before, after: next }];
    if (undoStack.length > MAX_UNDO_STACK) {
      undoStack = undoStack.slice(-MAX_UNDO_STACK);
    }
    
    set({
      overrides,
      overrideVersion: get().overrideVersion + 1,
      undoStack,
      redoStack: [],
    });
  },

  // Array.at(-1) 미사용 (낮은 lib 대응)
  undo: ()=>{
    const us = get().undoStack;
    const ent = us.length ? us[us.length - 1] : undefined;
    if(!ent) return;
    const u = us.slice(0, us.length - 1);
    const r = [...get().redoStack, ent];
    const map = new Map(get().overrides.get(ent.frame) || []);
    if (ent.before) map.set(ent.id, ent.before);
    else map.delete(ent.id);
    const overrides = new Map(get().overrides); overrides.set(ent.frame, map);
    set({ overrides, overrideVersion: get().overrideVersion + 1, undoStack: u, redoStack: r });
  },

  redo: ()=>{
    const rs = get().redoStack;
    const ent = rs.length ? rs[rs.length - 1] : undefined;
    if(!ent) return;
    const u = [...get().undoStack, ent];
    const r = rs.slice(0, rs.length - 1);
    const map = new Map(get().overrides.get(ent.frame) || []);
    if (ent.after) map.set(ent.id, ent.after);
    else map.delete(ent.id);
    const overrides = new Map(get().overrides); overrides.set(ent.frame, map);
    set({ overrides, overrideVersion: get().overrideVersion + 1, undoStack: u, redoStack: r });
  },

  resetFrame: (frame)=>{
    const overrides = new Map(get().overrides);
    overrides.delete(frame);
    set({ overrides, overrideVersion: get().overrideVersion + 1 });
  },

  resetCurrentFrame: ()=>{
    const frame = get().frames[get().cur];
    if (frame) get().resetFrame(frame.i);
  },

  changeOverrideIdWithHistory: (frame, oldId, newId, geom)=>{
    const curMap = new Map(get().overrides.get(frame) || []);
    const before = curMap.get(oldId);
    const newBox: Box = { id: newId, ...geom };
    curMap.delete(oldId);
    curMap.set(newId, newBox);
    const overrides = new Map(get().overrides);
    overrides.set(frame, curMap);
    
    // ID 변경을 히스토리에 기록 (oldId 삭제, newId 추가)
    // Phase 2: undo 스택 크기 제한
    const MAX_UNDO_STACK = 100;
    let undoStack = [
      ...get().undoStack,
      { frame, id: oldId, before, after: undefined },
      { frame, id: newId, before: undefined, after: newBox }
    ];
    if (undoStack.length > MAX_UNDO_STACK) {
      undoStack = undoStack.slice(-MAX_UNDO_STACK);
    }
    
    set({
      overrides,
      overrideVersion: get().overrideVersion + 1,
      undoStack,
      redoStack: [],
    });
  },

  exportModifiedPred: ()=>{
    const frames = get().frames;
    const overrides = get().overrides;
    const predAnnId = get().predAnnotationId;
    
    if (!predAnnId) { alert('Pred 파일을 먼저 불러오세요'); return; }
    if (frames.length === 0) { alert('프레임을 먼저 불러오세요'); return; }
    
    // 수정된 모든 박스를 MOT 형식으로 내보내기
    const lines: string[] = [];
    
    for (const frame of frames) {
      const frameOverrides = overrides.get(frame.i);
      if (!frameOverrides || frameOverrides.size === 0) continue;
      
      for (const [boxId, box] of frameOverrides.entries()) {
        const conf = box.conf ?? 1.0;
        const line = `${frame.i},${boxId},${box.x.toFixed(2)},${box.y.toFixed(2)},${box.w.toFixed(2)},${box.h.toFixed(2)},${conf.toFixed(4)},-1,-1,-1`;
        lines.push(line);
      }
    }
    
    if (lines.length === 0) { alert('수정된 박스가 없습니다'); return; }
    
    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pred_modified_${new Date().getTime()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  scanIdSwitches: async ()=>{
    const gtId = get().gtAnnotationId;
    const predId = get().predAnnotationId;
    const frames = get().frames;
    
    if (!gtId || !predId) { alert('GT와 Pred를 모두 불러오세요'); return; }
    if (frames.length === 0) { alert('프레임을 먼저 불러오세요'); return; }
    
    const idswSet = new Set<number>();
    const iouThr = get().iou;
    
    // 각 프레임에서 ID 스위치 감지
    for (const frame of frames) {
      try {
        const gtBoxes = await fetchFrameBoxes(gtId, frame.i);
        const predBoxes = await fetchFrameBoxes(predId, frame.i);
        
        if (gtBoxes.length === 0 || predBoxes.length === 0) continue;
        
        // 그리디 매칭 (간단한 버전)
        const gtAssigned = new Map<number, number>(); // gt_idx -> pred_idx
        const predUsed = new Set<number>();
        
        // IoU 기준 정렬
        const pairs: {gtIdx:number; predIdx:number; iov:number}[] = [];
        for (let gi = 0; gi < gtBoxes.length; gi++) {
          for (let pi = 0; pi < predBoxes.length; pi++) {
            const gBbox = gtBoxes[gi].bbox as [number,number,number,number];
            const pBbox = predBoxes[pi].bbox as [number,number,number,number];
            const [gx,gy,gw,gh] = gBbox;
            const [px,py,pw,ph] = pBbox;
            const x1 = Math.max(gx, px), y1 = Math.max(gy, py);
            const x2 = Math.min(gx+gw, px+pw), y2 = Math.min(gy+gh, py+ph);
            const iw = Math.max(0, x2-x1), ih = Math.max(0, y2-y1);
            const inter = iw*ih;
            const union = gw*gh + pw*ph - inter;
            const iov = union > 0 ? inter / union : 0;
            if (iov >= iouThr) {
              pairs.push({gtIdx: gi, predIdx: pi, iov});
            }
          }
        }
        
        pairs.sort((a,b)=> b.iov - a.iov);
        for (const p of pairs) {
          if (!gtAssigned.has(p.gtIdx) && !predUsed.has(p.predIdx)) {
            gtAssigned.set(p.gtIdx, p.predIdx);
            predUsed.add(p.predIdx);
          }
        }
        
        // ID 스위치 검사
        for (const [gtIdx, predIdx] of gtAssigned) {
          const gtId_val = Number(gtBoxes[gtIdx].id);
          const predId_val = Number(predBoxes[predIdx].id);
          if (gtId_val !== predId_val) {
            idswSet.add(frame.i);
            break; // 프레임당 한 번만 기록
          }
        }
      } catch (e) {
        console.warn(`IDSW 스캔 오류 (프레임 ${frame.i}):`, e);
      }
    }
    
    const idswFrames = Array.from(idswSet).sort((a,b)=>a-b);
    set({ idswFrames });
  },
}));

export default useFrameStore;
export { gtCache, prCache };
