import { create } from 'zustand'
import { uploadAnnotation, fetchFrameBoxes } from '../lib/api'

export type Box = {
  id: number
  x: number
  y: number
  w: number
  h: number
  conf?: number
}

type Frame = { i: number; url: string }

type EditEntry =
  | { type: 'edit'; frame: number; id: number; prev: Box | null; next: Box | null }
  | { type: 'frame-reset'; frame: number; snapshot: Map<number, Box> }
  | { type: 'id-change'; frame: number; oldId: number; newId: number; box: Box }

type State = {
  // timeline / images
  frames: Frame[]
  cur: number
  imgCache: Map<string, HTMLImageElement>

  // annotations
  gtAnnotationId: string | null
  predAnnotationId: string | null

  // overlay options
  iou: number
  conf: number
  showGT: boolean
  showPred: boolean
  setIou: (v:number)=>void
  setConf: (v:number)=>void

  // overrides & history
  overrides: Map<number, Map<number, Box>>
  overrideVersion: number
  undoStack: EditEntry[]
  redoStack: EditEntry[]

  // IDSW 인덱스
  idswFrames: number[]
  setIdswFrames: (list:number[]) => void
  scanIdSwitches: () => Promise<void>

  // actions
  setCur: (i: number) => void
  prefetchAround: (i: number, k: number) => void
  getImage: (url: string) => Promise<HTMLImageElement>

  openFrameDir: () => void
  openGT: () => void
  openPred: () => void

  getPredBox: (frame: number, id: number, base: Box) => Box
  applyOverrideWithHistory: (frame: number, id: number, box: Box | null) => void
  changeOverrideIdWithHistory: (frame: number, oldId: number, newId: number, geom: Omit<Box,'id'>) => void
  resetCurrentFrame: () => void
  undo: () => void
  redo: () => void

  exportModifiedPred: () => Promise<void>
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = reject
    im.src = url
  })
}

function getCurrentFrameKey(state: State) {
  const f = state.frames[state.cur]
  return f ? f.i : state.cur
}

