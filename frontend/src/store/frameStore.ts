// frontend/src/store/frameStore.ts
import { create } from 'zustand';
import { fetchFrameBoxes, fetchTracksWindow, type FlatBox } from '../lib/api';
import { fetchAllTracks } from '../lib/api';
import { openTrackStream, TrackStreamHandle } from '../lib/trackStream';
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
  idswDetails: { f:number; tp:number; fp:number; fn:number; idsw:boolean; gt:number; pred:number }[];

  // 이미지 캐시 (디코드된 Image)
  imgCache: Map<string, Promise<HTMLImageElement>>;
  // 썸네일 캐시 (저해상도 dataURL)
  thumbnailCache: Map<number, string>;
  thumbnailVersion: number;

  // 트랙 데이터 변경 버전 (박스 캐시 업데이트 감지용)
  tracksVersion: number;
  // 전체 트랙이 선로딩 완료되었는지 (완료 시 윈도우 박스 fetch 생략)
  allTracksLoaded: boolean;

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

  getImage: (url:string, priority?:boolean)=>Promise<HTMLImageElement>;
  prefetchAround: (center:number, radius?:number)=>void;

  // 배치 캐시
  fillCacheWindow: (kind:'gt'|'pred', f0:number, f1:number)=>Promise<void>;
  getPredBox: (frame:number, id:number, base:Box)=>Box;
  getFrameBoxes: (kind:'gt'|'pred', frame:number)=>FlatBox[];
  preloadAllBoxes: ()=>Promise<void>;
  startTrackStream: (range:{f0:number; f1:number})=>void;
  stopTrackStream: ()=>void;
  _streamHandle?: TrackStreamHandle;
  ensureFrameURL: (index:number)=>void;
  getThumbnail: (frame:number)=>string|undefined;
  requestThumbnail: (frame:number)=>void;
  fetchSingleFrameBoxes: (kind:'gt'|'pred', frame:number)=>Promise<void>;

  applyOverrideWithHistory:(frame:number, id:number, next:Box)=>void;
  changeOverrideIdWithHistory:(frame:number, oldId:number, newId:number, geom:Omit<Box,'id'>)=>void;
  undo: ()=>void;
  redo: ()=>void;
  resetFrame: (frame:number)=>void;
  resetCurrentFrame: ()=>void;
  exportModifiedPred: ()=>void;
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
// 현재 표시/근접 프레임 보호용 URL 집합 (LRU 축출 제외)
const protectedURLs = new Set<string>();

// ---- Image Cache LRU (Phase 1: 새로 추가)
const MAX_DECODED_IMAGES = 200; // ~600MB 최대
const imgCacheLRU: string[] = [];
// 썸네일 LRU
const THUMB_MAX = 300;
const thumbLRU: number[] = [];

// 동시 디코드 제한 (브라우저 리소스 오류 방지)
const MAX_DECODE_CONCURRENCY = 4;
let activeDecodes = 0;
type DecodeJob = { url:string; resolve:(img:HTMLImageElement)=>void; reject:(e:any)=>void; priority:boolean };
const decodeQueue: DecodeJob[] = [];
// 디코드 중인 URL은 축출 대상에서 제외하여 ERR_FILE_NOT_FOUND 방지
const decodingURLs = new Set<string>();

function processDecodeQueue(){
  while (activeDecodes < MAX_DECODE_CONCURRENCY && decodeQueue.length){
    // 우선순위 높은 작업 먼저 선택
    let priIdx = decodeQueue.findIndex(j => j.priority);
    if (priIdx < 0) priIdx = 0;
    const job = decodeQueue.splice(priIdx,1)[0];
    activeDecodes++;
    const img = new Image();
    // @ts-ignore
    img.decoding = 'async';
    img.onload = () => {
      activeDecodes--;
      decodingURLs.delete(job.url);
      touchURL(job.url);
      const cache = useFrameStore.getState().imgCache;
      touchDecodedImage(job.url, cache);
      job.resolve(img);
      processDecodeQueue();
    };
    img.onerror = (e) => {
      activeDecodes--;
      decodingURLs.delete(job.url);
      job.reject(e);
      processDecodeQueue();
    };
    decodingURLs.add(job.url);
    img.src = job.url;
  }
}

