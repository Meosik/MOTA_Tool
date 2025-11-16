// frontend/src/store/frameStore.ts
import { create } from 'zustand';
import { fetchFrameBoxes, fetchTracksWindow, type FlatBox } from '../lib/api';

export type Frame = { i:number; url?:string; file?:File };
export type Box = { id:number; x:number; y:number; w:number; h:number; conf?:number };

type EditEntry = { frame:number; id:number; before?:Box; after?:Box };

// ---- Worker 풀 관리
let decoderWorkers: Worker[] = [];
let decoderWorkerIdx = 0;
const DECODER_WORKER_COUNT = 2; // 이미지 디코더 워커 개수
let tracksCacheWorker: Worker | null = null;

// 워커 메시지 처리를 위한 펜딩 요청 맵
const decoderPending = new Map<string, {resolve:(v:any)=>void; reject:(e:any)=>void}>();
const tracksPending = new Map<string, {resolve:(v:any)=>void; reject:(e:any)=>void}>();

// 워커 메시지 핸들러 (한 번만 생성)
function setupDecoderHandler(worker: Worker) {
  if ((worker as any)._hasHandler) return; // 이미 설정됨
  (worker as any)._hasHandler = true;
  
  worker.addEventListener('message', (event: MessageEvent) => {
    const { id, type, bitmap, error } = event.data;
    const pending = decoderPending.get(id);
    if (!pending) return;
    decoderPending.delete(id);
    
    if (type === 'decoded' && bitmap) {
      pending.resolve(bitmap);
    } else {
      pending.reject(new Error(error || 'Decode failed'));
    }
  });
  
  worker.addEventListener('error', () => {
    // 모든 펜딩 요청 실패 처리
    decoderPending.forEach((p, id) => {
      p.reject(new Error('Worker error'));
      decoderPending.delete(id);
    });
  });
}

function setupTracksHandler() {
  if (!tracksCacheWorker || (tracksCacheWorker as any)._hasHandler) return;
  (tracksCacheWorker as any)._hasHandler = true;
  
  tracksCacheWorker.addEventListener('message', (event: MessageEvent) => {
    const { id, type, data, error } = event.data;
    const pending = tracksPending.get(id);
    if (!pending) return;
    tracksPending.delete(id);
    
    if (type === 'tracksCached') {
      pending.resolve(data);
    } else {
      pending.reject(new Error(error || 'Fetch failed'));
    }
  });
}

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
  imgCache: Map<string, Promise<any>>; // Promise<HTMLImageElement|ImageBitmap>

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
  // cache tuning
  setMaxUrls: (n:number)=>void;
  resetMaxUrls: ()=>void;
  startAdaptiveCache: (fps:number)=>void;
  stopAdaptiveCache: ()=>void;
  // 재생 중 향후 이미지 미리 디코드
  preloadImageRange: (startIdx:number, endIdx:number)=>Promise<void>;
};

// ---- Worker 초기화
function initWorkers() {
  try {
    // 이미지 디코더 워커 풀 생성
    decoderWorkers = [];
    for (let i = 0; i < DECODER_WORKER_COUNT; i++) {
      try {
        // @ts-ignore
        const w = new Worker(
          new URL('../workers/imageDecoder.worker.ts', import.meta.url),
          { type: 'module' }
        );
        decoderWorkers.push(w);
        setupDecoderHandler(w); // 핸들러 한 번만 설정
      } catch (e) {
        console.warn(`Failed to create decoder worker ${i}:`, e);
      }
    }
    
    // 박스 데이터 캐시 워커 생성
    try {
      // @ts-ignore
      tracksCacheWorker = new Worker(
        new URL('../workers/trackCache.worker.ts', import.meta.url),
        { type: 'module' }
      );
      setupTracksHandler(); // 핸들러 한 번만 설정
    } catch (e) {
      console.warn('Failed to create trackCache worker:', e);
    }
  } catch (e) {
    console.warn('Worker initialization failed:', e);
  }
}

// Worker가 없을 경우 메인 스레드 폴백 함수
async function decodeImageFallback(url: string, blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    const bitmap = await createImageBitmap(blob);
    return bitmap;
  } catch {
    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
    return img;
  }
}

