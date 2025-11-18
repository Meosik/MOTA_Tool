
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
export type FlatBox = { id: number|string, bbox: [number,number,number,number] };
export async function fetchFrameBoxes(annotationId: string, f: number){
  const data = await getJSON<{tracks: {id:any, frames:{f:number, bbox:number[]}[]}[]}>(`${API_BASE}/tracks?annotation_id=${annotationId}&f0=${f}&f1=${f}`);
  const out: FlatBox[] = [];
  for (const tr of data.tracks || []) {
    for (const fr of tr.frames || []) {
      // f가 일치하는 것만
      if (Number(fr.f) === Number(f)) {
        const b = fr.bbox.map(Number);
        out.push({ id: tr.id, bbox: [b[0],b[1],b[2],b[3]] as any });
      }
    }
  }
  return out;
}

// mAP calculation types and functions
export interface Category {
  id: number;
  name: string;
  supercategory?: string;
}

export interface BBoxAnnotation {
  bbox: number[];  // [x, y, width, height]
  category_id: number;
  score?: number;
  image_id?: number;
}

export interface MapMetrics {
  mean_ap: number;
  class_aps: Record<number, number>;
  iou_threshold: number;
  confidence_threshold: number;
  num_classes: number;
}

export interface MapCalculateRequest {
  gt_annotations: BBoxAnnotation[];
  pred_annotations: BBoxAnnotation[];
  categories: Record<number, Category>;
  iou_threshold: number;
  confidence_threshold: number;
}

export async function calculateMap(request: MapCalculateRequest): Promise<MapMetrics> {
  const r = await fetch(`${API_BASE}/api/map/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}