function touchURL(url:string){
  const i = urlLRU.indexOf(url);
  if (i>=0) urlLRU.splice(i,1);
  urlLRU.push(url);
  // 초과 시 보호되지 않은 오래된 URL만 제거
  while (urlLRU.length > MAX_URLS){
    const victimIdx = urlLRU.findIndex(u => !protectedURLs.has(u) && !decodingURLs.has(u));
    if (victimIdx === -1) break; // 모두 보호 중
    const [old] = urlLRU.splice(victimIdx,1);
    // urlOwner 및 frame 객체에서 제거하여 향후 재생성 가능하게 함
    const ownerIdx = urlOwner.get(old);
    if (ownerIdx != null){
      const st = useFrameStore.getState();
      const frames = st.frames.slice();
      if (frames[ownerIdx] && frames[ownerIdx].url === old){
        frames[ownerIdx] = { ...frames[ownerIdx], url: undefined };
        useFrameStore.setState({ frames });
      }
      urlOwner.delete(old);
    }
    // 디코드 큐에 남아있는 해당 URL 작업 제거하여 ERR_FILE_NOT_FOUND 방지
    for (let q = decodeQueue.length - 1; q >= 0; q--) {
      if (decodeQueue[q].url === old) {
        const job = decodeQueue[q];
        decodeQueue.splice(q,1);
        try { job.reject(new Error('revoked')); } catch {}
      }
    }
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
  // 기존 URL이 있고 urlLRU에 없다면 이미 revoke 되었을 가능성 -> 새로 생성
  if (f.url && urlLRU.includes(f.url)) { touchURL(f.url); return; }
  if (f.url && !urlLRU.includes(f.url)) {
    try { URL.revokeObjectURL(f.url); } catch {}
  }
  if (!f.file) return; // URL 생성 불가
  const url = URL.createObjectURL(f.file);
  urlOwner.set(url, index);
  // 생성 직후 보호: 디코드 시작 전 LRU 축출 방지
  protectedURLs.add(url);
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
function schedulePrefetch(center:number, radius:number){
  if (prefetchTimer!=null) { cancelAnimationFrame(prefetchTimer); prefetchTimer = null; }
  prefetchTimer = requestAnimationFrame(()=>{
    const st = useFrameStore.getState();
    const N = st.frames.length;
    const lo = Math.max(0, center - radius);
    const hi = Math.min(N-1, center + radius);
    for (let i=lo; i<=hi; i++) ensureObjectURLFor(i);
    // 박스 프리패칭: 현재 창 범위의 프레임 index를 실제 프레임 번호(i 필드)로 매핑
    const frames = st.frames;
    if (frames.length && frames[lo] && frames[hi]) {
      const f0 = frames[lo].i;
      const f1 = frames[hi].i;
      // 전체 트랙 로드 완료 전일 때만 윈도우 박스 채우기
      if (!st.allTracksLoaded) {
        if (st.gtAnnotationId) { st.fillCacheWindow('gt', f0, f1).catch(()=>{}); }
        if (st.predAnnotationId) { st.fillCacheWindow('pred', f0, f1).catch(()=>{}); }
      }
    }
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
  idswDetails: [],

  imgCache: new Map(),
  thumbnailCache: new Map(),
  thumbnailVersion: 0,

  tracksVersion: 0,
  allTracksLoaded: false,

  setFrames: (frames)=> {
    set({ frames, cur: 0 });
    if (frames.length){
      // 첫 프레임 URL 및 박스 즉시 확보
      ensureObjectURLFor(0);
      schedulePrefetch(0, 3);
      const fr = frames[0];
      const stNow = get();
      const annPairs: [('gt'|'pred'), string|undefined][] = [['gt', stNow.gtAnnotationId], ['pred', stNow.predAnnotationId]];
      for (const [kind, annId] of annPairs){
        if (!annId) continue;
        const key = `${kind}:${annId}:${fr.i}-${fr.i}`;
        if (!inFlight.has(key)){
          const p = (async()=>{
            try {
              const data = await fetchTracksWindow(annId, fr.i, fr.i);
              let added = 0;
              const target = kind==='gt' ? gtCache : prCache;
              for (const tr of data.tracks || []){
                for (const frd of tr.frames || []){
                  const k = `${annId}:${frd.f}`;
                  const list = target.get(k) || [];
                  if (!list.find(v => String(v.id)===String(tr.id))){
                    const fb: FlatBox = { id: tr.id, bbox: frd.bbox.map(Number) as any, ...(frd.conf!=null?{conf:Number(frd.conf)}:{}) };
                    list.push(fb); target.set(k, list); added++;
                  }
                }
              }
              // tracksVersion 증가 (added==0이어도 UI 트리거)
              set({ tracksVersion: get().tracksVersion + 1 });
            } catch {}
          })().finally(()=> inFlight.delete(key));
          inFlight.set(key, p);
        }
      }
    }
  },

  setCur: (idx)=>{
    const N = get().frames.length;
    if (N===0) return;
    const clamped = Math.max(0, Math.min(N-1, idx));
    set({ cur: clamped });
    // 현재 + 주변만 URL 보장
    ensureObjectURLFor(clamped);
    // 재생 중이면 큰 반경(12), 아니면 적응형 (2~4)
    const playing = get().isPlaying;
    const baseRadius = Math.min(4, Math.max(2, getAdaptiveRadius()));
    const radius = playing ? 12 : baseRadius;
    schedulePrefetch(clamped, radius);
    // 추가로 더 먼 박스 프리패칭: 재생 중 미래 프레임 넓게 확보
    const frames = get().frames;
    const lo2 = Math.max(0, clamped - (playing ? radius : baseRadius * 2));
    const hi2 = Math.min(frames.length - 1, clamped + (playing ? radius * 2 : baseRadius * 2));
    if (frames[lo2] && frames[hi2]) {
      const f0 = frames[lo2].i;
      const f1 = frames[hi2].i;
      // 전체 로드 이전에만 박스 확장 프리패칭 수행
      if (!get().allTracksLoaded) {
        if (get().gtAnnotationId) { get().fillCacheWindow('gt', f0, f1).catch(()=>{}); }
        if (get().predAnnotationId) { get().fillCacheWindow('pred', f0, f1).catch(()=>{}); }
      }
    }
    // 보호 URL 갱신 (현재 프레임 중심 확장 구간)
    protectedURLs.clear();
    const protectLo = Math.max(0, clamped - radius*2);
    const protectHi = Math.min(N-1, clamped + radius*2);
    for (let i = protectLo; i <= protectHi; i++) {
      const u = get().frames[i]?.url; if (u) protectedURLs.add(u);
    }
    // 현재 프레임 박스가 없으면 즉시 단일 fetch (GT/PRED 각각)
    const fr = get().frames[clamped];
    if (fr) {
      const annPairs: [('gt'|'pred'), string|undefined][] = [['gt', get().gtAnnotationId], ['pred', get().predAnnotationId]];
      for (const [kind, annId] of annPairs){
        if (!annId) continue;
        const existing = get().getFrameBoxes(kind, fr.i);
        if (existing.length === 0){
          const key = `${kind}:${annId}:${fr.i}-${fr.i}`;
          if (!inFlight.has(key)){
            const p = (async()=>{
              try {
                const data = await fetchTracksWindow(annId, fr.i, fr.i);
                let added = 0;
                const target = kind==='gt' ? gtCache : prCache;
                for (const tr of data.tracks || []){
                  for (const frd of tr.frames || []){
                    const k = `${annId}:${frd.f}`;
                    const list = target.get(k) || [];
                    if (!list.find(v => String(v.id)===String(tr.id))){
                      const fb: FlatBox = { id: tr.id, bbox: frd.bbox.map(Number) as any, ...(frd.conf!=null?{conf:Number(frd.conf)}:{}) };
                      list.push(fb); target.set(k, list); added++;
                    }
                  }
                }
                set({ tracksVersion: get().tracksVersion + 1 });
              } catch {}
            })().finally(()=> inFlight.delete(key));
            inFlight.set(key, p);
          }
        }
      }
    }
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
    // 첫 프레임 즉시 단일 프레임 fetch (박스 초기 표시 보장)
    const fr = get().frames[get().cur];
    if (fr && id) {
      const ann = id;
      const key = `gt:${ann}:${fr.i}-${fr.i}`;
      if (!inFlight.has(key)) {
        const p = (async()=>{
          try {
            const data = await fetchTracksWindow(ann, fr.i, fr.i);
            let added = 0;
            for (const tr of data.tracks || []) {
              for (const frd of tr.frames || []) {
                const k = `${ann}:${frd.f}`;
                const list = gtCache.get(k) || [];
                if (!list.find(v => String(v.id)===String(tr.id))) {
                  const fb: FlatBox = { id: tr.id, bbox: frd.bbox.map(Number) as any, ...(frd.conf!=null?{conf:Number(frd.conf)}:{}) };
                  list.push(fb); gtCache.set(k, list); added++;
                }
              }
            }
            // 첫 프레임 표시 강제 트리거 (added 0이어도 업데이트)
            set({ tracksVersion: get().tracksVersion + 1 });
            // 동일 인덱스 재설정으로 prefetch & 보호셋 재평가
            useFrameStore.getState().setCur(useFrameStore.getState().cur);
          } catch {}
        })().finally(()=> inFlight.delete(key));
        inFlight.set(key, p);
      }
    }
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
    // 첫 프레임 즉시 단일 프레임 fetch (박스 초기 표시 보장)
    const fr = get().frames[get().cur];
    if (fr && id) {
      const ann = id;
      const key = `pred:${ann}:${fr.i}-${fr.i}`;
      if (!inFlight.has(key)) {
        const p = (async()=>{
          try {
            const data = await fetchTracksWindow(ann, fr.i, fr.i);
            let added = 0;
            for (const tr of data.tracks || []) {
              for (const frd of tr.frames || []) {
                const k = `${ann}:${frd.f}`;
                const list = prCache.get(k) || [];
                if (!list.find(v => String(v.id)===String(tr.id))) {
                  const fb: FlatBox = { id: tr.id, bbox: frd.bbox.map(Number) as any, ...(frd.conf!=null?{conf:Number(frd.conf)}:{}) };
                  list.push(fb); prCache.set(k, list); added++;
                }
              }
            }
            set({ tracksVersion: get().tracksVersion + 1 });
            useFrameStore.getState().setCur(useFrameStore.getState().cur);
          } catch {}
        })().finally(()=> inFlight.delete(key));
        inFlight.set(key, p);
      }
    }
  },

  setIou: (v)=> set({ iou: Math.max(0, Math.min(1, v)) }),
  setConf: (v)=> set({ conf: Math.max(0, Math.min(1, v)) }),

  getImage: async(url:string, priority=false)=>{
    const cache = get().imgCache;
    const hit = cache.get(url);
    if (hit) {
      // Phase 1: 캐시 히트 시 LRU 업데이트
      touchDecodedImage(url, cache);
      return hit;
    }
    // 동시 디코드 제한 큐 적용
    const p = new Promise<HTMLImageElement>((resolve,reject)=>{
      // priority true면 앞쪽 삽입
      if (priority) decodeQueue.unshift({ url, resolve, reject, priority });
      else decodeQueue.push({ url, resolve, reject, priority });
      decodingURLs.add(url);
      processDecodeQueue();
    });
    cache.set(url, p);
    return p;
  },

  prefetchAround: (center, radius?)=>{
    // Phase 2: radius가 지정되지 않으면 적응형 사용
    const adaptiveRadius = radius ?? getAdaptiveRadius();
    schedulePrefetch(center, adaptiveRadius);
  },

  fillCacheWindow: async(kind, f0, f1)=>{
    const ann = kind==='gt' ? get().gtAnnotationId : get().predAnnotationId;
    if(!ann) return;
    const key = `${kind}:${ann}:${f0}-${f1}`;
    if (inFlight.has(key)) return inFlight.get(key)!;
    const p = (async()=>{
      const data = await fetchTracksWindow(ann, f0, f1);
      const target = (kind==='gt'? gtCache : prCache);
      let added = 0;
      for (const tr of data.tracks || []) {
        for (const fr of tr.frames || []) {
          const k = `${ann}:${fr.f}`;
          const list = target.get(k) || [];
          if (!list.find(v => String(v.id)===String(tr.id))) {
            const fb: FlatBox = { id: tr.id, bbox: fr.bbox.map(Number) as any, ...(fr.conf!=null?{conf:Number(fr.conf)}:{}) };
            list.push(fb);
            target.set(k, list);
            added++;
          }
        }
      }
      if (added>0) set({ tracksVersion: get().tracksVersion + 1 });
    })().finally(()=> inFlight.delete(key));
    inFlight.set(key, p);
    return p;
  },

  getPredBox: (frame, id, base)=>{
    const ov = get().overrides.get(frame)?.get(id);
    return ov ? ov : base;
  },

  getFrameBoxes: (kind, frame)=>{
    const ann = kind==='gt' ? get().gtAnnotationId : get().predAnnotationId;
    if(!ann) return [];
    const k = `${ann}:${frame}`;
    const cache = kind==='gt' ? gtCache : prCache;
    const hit = cache.get(k);
    return hit ? hit.slice() : [];
  },

  // 전체 트랙 선로딩: /tracks/full 사용 (대용량일 경우 초기 지연 발생 가능)
  preloadAllBoxes: async ()=>{
    const gtId = get().gtAnnotationId;
    const predId = get().predAnnotationId;
    const frames = get().frames;
    if (!frames.length) return;
    let changed = 0;
    // Helper to ingest full tracks
    const ingest = (annId: string, kind: 'gt'|'pred', data: {tracks: {id:any, frames:{f:number, bbox:number[], conf?:number}[]}[]} ) => {
      const target = kind==='gt' ? gtCache : prCache;
      for (const tr of data.tracks || []) {
        for (const fr of tr.frames || []) {
          const k = `${annId}:${fr.f}`;
          const list = target.get(k) || [];
          if (!list.find(v => String(v.id)===String(tr.id))) {
            const fb: FlatBox = { id: tr.id, bbox: fr.bbox.map(Number) as any, ...(fr.conf!=null?{conf:Number(fr.conf)}:{}) };
            list.push(fb);
            target.set(k, list);
            changed++;
          }
        }
      }
    };
    try {
      if (gtId) {
        const full = await fetchAllTracks(gtId);
        ingest(gtId, 'gt', full);
      }
      if (predId) {
        const full = await fetchAllTracks(predId);
        ingest(predId, 'pred', full);
      }
      if (changed>0) set({ tracksVersion: get().tracksVersion + 1, allTracksLoaded: true });
      else set({ allTracksLoaded: true });
    } catch (e) {
      console.warn('preloadAllBoxes 실패', e);
    }
  },

  // 재생 전 사용자가 전략 바꾸면 이후 prefetch 로직 분기

  startTrackStream: (range)=>{
    const gtId = get().gtAnnotationId;
    const predId = get().predAnnotationId;
    if (!gtId && !predId) return;
    // 기존 스트림 종료
    get().stopTrackStream();
    const handle = openTrackStream({
      gtId, predId,
      f0: range.f0,
      f1: range.f1,
      chunk: 60, // 약 2초 분량 (60fps 고려) 청크
      onChunk: (chunk)=>{
        let changed = 0;
        for (const annChunk of chunk.tracks) {
          const kind = annChunk.kind as 'gt'|'pred';
          const annId = annChunk.id;
          const target = kind==='gt' ? gtCache : prCache;
          for (const tr of annChunk.tracks || []) {
            for (const fr of tr.frames || []) {
              const k = `${annId}:${fr.f}`;
              const list = target.get(k) || [];
              if (!list.find(v => String(v.id)===String(tr.id))) {
                const fb: FlatBox = { id: tr.id, bbox: fr.bbox.map(Number) as any, ...(fr.conf!=null?{conf:Number(fr.conf)}:{}) };
                list.push(fb);
                target.set(k, list);
                changed++;
              }
            }
          }
        }
        if (changed>0) set({ tracksVersion: get().tracksVersion + 1 });
      },
      onDone: () => {
        // 스트림 종료 후 핸들 제거
        set({ _streamHandle: undefined });
      },
      onError: (e) => {
        console.warn('Track stream error', e);
      }
    });
    // 비공개 핸들 저장
    set({ _streamHandle: handle });
  },

  stopTrackStream: ()=>{
    const h = (get() as any)._streamHandle as TrackStreamHandle | undefined;
    if (h) { try { h.close(); } catch {} }
    set({ _streamHandle: undefined });
  },

  ensureFrameURL: (index:number)=>{
    ensureObjectURLFor(index);
  },
  getThumbnail: (frame:number) => {
    return get().thumbnailCache.get(frame);
  },
  requestThumbnail: (frame:number) => {
    const st = get();
    if (st.thumbnailCache.has(frame)) return; // 이미 생성됨
    const idx = st.frames.findIndex(f=>f.i===frame);
    if (idx < 0) return;
    ensureObjectURLFor(idx);
    const url = st.frames[idx].url;
    if (!url) return;
    // 이미지 로딩 후 저해상도 렌더링
    st.getImage(url).then(img => {
      try {
        const TW = 96, TH = 60; // 목표 썸네일 크기
        let canvas: HTMLCanvasElement | OffscreenCanvas;
        let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
        if (typeof OffscreenCanvas !== 'undefined') {
          canvas = new OffscreenCanvas(TW, TH);
          ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
        } else {
          canvas = document.createElement('canvas');
          canvas.width = TW; canvas.height = TH;
          ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        }
        // 배경 채우기 (흰색 혹은 검정 선택 가능, 여기서는 흰색)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0,0,TW,TH);
        // 원본 비율 유지하여 중앙 정렬
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        const scale = Math.min(TW/iw, TH/ih);
        const dw = iw*scale; const dh = ih*scale;
        const ox = (TW - dw)/2; const oy = (TH - dh)/2;
        ctx.drawImage(img, ox, oy, dw, dh);
        let dataURL: string;
        if (canvas instanceof OffscreenCanvas) {
          dataURL = (canvas as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality: 0.8 })
            .then(blob => new Promise<string>(res => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsDataURL(blob); }))
            .catch(()=> '') as any; // handled below async
          if (typeof dataURL === 'string') {
            // unlikely path
            st.thumbnailCache.set(frame, dataURL);
            thumbLRU.push(frame);
            while (thumbLRU.length > THUMB_MAX) {
              const victim = thumbLRU.shift()!;
              if (victim !== frame) st.thumbnailCache.delete(victim);
            }
            set({ thumbnailVersion: st.thumbnailVersion + 1 });
          } else {
            (dataURL as Promise<string>).then(urlStr => {
              if (!urlStr) return;
              const st2 = get();
              st2.thumbnailCache.set(frame, urlStr);
              thumbLRU.push(frame);
              while (thumbLRU.length > THUMB_MAX) {
                const victim = thumbLRU.shift()!;
                if (victim !== frame) st2.thumbnailCache.delete(victim);
              }
              set({ thumbnailVersion: st2.thumbnailVersion + 1 });
            });
          }
        } else {
          dataURL = (canvas as HTMLCanvasElement).toDataURL('image/jpeg', 0.8);
          st.thumbnailCache.set(frame, dataURL);
          thumbLRU.push(frame);
          while (thumbLRU.length > THUMB_MAX) {
            const victim = thumbLRU.shift()!;
            if (victim !== frame) st.thumbnailCache.delete(victim);
          }
          set({ thumbnailVersion: st.thumbnailVersion + 1 });
        }
      } catch {}
    }).catch(()=>{});
  },

  fetchSingleFrameBoxes: async(kind, frameNum) => {
    const ann = kind==='gt' ? get().gtAnnotationId : get().predAnnotationId;
    if (!ann) return;
    const key = `${kind}:${ann}:${frameNum}-${frameNum}`;
    if (inFlight.has(key)) return inFlight.get(key)!;
    const p = (async()=>{
      try {
        const data = await fetchTracksWindow(ann, frameNum, frameNum);
        const target = kind==='gt' ? gtCache : prCache;
        let added = 0;
        for (const tr of data.tracks || []){
          for (const frd of tr.frames || []){
            const k = `${ann}:${frd.f}`;
            const list = target.get(k) || [];
            if (!list.find(v => String(v.id)===String(tr.id))){
              const fb: FlatBox = { id: tr.id, bbox: frd.bbox.map(Number) as any, ...(frd.conf!=null?{conf:Number(frd.conf)}:{}) };
              list.push(fb); target.set(k, list); added++;
            }
          }
        }
        set({ tracksVersion: get().tracksVersion + 1 });
      } catch {}
    })().finally(()=> inFlight.delete(key));
    inFlight.set(key, p);
    return p;
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
    // 키(oldId)는 유지하고 Box 내부 id 필드만 변경하여
    // base pred 리스트와 매핑 일관성 유지 (display 용 id 변경)
    const overridesOrig = get().overrides;
    const curMap = new Map(overridesOrig.get(frame) || []);
    const baseBefore = curMap.get(oldId);
    // 이전 상태 저장 (deep clone)
    const before: Box | undefined = baseBefore ? { ...baseBefore } : undefined;
    const nextBox: Box = { id: newId, ...geom };
    curMap.set(oldId, nextBox);
    const overrides = new Map(overridesOrig);
    overrides.set(frame, curMap);
    const MAX_UNDO_STACK = 100;
    let undoStack = [...get().undoStack, { frame, id: oldId, before, after: nextBox }];
    if (undoStack.length > MAX_UNDO_STACK) undoStack = undoStack.slice(-MAX_UNDO_STACK);
    set({ overrides, overrideVersion: get().overrideVersion + 1, undoStack, redoStack: [] });
  },

  exportModifiedPred: async ()=>{
    const predAnnId = get().predAnnotationId;
    if (!predAnnId) { alert('Pred 파일을 먼저 불러오세요'); return; }
    // 전체 트랙 미선로딩 상태면 먼저 로드 시도
    if (!get().allTracksLoaded) {
      await get().preloadAllBoxes().catch(()=>{});
    }
    // prCache에서 해당 predAnnId 모든 프레임 수집
    const overrides = get().overrides;
    const allKeys = Array.from(prCache.keys()).filter(k => k.startsWith(predAnnId + ':'));
    if (allKeys.length === 0) { alert('예측 박스가 아직 로드되지 않았습니다. 조금 기다린 후 다시 시도하세요.'); return; }
    const lines: string[] = [];
    for (const key of allKeys) {
      // key 형식: annId:frame
      const parts = key.split(':');
      const frameNum = Number(parts[1]);
      const baseBoxes = prCache.get(key) || [];
      const ovMap = overrides.get(frameNum);
      for (const fb of baseBoxes) {
        const origId = Number(fb.id);
        const base: Box = { id: origId, x: fb.bbox[0], y: fb.bbox[1], w: fb.bbox[2], h: fb.bbox[3], conf: (fb as any).conf ?? 1.0 };
        const applied = ovMap?.get(origId) ? { ...ovMap.get(origId)! } : base;
        const conf = applied.conf ?? base.conf ?? 1.0;
        lines.push(`${frameNum},${applied.id},${applied.x.toFixed(2)},${applied.y.toFixed(2)},${applied.w.toFixed(2)},${applied.h.toFixed(2)},${conf.toFixed(4)},-1,-1,-1`);
      }
      // override에만 존재하는 (새로운) 박스가 있다면 추가 (기존 origId와 매칭되지 않은 키)
      if (ovMap) {
        for (const [origId, box] of ovMap.entries()) {
          const exists = baseBoxes.find(b => Number(b.id) === origId);
          if (!exists) {
            const conf = box.conf ?? 1.0;
            lines.push(`${frameNum},${box.id},${box.x.toFixed(2)},${box.y.toFixed(2)},${box.w.toFixed(2)},${box.h.toFixed(2)},${conf.toFixed(4)},-1,-1,-1`);
          }
        }
      }
    }
    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pred_overrides_applied_${new Date().getTime()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  // (로컬 스캔 제거됨) - 서버 override 평가로 대체
}));

export default useFrameStore;
export { gtCache, prCache };