// ---- Tracks 캐시 (변경 없음)
const gtCache = new Map<string, FlatBox[]>();
const prCache = new Map<string, FlatBox[]>();
const inFlight = new Map<string, Promise<void>>();
function toBox(fb:FlatBox): Box {
  const [x,y,w,h] = fb.bbox.map(Number) as [number,number,number,number];
  return { id: Number(fb.id), x,y,w,h, ...(fb.conf!=null?{conf:Number(fb.conf)}:{}) };
}

// ---- ObjectURL LRU (핵심 개선)
const DEFAULT_MAX_URLS = 80; // 기본값: 일반 브라우징용 (메모리/디코드 부하 제한)
let maxUrls = DEFAULT_MAX_URLS;
const urlLRU: string[] = [];             // 최근 사용 순
const urlOwner = new Map<string, number>(); // url -> frameIndex

// ImageBitmap 캐시 크기 제한 (메모리 누수 방지)
const MAX_IMG_CACHE_SIZE = 200; // 메인 메모리 캐시
const imgBitmapCache = new Map<string, ImageBitmap | HTMLImageElement>(); // 디코드 이미지 저장소

function evictImgCache(){
  // FIFO 방식으로 오래된 이미지부터 제거
  // ImageBitmap은 close() 호출 금지 (transferable 후 detached 상태 가능)
  while (imgBitmapCache.size > MAX_IMG_CACHE_SIZE){
    const first = imgBitmapCache.entries().next();
    if (!first.done) {
      const [url, img] = first.value;
      imgBitmapCache.delete(url);
      // ImageBitmap은 close() 하지 않음 (GC가 처리)
      // HTMLImageElement도 그냥 삭제
    }
  }
}

