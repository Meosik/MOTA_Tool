
import { create } from 'zustand'

export type FrameMeta = { i:number, url:string, w:number, h:number }
type St = {
  frames: FrameMeta[]
  cur: number
  fps: number
  gtId?: string
  predId?: string
  setCur: (i:number)=>void
  openFrameDir: () => Promise<void>
  openGT: () => Promise<void>
  openPred: () => Promise<void>
}

export const useFrameStore = create<St>((set,get)=>({ 
  frames: [], cur: 0, fps: 30,
  setCur(i){
    const max = get().frames.length - 1
    const v = Math.max(0, Math.min(i, max))
    set({ cur: v })
  },
  async openFrameDir(){
    const picker: any = (window as any).showDirectoryPicker
    if(!picker){
      alert('이 브라우저는 폴더 선택 API를 지원하지 않습니다. (Chromium 권장)')
      return
    }
    const dir: any = await picker()
    const arr: FrameMeta[] = []
    for await (const [name, handle] of dir.entries()){
      if (handle.kind==='file' && /\.(png|jpe?g)$/i.test(name)){
        const i = parseInt(name.replace(/\D/g,''),10) || 0
        const file = await handle.getFile()
        const url = URL.createObjectURL(file)
        arr.push({ i, url, w:0, h:0 })
      }
    }
    arr.sort((a,b)=>a.i-b.i)
    set({ frames: arr, cur: 0 })
  },
  async openGT(){
    alert('GT 업로드 로직을 API에 연결하세요 (/annotations).')
  },
  async openPred(){
    alert('Pred 업로드 로직을 API에 연결하세요 (/annotations).')
  }
}))
