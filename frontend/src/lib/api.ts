
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000'

export async function getJSON<T=any>(url: string): Promise<T>{
  const r = await fetch(url)
  if(!r.ok) throw new Error(await r.text())
  return r.json()
}

// 어노테이션 업로드 (MOT txt/json 파일)
export async function uploadAnnotation(kind: 'gt'|'pred', file: File){
  const fd = new FormData();
  fd.append('kind', kind);
  fd.append('file', file);
  const r = await fetch(`${API_BASE}/annotations`, { method:'POST', body: fd });
  if(!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{annotation_id: string, sha256: string}>;
}

// 프레임 f의 박스들 조회 (정규화된 /tracks 응답을 납작하게)
export type FlatBox = { id: number|string, bbox: [number,number,number,number], conf?: number };
export async function fetchFrameBoxes(annotationId: string, f: number){
  const data = await getJSON<{tracks: {id:any, frames:{f:number, bbox:number[], conf?:number}[]}[]}>(`${API_BASE}/tracks?annotation_id=${annotationId}&f0=${f}&f1=${f}`);
  const out: FlatBox[] = [];
  for (const tr of data.tracks || []) {
    for (const fr of tr.frames || []) {
      // f가 일치하는 것만
      if (Number(fr.f) === Number(f)) {
        const b = fr.bbox.map(Number);
        out.push({ id: tr.id, bbox: [b[0],b[1],b[2],b[3]] as any, ...(fr.conf != null ? { conf: Number(fr.conf) } : {}) });
      }
    }
  }
  return out;
}

// 프레임 범위 f0~f1의 모든 박스들 조회 (배치)
export async function fetchTracksWindow(annotationId: string, f0: number, f1: number){
  const data = await getJSON<{tracks: {id:any, frames:{f:number, bbox:number[], conf?:number}[]}[]}>(`${API_BASE}/tracks?annotation_id=${annotationId}&f0=${f0}&f1=${f1}`);
  return data;
}