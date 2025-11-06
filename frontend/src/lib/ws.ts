// Lightweight WS helper used by RightPanel.tsx
export type PreviewRequest = {
  gt_annotation_id: string
  pred_annotation_id: string
  iou_threshold: number
}

export type PreviewResponse = {
  MOTA?: number
  TP?: number
  FP?: number
  FN?: number
  IDSW?: number
  error?: string
}

export class PreviewWS {
  private url: string
  private ws: WebSocket | null = null
  private onMessage: ((msg: PreviewResponse) => void) | null = null

  constructor(url: string){
    this.url = url
  }

  connect(onMessage: (msg: PreviewResponse) => void){
    this.onMessage = onMessage
    this.ws = new WebSocket(this.url)
    this.ws.onopen = () => {}
    this.ws.onmessage = (ev) => {
      try{
        const msg = JSON.parse(ev.data) as PreviewResponse
        this.onMessage && this.onMessage(msg)
      }catch(e){
        console.warn('[WS] parse error', e)
      }
    }
    this.ws.onclose = () => {}
    this.ws.onerror = (err) => { console.warn('[WS] error', err) }
  }

  sendPreview(payload: PreviewRequest){
    if (this.ws && this.ws.readyState === WebSocket.OPEN){
      this.ws.send(JSON.stringify(payload))
    }
  }

  close(){
    try{ this.ws?.close() } catch{}
    this.ws = null
  }
}
