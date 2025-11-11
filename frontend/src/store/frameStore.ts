// frontend/src/store/frameStore.ts
import { create } from 'zustand'
import { API_BASE } from '../lib/api';

export type Mode = 'local' | 'server-tracks' | 'server-ws'
export type Box = { x:number; y:number; w:number; h:number; id:number }
export type FrameMeta = { i: number; url: string; name?: string }
export type MotRecord = { frame:number; id:number; x:number; y:number; w:number; h:number }

type Actions = {
  setFrames: (frames: FrameMeta[]) => void
  setCur: (idx: number) => void
  prefetchAround: (idx: number, radius?: number) => void
  openFrameDir: () => void
  openGT: () => void
  openPred: () => void
  setGT: (recs: MotRecord[]) => void
  setPred: (recs: MotRecord[]) => void
  setMode: (m: Mode) => void
  setIou: (v: number) => void
  toggleGT: () => void
  togglePred: () => void
  applyOverride: (frame: number, id: number, box: Box) => void
  getPredBox: (frame: number, id: number, fallback: Box) => Box
  markDirty: () => void
  syncEditedPredDebounced: () => void
}

type State = {
  frames: FrameMeta[]
  cur: number
  imgCache: Map<number, HTMLImageElement>
  gt: MotRecord[]
  pred: MotRecord[]
  gtId?: string
  predId?: string
  editedPredId?: string
  mode: Mode
  iou: number
  showGT: boolean
  showPred: boolean
  overrides: Map<number, Map<number, Box>>
  dirty: boolean
  setFrames: Actions['setFrames']
  setCur: Actions['setCur']
  prefetchAround: Actions['prefetchAround']
  openFrameDir: Actions['openFrameDir']
  openGT: Actions['openGT']
  openPred: Actions['openPred']
  setGT: Actions['setGT']
  setPred: Actions['setPred']
  setMode: Actions['setMode']
  setIou: Actions['setIou']
  toggleGT: Actions['toggleGT']
  togglePred: Actions['togglePred']
  applyOverride: Actions['applyOverride']
  getPredBox: Actions['getPredBox']
  markDirty: Actions['markDirty']
  syncEditedPredDebounced: Actions['syncEditedPredDebounced']
  actions: Actions
}

let _debounceTimer: any = null

function parseMOT(text: string): MotRecord[] {
  const out: MotRecord[] = []
  const lines = text.split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(',').map(s => s.trim())
    if (parts.length < 6) continue
    const frame = Number(parts[0])
    const id = Number(parts[1])
    const x = Number(parts[2])
    const y = Number(parts[3])
    const w = Number(parts[4])
    const h = Number(parts[5])
    if ([frame,id,x,y,w,h].some(n => !Number.isFinite(n))) continue
    out.push({ frame, id, x, y, w, h })
  }
  return out
}

function pickDirectory(cb: (files: FileList) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  ;(input as any).webkitdirectory = true
  input.multiple = true
  input.onchange = () => {
    if (input.files) cb(input.files)
  }
  input.click()
}

function pickFile(accept: string, cb: (file: File) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept
  input.onchange = () => {
    const f = input.files?.[0]
    if (f) cb(f)
  }
  input.click()
}

function naturalKey(name: string): (string|number)[] {
  const res: (string|number)[] = []
  name.replace(/(\d+)|(\D+)/g, (_m, num, str) => {
    if (num) res.push(Number(num))
    else res.push(String(str))
    return ''
  })
  return res
}

