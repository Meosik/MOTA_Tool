import { create } from 'zustand'
import type { MotRecord } from '../utils/parseMot'
import { parseMot } from '../utils/parseMot'

export type FrameMeta = { i:number, url:string, w:number, h:number }

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
}

export const useFrameStore = create<St>((set,get)=>({
  frames: [],
  cur: 0,
  fps: 30,
  gt: [],
  pred: [],
  showGT: true,
  showPred: true,

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
}))
