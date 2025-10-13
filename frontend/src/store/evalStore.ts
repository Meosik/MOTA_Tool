import { create } from 'zustand'

type Metrics = {MOTA:number, counts:{GT:number, FP:number, FN:number, IDSW:number}}
type St = { metrics?: Metrics, setMetrics:(m:Metrics)=>void }

export const useEvalStore = create<St>((set)=>({
  metrics: undefined,
  setMetrics: (m)=> set({metrics:m})
}))