export const useFrameStore = create<State>((set, get) => {
  const actions: Actions = {
    setFrames: (frames) => set({ frames }),
    setCur: (idx) => set({ cur: Math.max(0, Math.min(idx, get().frames.length-1)) }),

    prefetchAround: (idx: number, radius = 2) => {
      const { frames, imgCache } = get()
      for (let i = Math.max(0, idx - radius); i <= Math.min(frames.length - 1, idx + radius); i++) {
        if (imgCache.has(i)) continue
        const meta = frames[i]
        if (!meta) continue
        const img = new Image()
        img.src = meta.url
        img.onload = () => {
          const cache = new Map(get().imgCache)
          cache.set(i, img)
          set({ imgCache: cache })
        }
      }
    },

    openFrameDir: () => {
      pickDirectory((files) => {
        const images = Array.from(files).filter(f =>
          /\.(png|jpg|jpeg|bmp|webp)$/i.test(f.name)
        )
        images.sort((a, b) => {
          const ka = naturalKey(a.name)
          const kb = naturalKey(b.name)
          const n = Math.min(ka.length, kb.length)
          for (let i=0;i<n;i++){
            const aa = ka[i], bb = kb[i]
            if (aa === bb) continue
            if (typeof aa === 'number' && typeof bb === 'number') return aa - bb
            return String(aa).localeCompare(String(bb))
          }
          return ka.length - kb.length
        })
        const frames: FrameMeta[] = images.map((f, idx) => {
          const url = URL.createObjectURL(f)
          const m = f.name.match(/(\d+)/)
          const i = m ? parseInt(m[1], 10) : (idx + 1)
          return { i, url, name: f.name }
        })
        set({ frames, cur: 0 })
        get().prefetchAround(0, 4)
      })
    },

    openGT: () => {
      pickFile('.txt,.csv', (file) => {
        const reader = new FileReader()
        reader.onload = async () => {
          try {
            const text = String(reader.result || '')
            const recs = parseMOT(text)
            set({ gt: recs })
            const body = new FormData()
            body.append('kind', 'gt')
            body.append('file', new Blob([text], { type: 'text/plain' }), file.name || 'gt.txt')
            const apiBase = (import.meta as any).env?.VITE_API_BASE || ''
            const resp = await fetch(`${API_BASE}/annotations`, { method: 'POST', body });
            const json = await resp.json().catch(()=>null as any)
            if (json?.annotation_id) set({ gtId: json.annotation_id })
          } catch (e) {
            console.warn('openGT failed', e)
          }
        }
        reader.readAsText(file)
      })
    },

    openPred: () => {
      pickFile('.txt,.csv', (file) => {
        const reader = new FileReader()
        reader.onload = async () => {
          try {
            const text = String(reader.result || '')
            const recs = parseMOT(text)
            set({ pred: recs })
            const body = new FormData()
            body.append('kind', 'pred')
            body.append('file', new Blob([text], { type: 'text/plain' }), file.name || 'pred.txt')
            const apiBase = (import.meta as any).env?.VITE_API_BASE || ''
            const resp = await fetch(`${API_BASE}/annotations`, { method: 'POST', body });
            const json = await resp.json().catch(()=>null as any)
            if (json?.annotation_id) set({ predId: json.annotation_id })
          } catch (e) {
            console.warn('openPred failed', e)
          }
        }
        reader.readAsText(file)
      })
    },

    setGT: (recs) => set({ gt: recs }),
    setPred: (recs) => set({ pred: recs }),
    setMode: (m) => set({ mode: m }),
    setIou: (v) => set({ iou: v }),
    toggleGT: () => set((s) => ({ showGT: !s.showGT })),
    togglePred: () => set((s) => ({ showPred: !s.showPred })),

    applyOverride: (frame, id, box) => {
      const prev = get().overrides
      const map = new Map(prev)
      const perFrame = new Map(map.get(frame) || [])
      perFrame.set(id, { ...box })
      map.set(frame, perFrame)
      set({ overrides: map })
    },

    getPredBox: (frame, id, fallback) => {
      const perFrame = get().overrides.get(frame)
      const ov = perFrame?.get(id)
      return ov ? ov : fallback
    },

    markDirty: () => set({ dirty: true }),

    syncEditedPredDebounced: () => {
      clearTimeout(_debounceTimer)
      _debounceTimer = setTimeout(async () => {
        const { overrides } = get()
        try {
          let lines: string[] = []
          for (const [frame, idMap] of overrides.entries()) {
            for (const [id, b] of idMap.entries()) {
              lines.push(`${frame},${id},${b.x.toFixed(2)},${b.y.toFixed(2)},${b.w.toFixed(2)},${b.h.toFixed(2)},1,-1,-1,-1`)
            }
          }
          const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
          const body = new FormData()
          body.append('kind', 'pred')
          body.append('file', blob, 'edited_pred.txt')
          const apiBase = (import.meta as any).env?.VITE_API_BASE || ''
          const resp = await fetch(`${apiBase}/annotations`, { method: 'POST', body })
          const json = await resp.json().catch(() => ({} as any))
          if (json && json.annotation_id) {
            set({ editedPredId: json.annotation_id, dirty: false })
          } else {
            set({ dirty: true })
            console.warn('upload_annotation: unexpected response', json)
          }
        } catch (e) {
          console.warn('syncEditedPredDebounced failed:', e)
          set({ dirty: true })
        }
      }, 300)
    },
  }

  return {
    frames: [],
    cur: 0,
    imgCache: new Map(),
    gt: [],
    pred: [],
    gtId: undefined,
    predId: undefined,
    editedPredId: undefined,
    mode: 'local',
    iou: 0.5,
    showGT: true,
    showPred: true,
    overrides: new Map(),
    dirty: false,
    ...actions,
    actions,
  }
})

export default useFrameStore
