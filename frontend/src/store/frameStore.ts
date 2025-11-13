import { create } from 'zustand'
import { uploadAnnotation } from '../lib/api'

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

  // overrides & history
  overrides: Map<number, Map<number, Box>> // key = frame number (Frame.i)
  overrideVersion: number
  undoStack: EditEntry[]
  redoStack: EditEntry[]

  // actions
  setCur: (i: number) => void
  prefetchAround: (i: number, k: number) => void
  getImage: (url: string) => Promise<HTMLImageElement>

  openFrameDir: () => void
  openGT: () => void
  openPred: () => void

  getPredBox: (frame: number, id: number, base: Box) => Box
  applyOverrideWithHistory: (frame: number, id: number, box: Box | null) => void
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

// 현재 프레임의 키(항상 Frame.i 사용)
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

  overrides: new Map(),
  overrideVersion: 0,
  undoStack: [],
  redoStack: [],

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
    // ✅ 브라우저 속성은 속성으로 지정 (TS 억제 불필요)
    input.setAttribute('webkitdirectory', '')  // Chrome/Edge
    input.setAttribute('directory', '')        // 일부 브라우저 호환
    input.multiple = true

    input.onchange = () => {
      const files = Array.from(input.files || [])
        .filter((f) => f.type.startsWith('image/'))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

      const frames: Frame[] = files.map((f, idx) => ({
        i: idx + 1,
        url: URL.createObjectURL(f),
      }))
      set({ frames, cur: 0 })
    }

    input.click()
  },

  openGT: () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.txt,.json'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return
      try {
        const ret = await uploadAnnotation('gt', f)
        set({ gtAnnotationId: ret.annotation_id })
      } catch (e) {
        console.error('openGT failed', e)
        alert('GT 업로드 실패')
      }
    }
    input.click()
  },

  openPred: () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.txt,.json'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return
      try {
        const ret = await uploadAnnotation('pred', f)
        set({ predAnnotationId: ret.annotation_id })
      } catch (e) {
        console.error('openPred failed', e)
        alert('Pred 업로드 실패')
      }
    }
    input.click()
  },

  // base + overrides merge
  getPredBox: (frame, id, base) => {
    const o = get().overrides.get(frame)
    if (!o) return base
    const b = o.get(id)
    return b ? b : base
  },

  // history + apply (frame은 Frame.i를 넣어야 함)
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
      }

      return {
        overrides: map,
        overrideVersion: state.overrideVersion + 1,
        undoStack: undo,
        redoStack: redo,
      }
    }),

  // 전체 수정본 export (서버 /export/merge 사용)
  exportModifiedPred: async () => {
    const { overrides, predAnnotationId } = get()
    if (!predAnnotationId) {
      alert('Pred annotation이 아직 없습니다.')
      return
    }

    const list: Array<{
      frame: number
      id: number
      x: number
      y: number
      w: number
      h: number
      conf: number
    }> = []
    for (const [f, byF] of overrides.entries()) {
      for (const [id, b] of byF.entries()) {
        list.push({
          frame: f,
          id,
          x: b.x,
          y: b.y,
          w: b.w,
          h: b.h,
          conf: typeof b.conf === 'number' ? b.conf : 1.0,
        })
      }
    }

    // 오버라이드가 없으면 원본을 바로 다운
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

// 개발 중 콘솔 접근용
if (import.meta.env.DEV) {
  // @ts-ignore
  ;(window as any).useFrameStore = useFrameStore
}
