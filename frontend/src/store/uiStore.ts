import { create } from 'zustand'
export const useUIStore = create<any>(()=>({
  panel:'',
}))