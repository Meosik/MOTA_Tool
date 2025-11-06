import { create } from 'zustand'
import type { MotRecord } from '../utils/parseMot'
import { parseMot } from '../utils/parseMot'

export type FrameMeta = { i:number, url:string, w:number, h:number }
type ImgCache = Map<number, HTMLImageElement>;

type OverrideBox = { x:number; y:number; w:number; h:number; id:number };
type OverrideKey = string;

type St = {
  frames: FrameMeta[]
  cur: number
  fps: number
  gt: MotRecord[]
  pred: MotRecord[]
  showGT: boolean
  showPred: boolean
  setCur: (i:number)=>void
  openFrameDir: () => Promise<void>
  openGT: () => Promise<void>
  openPred: () => Promise<void>
  toggleGT: ()=>void
  togglePred: ()=>void
  prefetchRadius: number;
  imgCache: ImgCache;
  setPrefetchRadius: (k: number) => void;
  prefetchAround: (center: number) => void;
  overrides: Map<OverrideKey, OverrideBox>;
  applyOverride: (frame:number, origId:number, box:OverrideBox)=>void;
  removeOverride: (frame:number, origId:number)=>void;
  getPredBox: (frame:number, origId:number, base:OverrideBox)=>OverrideBox; // 합성용
  exportEditedPred: () => string;  // MOT 텍스트로 내보내기
}

export const useFrameStore = create<St>((set,get)=>({
  frames: [],
  cur: 0,
  fps: 30,
  gt: [],
  pred: [],
  showGT: true,
  showPred: true,
  iou: 0.5,
  mode: 'local',

  setCur(i){
    const max = Math.max(0, get().frames.length - 1)
    set({ cur: Math.max(0, Math.min(i, max)) })
  },

  async openFrameDir(){
    const picker: any = (window as any).showDirectoryPicker
    if(!picker){
      alert('폴더 선택 API가 지원되지 않습니다. Chromium/Edge를 사용하세요.')
      return
    }
    const dir: any = await picker()
    const arr: FrameMeta[] = []
    for await (const [name, handle] of dir.entries()){
      if (handle.kind==='file' && /\.(png|jpe?g)$/i.test(name)) {
        const digits = name.match(/\d+/g)
        const i = digits ? parseInt(digits[digits.length-1],10) : 0
        const file: File = await handle.getFile()
        const url = URL.createObjectURL(file)
        arr.push({ i, url, w: 0, h: 0 })
      }
    }
    arr.sort((a,b)=>a.i-b.i)
    set({ frames: arr, cur: 0 })
  },

  async openGT(){
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = '.txt,.csv'
    inp.onchange = async () => {
      const f = inp.files?.[0]
      if(!f) return
      const text = await f.text()
      const recs = parseMot(text)
      set({ gt: recs })
      alert(`GT 로드: ${recs.length} records`)
    }
    inp.click()
  },

  async openPred(){
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = '.txt,.csv'
    inp.onchange = async () => {
      const f = inp.files?.[0]
      if(!f) return
      const text = await f.text()
      const recs = parseMot(text)
      set({ pred: recs })
      alert(`Pred 로드: ${recs.length} records`)
    }
    inp.click()
  },

  toggleGT(){ set({ showGT: !get().showGT }) },
  togglePred(){ set({ showPred: !get().showPred }) },
  prefetchRadius: 3,
  imgCache: new Map(),

  setPrefetchRadius(k){ set({ prefetchRadius: Math.max(0, Math.floor(k)) }); },

  prefetchAround(center){
    const { frames, prefetchRadius, imgCache } = get();
    if (!frames.length) return;
    const lo = Math.max(0, center - prefetchRadius);
    const hi = Math.min(frames.length - 1, center + prefetchRadius);

    for (let i = lo; i <= hi; i++){
      const meta = frames[i];
      if (!meta) continue;
      if (imgCache.has(i)) continue;
      const im = new Image();
      im.src = meta.url;
      // 로드 완료되면 cache 에 저장
      im.onload = () => {
        // 이미 누군가 넣었으면 무시
        if (!get().imgCache.has(i)) {
          const newMap = new Map(get().imgCache);
          newMap.set(i, im);
          set({ imgCache: newMap });
        }
      };
      // 바로 넣어도 됨(지연 로드)
      const newMap = new Map(imgCache);
      newMap.set(i, im);
      set({ imgCache: newMap });
    }
  },

  overrides: new Map(),

  applyOverride(frame, origId, box){
    const key = `${frame}:${origId}`;
    const next = new Map(get().overrides);
    next.set(key, { ...box });
    set({ overrides: next });
  },

  removeOverride(frame, origId){
    const key = `${frame}:${origId}`;
    if (!get().overrides.has(key)) return;
    const next = new Map(get().overrides);
    next.delete(key);
    set({ overrides: next });
  },

  getPredBox(frame, origId, base){
    const key = `${frame}:${origId}`;
    return get().overrides.get(key) || base;
  },

  exportEditedPred(){
    // 1) 원본 pred 레코드를 frame,id로 그룹핑
    const { pred, overrides } = get();
    // pred를 순회하며 override 있으면 치환/ID 변경 반영
    const lines: string[] = [];
    for (const r of pred){
      const key = `${r.frame}:${r.id}`;
      const ov = overrides.get(key);
      const id = ov?.id ?? r.id;
      const x  = ov?.x  ?? r.x;
      const y  = ov?.y  ?? r.y;
      const w  = ov?.w  ?? r.w;
      const h  = ov?.h  ?? r.h;
      const conf = r.conf ?? 1;
      // MOT 10필드로 직렬화
      lines.push([r.frame, id, x, y, w, h, conf, -1, -1, -1].join(','));
    }
    // 2) 필요하다면 "새로 추가한 박스"도 lines에 넣을 수 있음 (UI에서 추가 기능을 만들었을 때)
    return lines.join('\n');
  },
}));

