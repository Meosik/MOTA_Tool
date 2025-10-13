let socket: WebSocket | null = null
let pending: ((msg:any)=>void)[] = []

const BASE = (import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000').replace('http','ws')

export const ws = {
  async connect(){
    if(socket && socket.readyState === WebSocket.OPEN) return
    socket = new WebSocket(`${BASE}/ws/preview`)
    await new Promise<void>((resolve)=>{
      socket!.onopen = ()=> resolve()
    })
    socket.onmessage = (ev)=>{
      const msg = JSON.parse(ev.data)
      const cb = pending.shift()
      if(cb) cb(msg)
    }
  },
  preview(payload:any, cb:(msg:any)=>void){
    if(!socket || socket.readyState !== WebSocket.OPEN) return
    pending.push(cb)
    socket.send(JSON.stringify(payload))
  },
  close(){
    if(socket) socket.close()
    socket = null
  }
}