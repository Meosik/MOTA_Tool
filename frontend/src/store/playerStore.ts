import { create } from 'zustand'
export const usePlayerStore = create<any>(()=>({
  currentTime: 0,
}))