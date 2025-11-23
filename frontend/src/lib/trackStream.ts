// frontend/src/lib/trackStream.ts
// WebSocket 기반 트랙 청크 스트림 헬퍼

export interface TrackStreamConfig {
  gtId?: string;
  predId?: string;
  f0: number;
  f1: number;
  chunk?: number; // 기본 50
  baseUrl?: string; // ws:// or wss:// host (기본 API_BASE를 ws로 변환)
  onChunk: (chunk: {
    f0: number; f1: number;
    tracks: { kind: 'gt'|'pred'; id: string; tracks: { id:any; frames:{f:number; bbox:number[]; conf?:number}[] }[] }[];
  })=>void;
  onDone?: ()=>void;
  onError?: (err: any)=>void;
}

export interface TrackStreamHandle {
  close: ()=>void;
}

function toWsBase(httpBase: string): string {
  try {
    if (httpBase.startsWith('ws://') || httpBase.startsWith('wss://')) return httpBase;
    if (httpBase.startsWith('https://')) return 'wss://' + httpBase.substring('https://'.length);
    if (httpBase.startsWith('http://')) return 'ws://' + httpBase.substring('http://'.length);
    return 'ws://' + httpBase; // fallback
  } catch { return httpBase; }
}

export function openTrackStream(cfg: TrackStreamConfig): TrackStreamHandle {
  const { gtId, predId, f0, f1, chunk = 50, onChunk, onDone, onError } = cfg;
  const baseHttp = (import.meta as any).env?.VITE_API_BASE || 'http://127.0.0.1:8000';
  const wsBase = toWsBase(cfg.baseUrl || baseHttp);
  const url = wsBase + '/ws/tracks';
  const ws = new WebSocket(url);

  ws.onopen = () => {
    const annotations: any[] = [];
    if (gtId) annotations.push({ kind: 'gt', id: gtId });
    if (predId) annotations.push({ kind: 'pred', id: predId });
    ws.send(JSON.stringify({ type: 'subscribe', annotations, f0, f1, chunk }));
  };

  ws.onmessage = (ev) => {
    let data: any;
    try { data = JSON.parse(ev.data); } catch { return; }
    if (data.type === 'chunk') {
      onChunk({ f0: data.range?.f0, f1: data.range?.f1, tracks: data.tracks || [] });
    } else if (data.type === 'done') {
      onDone && onDone();
      ws.close();
    } else if (data.error) {
      onError && onError(new Error(data.error));
    }
  };

  ws.onerror = (e) => { onError && onError(e); };

  return {
    close: () => { try { ws.close(); } catch {} }
  };
}
