// frontend/src/lib/ws.ts
export type PreviewRequest = { gt_id: string; pred_id: string; iou: number; conf: number }
export type PreviewResponse = {
  MOTA?: number; mota?: number;
  TP?: number; tp?: number;
  FP?: number; fp?: number;
  FN?: number; fn?: number;
  IDSW?: number; idsw?: number;
  error?: string;
}

function normalize(resp: PreviewResponse) {
  const pick = (a?: number, b?: number) =>
    typeof a === 'number' ? a : (typeof b === 'number' ? b : undefined);
  return {
    mota: pick(resp.MOTA, (resp as any).mota),
    tp:   pick(resp.TP,   (resp as any).tp),
    fp:   pick(resp.FP,   (resp as any).fp),
    fn:   pick(resp.FN,   (resp as any).fn),
    idsw: pick(resp.IDSW, (resp as any).idsw),
    error: resp.error,
  };
}

function buildWsUrl() {
  const raw = (import.meta as any).env?.VITE_WS_BASE ?? '';
  // 1) 만약 사용자가 wss://… 또는 ws://… 전체 URL을 준 경우 그대로 사용
  if (/^wss?:\/\//i.test(raw)) return `${raw.replace(/\/+$/,'')}/ws/preview`;
  // 2) host:port 형식이면 브라우저 프로토콜로 스킴 결정
  const host = raw || window.location.host; // 기본은 현재 호스트
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${host.replace(/^https?:\/\//i,'')}/ws/preview`;
}

export class PreviewWS {
  private url: string;
  private ws: WebSocket | null = null;
  private lastPayload: PreviewRequest | null = null;
  private onMessage: ((msg: ReturnType<typeof normalize>) => void) | null = null;
  private onState?: (state: 'open'|'close'|'error') => void;

  constructor(url?: string){ this.url = url || buildWsUrl(); }

  connect(onMessage: (m: ReturnType<typeof normalize>) => void,
          onState?: (s: 'open'|'close'|'error') => void) {
    this.onMessage = onMessage; this.onState = onState;
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => { this.onState?.('open'); if (this.lastPayload) this.sendPreview(this.lastPayload); };
    this.ws.onmessage = (ev) => {
      try { this.onMessage?.(normalize(JSON.parse(ev.data))); }
      catch { this.onMessage?.({ mota:undefined, tp:undefined, fp:undefined, fn:undefined, idsw:undefined, error:String(ev.data||'') }); }
    };
    this.ws.onclose = () => this.onState?.('close');
    this.ws.onerror = () => this.onState?.('error');
  }

  sendPreview(payload: PreviewRequest){
    this.lastPayload = payload;
    if (!this.ws) return;
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(payload));
  }

  close(){ try{ this.ws?.close() }catch{} this.ws = null; this.lastPayload = null; }
}