function touchURL(url:string){
  const i = urlLRU.indexOf(url);
  if (i>=0) urlLRU.splice(i,1);
  urlLRU.push(url);
  while (urlLRU.length > maxUrls){
    const old = urlLRU.shift()!;
    try { URL.revokeObjectURL(old); } catch {}
    urlOwner.delete(old);
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

function evictToLimit(){
  while (urlLRU.length > maxUrls){
    const old = urlLRU.shift()!;
    try { URL.revokeObjectURL(old); } catch {}
    urlOwner.delete(old);
  }
}

// ---- Prefetch 스케줄링 (배치 처리)
let prefetchTimer: number | null = null;
let pendingPrefetchRanges: {center:number, radius:number}[] = [];

function schedulePrefetch(center:number, radius:number){
  // 중복된 요청 병합
  const idx = pendingPrefetchRanges.findIndex(p => p.center === center && p.radius === radius);
  if (idx >= 0) return; // 이미 스케줄됨
  
  pendingPrefetchRanges.push({center, radius});
  
  if (prefetchTimer!=null) return; // 이미 스케줄됨
  
  prefetchTimer = requestAnimationFrame(()=>{
    const st = useFrameStore.getState();
    const N = st.frames.length;
    
    // 모든 pending prefetch를 병합하여 한 번에 처리
    const allIndices = new Set<number>();
    for (const {center, radius} of pendingPrefetchRanges) {
      const lo = Math.max(0, center - radius);
      const hi = Math.min(N-1, center + radius);
      for (let i=lo; i<=hi; i++) allIndices.add(i);
    }
    
    // 배치로 URL 생성 (마이크로태스크 분산)
    const indices = Array.from(allIndices).sort((a,b)=>a-b);
    let batchIdx = 0;
    const processBatch = () => {
      const batchSize = 4; // 한 번에 4개 프레임 처리
      const end = Math.min(batchIdx + batchSize, indices.length);
      for (let i=batchIdx; i<end; i++) {
        ensureObjectURLFor(indices[i]);
      }
      batchIdx = end;
      if (batchIdx < indices.length) {
        requestAnimationFrame(processBatch);
      } else {
        prefetchTimer = null;
        pendingPrefetchRanges = [];
      }
    };
    processBatch();
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

  setFrames: (frames)=> {
    // Worker 초기화 (첫 프레임 로드 시 한 번)
    if (decoderWorkers.length === 0 && tracksCacheWorker === null) {
      initWorkers();
    }
    set({ frames, cur: 0 });
  },

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

  setGT: (id)=> set({ gtAnnotationId: id }),
  setPred: (id)=> set({ predAnnotationId: id }),

  setIou: (v)=> set({ iou: Math.max(0, Math.min(1, v)) }),
  setConf: (v)=> set({ conf: Math.max(0, Math.min(1, v)) }),

  getImage: async(url:string)=>{
    const imgHit = imgBitmapCache.get(url);
    if (imgHit) return imgHit;

    const cache = get().imgCache;
    const hit = cache.get(url);
    if (hit) return hit;

    const p = new Promise<ImageBitmap | HTMLImageElement>(async (resolve, reject) => {
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Fetch failed');
        const blob = await resp.blob();
        
        // Worker 사용: 선택적 (실패시 메인 스레드 폴백)
        let decoded: ImageBitmap | HTMLImageElement | null = null;
        
        if (decoderWorkers.length > 0) {
          const worker = decoderWorkers[decoderWorkerIdx % decoderWorkers.length];
          decoderWorkerIdx++;
          const msgId = `dec-${url}-${Math.random()}`;
          
          // 펜딩 요청 추가
          const deferred = new Promise<ImageBitmap>((res, rej) => {
            decoderPending.set(msgId, { resolve: res, reject: rej });
            setTimeout(() => {
              if (decoderPending.has(msgId)) {
                decoderPending.delete(msgId);
                rej(new Error('Decode timeout'));
              }
            }, 2000);
          });
          
          worker.postMessage({ type: 'decode', id: msgId, url, blob });
          
          try {
            decoded = await deferred;
          } catch (err) {
            // Worker 실패: 메인 스레드 폴백
            console.warn('Worker decode failed, using main thread:', err);
            decoded = null;
          }
        }
        
        // 메인 스레드 폴백 또는 직접 decode
        if (!decoded) {
          decoded = await decodeImageFallback(url, blob);
        }
        
        touchURL(url);
        imgBitmapCache.set(url, decoded);
        evictImgCache();
        resolve(decoded);
      } catch (err) {
        cache.delete(url);
        reject(err);
      }
    });
    cache.set(url, p);
    return p;
  },

  prefetchAround: (center, radius=2)=>{
    schedulePrefetch(center, radius);
  },

  fillCacheWindow: async(kind, f0, f1)=>{
    const ann = kind==='gt' ? get().gtAnnotationId : get().predAnnotationId;
    if(!ann) return;
    
    // 범위를 정규화하여 중복 요청 방지
    const start = Math.max(1, f0);
    const end = Math.max(start, f1);
    const key = `${kind}:${ann}:${start}-${end}`;
    
    // 이미 진행 중이거나 완료된 요청이 있으면 재사용
    if (inFlight.has(key)) return inFlight.get(key)!;
    
    const p = (async()=>{
      try {
        let data;
        
        if (tracksCacheWorker) {
          const msgId = `trk-${key}-${Math.random()}`;
          const deferred = new Promise<any>((resolve, reject) => {
            tracksPending.set(msgId, { resolve, reject });
            setTimeout(() => {
              if (tracksPending.has(msgId)) {
                tracksPending.delete(msgId);
                reject(new Error('Tracks timeout'));
              }
            }, 5000); // 5초 타임아웃 (API 요청)
          });
          
          const apiBase = (import.meta as any).env?.VITE_API_BASE || 'http://127.0.0.1:8000';
          tracksCacheWorker.postMessage({
            type: 'fetchTracks',
            id: msgId,
            annId: ann,
            f0: start,
            f1: end,
            apiBase,
          });
          
          try {
            data = await deferred;
          } catch (err) {
            data = await fetchTracksWindow(ann, start, end);
          }
        } else {
          data = await fetchTracksWindow(ann, start, end);
        }
        
        const target = (kind==='gt'? gtCache : prCache);
        for (const tr of (data as any).tracks || []) {
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
      } catch (err) {
        console.warn(`fillCacheWindow failed for ${key}:`, err);
      }
    })().finally(()=> inFlight.delete(key));
    inFlight.set(key, p);
    return p;
  },

  setMaxUrls: (n:number)=>{
    // adjust module-level maxUrls
    try {
      const val = Math.max(16, Math.floor(n));
      maxUrls = val;
      evictToLimit();
    } catch {}
  },

  resetMaxUrls: ()=>{
    maxUrls = DEFAULT_MAX_URLS;
    evictToLimit();
  },
  // adaptive cache tuner
  startAdaptiveCache: (fps:number)=>{
    // 고속 재생 시 캐시 크기를 FPS에 맞춰 자동 조정
    // store an interval id on the module so multiple calls don't stack
    try {
      const st = get();
      // avoid multiple timers
      if ((window as any).__adaptiveCacheTimerId) return;
      let lastDesired = maxUrls;
      const tick = () => {
        try {
          // FPS에 따라 필요한 미리 디코드된 이미지 수 계산
          // 60FPS: 약 1800~2400개, 30FPS: 약 900~1200개
          const base = 300;
          const dynamic = Math.min(5000, Math.max(600, Math.floor(fps * 30)));
          const desired = Math.max(base, dynamic);
          // move towards desired smoothly
          if (Math.abs(desired - lastDesired) > 50) {
            lastDesired = desired;
            maxUrls = desired;
            evictToLimit();
          }
        } catch {}
      };
      (window as any).__adaptiveCacheTimerId = window.setInterval(tick, 1500);
    } catch {}
  },
  stopAdaptiveCache: ()=>{
    try {
      const id = (window as any).__adaptiveCacheTimerId;
      if (id) { clearInterval(id); (window as any).__adaptiveCacheTimerId = null; }
      // restore default and cleanup excessive img cache
      maxUrls = DEFAULT_MAX_URLS;
      evictToLimit();
      // ImageBitmap 캐시를 절반 크기로 정리 (메모리 누수 방지)
      while (imgBitmapCache.size > MAX_IMG_CACHE_SIZE / 2) {
        const first = imgBitmapCache.entries().next();
        if (!first.done) {
          const [url, img] = first.value;
          imgBitmapCache.delete(url);
          if (img instanceof ImageBitmap) {
            try { img.close(); } catch {}
          }
        }
      }
    } catch {}
  },

  preloadImageRange: async(startIdx:number, endIdx:number)=>{
    // 재생 중 향후 이미지들을 배경에서 미리 디코드 (병렬 처리)
    const st = get();
    const frames = st.frames;
    if (startIdx >= frames.length) return;
    
    const end = Math.min(endIdx, frames.length - 1);
    const tasks: Promise<any>[] = [];
    
    // 모든 이미지를 병렬로 로드 시작 (동시성 제한: 8개)
    const concurrency = 8;
    for (let i = startIdx; i <= end; i++) {
      const f = frames[i];
      if (!f.url) continue;
      
      // 이미 캐시에 있으면 스킵
      if (imgBitmapCache.has(f.url)) continue;
      
      // 동시 실행 개수 제한
      if (tasks.length >= concurrency) {
        await Promise.race(tasks);
        tasks.splice(tasks.findIndex(p => p === Promise.resolve()), 1);
      }
      
      // 병렬 로드 시작 (비동기, await하지 않음)
      const task = st.getImage(f.url)
        .catch(()=>{}) // 에러 무시
        .then(()=>{
          // 완료된 작업 제거
          const idx = tasks.indexOf(task);
          if (idx >= 0) tasks.splice(idx, 1);
        });
      tasks.push(task);
    }
    
    // 모든 작업 완료 대기
    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
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
    set({
      overrides,
      overrideVersion: get().overrideVersion + 1,
      undoStack: [...get().undoStack, { frame, id, before, after: next }],
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
    const undoStack = [
      ...get().undoStack,
      { frame, id: oldId, before, after: undefined },
      { frame, id: newId, before: undefined, after: newBox }
    ];
    
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