const useFrameStore = create<State>((set, get) => ({
  // ---- initial ----
  frames: [],
  cur: 0,
  imgCache: new Map(),

  gtAnnotationId: null,
  predAnnotationId: null,

  iou: 0.5,
  conf: 0.0,
  showGT: true,
  showPred: true,
  setIou: (v)=> set({ iou: v }),
  setConf: (v)=> set({ conf: v }),

  overrides: new Map(),
  overrideVersion: 0,
  undoStack: [],
  redoStack: [],

  idswFrames: [],
  setIdswFrames: (list) => set({ idswFrames: list }),

  // 빠른 스캔(청크 처리 + 휴식)
  scanIdSwitches: async () => {
    const s = get()
    const { frames, gtAnnotationId, predAnnotationId, iou, conf } = s
    if (!gtAnnotationId || !predAnnotationId || frames.length === 0) { set({ idswFrames: [] }); return }

    const chunk = 50
    const idsw: number[] = []
    let prevMap = new Map<number, number>()

    function toBox(fb:{id:any,bbox:number[],conf?:number}) {
      const b=fb.bbox.map(Number)
      return { id:Number(fb.id), x:b[0], y:b[1], w:b[2], h:b[3], conf: (fb as any).conf ?? 1 }
    }
    function IoU(a:[number,number,number,number], b:[number,number,number,number]) {
      const [ax,ay,aw,ah]=a,[bx,by,bw,bh]=b
      const x1=Math.max(ax,bx), y1=Math.max(ay,by)
      const x2=Math.min(ax+aw,bx+bw), y2=Math.min(ay+ah,by+bh)
      const iw=Math.max(0,x2-x1), ih=Math.max(0,y2-y1)
      const inter=iw*ih, union=aw*ah + bw*bh - inter
      return union>0 ? inter/union : 0
    }

    for (let start=0; start<frames.length; start+=chunk) {
      const end = Math.min(start+chunk, frames.length)
      for (let k=start; k<end; k++) {
        const fr = frames[k]
        const [gt, pred] = await Promise.all([
          fetchFrameBoxes(gtAnnotationId, fr.i).catch(()=>[]),
          fetchFrameBoxes(predAnnotationId, fr.i).catch(()=>[]),
        ])

        const gtb = gt.map(toBox)
        const prb = pred.map(toBox).filter(p => (p.conf ?? 1) >= conf)

        const usedGt = new Set<number>()
        const curMap = new Map<number, number>()
        for (const p of prb) {
          let bestGt=-1, bestIoU=0
          for (const g of gtb) {
            if (usedGt.has(g.id)) continue
            const v = IoU([p.x,p.y,p.w,p.h],[g.x,g.y,g.w,g.h])
            if (v > bestIoU) { bestIoU = v; bestGt = g.id }
            if (bestIoU >= iou) break
          }
          if (bestGt>=0 && bestIoU>=iou) { usedGt.add(bestGt); curMap.set(bestGt, p.id) }
        }

        let switched = false
        for (const [gtId, pid] of curMap) {
          const prevPid = prevMap.get(gtId)
          if (prevPid !== undefined && prevPid !== pid) { switched = true; break }
        }
        if (switched) idsw.push(fr.i)
        prevMap = curMap
      }
      set({ idswFrames: idsw.slice() })
      await new Promise(r=>setTimeout(r, 0))
    }
    set({ idswFrames: idsw })
  },

  // ---- actions ----
  setCur: (i) => set({ cur: i }),

  prefetchAround: (i, k) => {
    const { frames, imgCache } = get()
    const tasks: Promise<any>[] = []
    for (let d = -k; d <= k; d++) {
      const j = i + d
      if (j < 0 || j >= frames.length) continue
      const url = frames[j].url
      if (!imgCache.has(url)) {
        tasks.push(
          loadImage(url).then((im) => {
            const m = new Map(get().imgCache)
            m.set(url, im)
            set({ imgCache: m })
          }),
        )
      }
    }
    void Promise.allSettled(tasks)
  },

  getImage: async (url) => {
    const { imgCache } = get()
    const cached = imgCache.get(url)
    if (cached) return cached
    const im = await loadImage(url)
    const m = new Map(get().imgCache)
    m.set(url, im)
    set({ imgCache: m })
    return im
  },

  openFrameDir: () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.setAttribute('webkitdirectory', '')
    input.setAttribute('directory', '')
    input.multiple = true
    
    // Use addEventListener for more reliable event handling
    input.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement
      const files = Array.from(target.files || [])
        .filter((f) => f.type.startsWith('image/'))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      
      if (files.length === 0) {
        console.warn('No image files found in the selected folder')
        return
      }
      
      const frames: Frame[] = files.map((f, idx) => ({
        i: idx + 1,
        url: URL.createObjectURL(f),
      }))
      
      console.log(`Loaded ${frames.length} image frames from folder`)
      set({ frames, cur: 0 })
    })
    
    input.click()
  },

  openGT: () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.txt,.json'
    
    // Use addEventListener for more reliable event handling
    input.addEventListener('change', async (e) => {
      const target = e.target as HTMLInputElement
      const f = target.files?.[0]
      if (!f) return
      try {
        const ret = await uploadAnnotation('gt', f)
        set({ gtAnnotationId: ret.annotation_id })
        console.log('GT annotation uploaded successfully:', ret.annotation_id)
      } catch (e) {
        console.error('openGT failed', e)
        alert('GT 업로드 실패')
      }
    })
    
    input.click()
  },

  openPred: () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.txt,.json'
    
    // Use addEventListener for more reliable event handling
    input.addEventListener('change', async (e) => {
      const target = e.target as HTMLInputElement
      const f = target.files?.[0]
      if (!f) return
      try {
        const ret = await uploadAnnotation('pred', f)
        set({ predAnnotationId: ret.annotation_id })
        console.log('Pred annotation uploaded successfully:', ret.annotation_id)
      } catch (e) {
        console.error('openPred failed', e)
        alert('Pred 업로드 실패')
      }
    })
    
    input.click()
  },

  getPredBox: (frame, id, base) => {
    const o = get().overrides.get(frame)
    if (!o) return base
    const b = o.get(id)
    return b ? b : base
  },

  applyOverrideWithHistory: (frame, id, box) =>
    set((state) => {
      const map = new Map(state.overrides)
      const byF = new Map(map.get(frame) ?? new Map())
      const prev = byF.get(id) ?? null

      if (box) byF.set(id, box)
      else byF.delete(id)

      if (byF.size) map.set(frame, byF)
      else map.delete(frame)

      const undo = state.undoStack.slice()
      undo.push({ type: 'edit', frame, id, prev, next: box })
      return {
        overrides: map,
        overrideVersion: state.overrideVersion + 1,
        undoStack: undo,
        redoStack: [],
      }
    }),

  changeOverrideIdWithHistory: (frame, oldId, newId, geom) =>
    set((state) => {
      if (oldId === newId) return state

      const map = new Map(state.overrides)
      const byF = new Map(map.get(frame) ?? new Map())

      const current = byF.get(oldId) ?? { id: oldId, ...geom }
      byF.delete(oldId)
      byF.set(newId, { id: newId, ...geom })

      if (byF.size) map.set(frame, byF)
      else map.delete(frame)

      const undo = state.undoStack.slice()
      undo.push({ type: 'id-change', frame, oldId, newId, box: current })
      return {
        overrides: map,
        overrideVersion: state.overrideVersion + 1,
        undoStack: undo,
        redoStack: [],
      }
    }),

  resetCurrentFrame: () =>
    set((state) => {
      const frameKey = getCurrentFrameKey(state)
      const newOverrides = new Map(state.overrides)
      const snapshot = new Map(newOverrides.get(frameKey) ?? new Map())
      if (newOverrides.has(frameKey)) newOverrides.delete(frameKey)

      const undo = state.undoStack.slice()
      undo.push({ type: 'frame-reset', frame: frameKey, snapshot })

      return {
        overrides: newOverrides,
        overrideVersion: state.overrideVersion + 1,
        undoStack: undo,
        redoStack: [],
      }
    }),

  undo: () =>
    set((state) => {
      const last = state.undoStack[state.undoStack.length - 1]
      if (!last) return state

      const map = new Map(state.overrides)
      const redo = state.redoStack.slice()
      const undo = state.undoStack.slice(0, -1)

      if (last.type === 'edit') {
        const byF = new Map(map.get(last.frame) ?? new Map())
        if (last.prev) byF.set(last.id, last.prev)
        else byF.delete(last.id)
        if (byF.size) map.set(last.frame, byF)
        else map.delete(last.frame)
        redo.push(last)
      } else if (last.type === 'frame-reset') {
        if (last.snapshot.size > 0) map.set(last.frame, new Map(last.snapshot))
        else map.delete(last.frame)
        redo.push(last)
      } else if (last.type === 'id-change') {
        const byF = new Map(map.get(last.frame) ?? new Map())
        byF.delete(last.newId)
        byF.set(last.oldId, { ...last.box })
        if (byF.size) map.set(last.frame, byF)
        else map.delete(last.frame)
        redo.push(last)
      }

      return {
        overrides: map,
        overrideVersion: state.overrideVersion + 1,
        undoStack: undo,
        redoStack: redo,
      }
    }),

  redo: () =>
    set((state) => {
      const ent = state.redoStack[state.redoStack.length - 1]
      if (!ent) return state

      const map = new Map(state.overrides)
      const redo = state.redoStack.slice(0, -1)
      const undo = state.undoStack.slice()

      if (ent.type === 'edit') {
        const byF = new Map(map.get(ent.frame) ?? new Map())
        if (ent.next) byF.set(ent.id, ent.next)
        else byF.delete(ent.id)
        if (byF.size) map.set(ent.frame, byF)
        else map.delete(ent.frame)
        undo.push(ent)
      } else if (ent.type === 'frame-reset') {
        map.delete(ent.frame)
        undo.push(ent)
      } else if (ent.type === 'id-change') {
        const byF = new Map(map.get(ent.frame) ?? new Map())
        byF.delete(ent.oldId)
        byF.set(ent.newId, { id: ent.newId, x: ent.box.x, y: ent.box.y, w: ent.box.w, h: ent.box.h, conf: ent.box.conf })
        if (byF.size) map.set(ent.frame, byF)
        else map.delete(ent.frame)
        undo.push(ent)
      }

      return {
        overrides: map,
        overrideVersion: state.overrideVersion + 1,
        undoStack: undo,
        redoStack: redo,
      }
    }),

  exportModifiedPred: async () => {
    const { overrides, predAnnotationId } = get()
    if (!predAnnotationId) {
      alert('Pred annotation이 아직 없습니다.')
      return
    }

    const list: Array<{ frame: number; id: number; x: number; y: number; w: number; h: number; conf: number }> = []
    for (const [f, byF] of overrides.entries()) {
      for (const [id, b] of byF.entries()) {
        list.push({
          frame: f,
          id,
          x: Math.round(b.x),
          y: Math.round(b.y),
          w: Math.round(b.w),
          h: Math.round(b.h),
          conf: typeof b.conf === 'number' ? b.conf : 1.0,
        })
      }
    }

    if (list.length === 0) {
      const url = `${import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000'}/annotations/${predAnnotationId}/download`
      window.open(url, '_blank')
      return
    }

    const url = `${import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000'}/export/merge`
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pred_annotation_id: predAnnotationId, overrides: list }),
    })
    if (!r.ok) {
      const txt = await r.text().catch(() => String(r.status))
      throw new Error(`export failed: ${txt}`)
    }
    const blob = await r.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `prediction_merged_full_${predAnnotationId}.txt`
    a.click()
  },
}))

export default useFrameStore
export { useFrameStore }

if (import.meta.env.DEV) {
  // @ts-ignore
  ;(window as any).useFrameStore = useFrameStore
}
