export type MotRecord = {
  frame: number
  id: number
  x: number
  y: number
  w: number
  h: number
  conf: number
}

export function parseMot(text: string): MotRecord[] {
  const out: MotRecord[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split(',').map(s => s.trim())
    // MOT 유효 레코드는 정확히 10필드
    if (parts.length !== 10) continue
    const [f,id,x,y,w,h,conf] = parts.slice(0,7).map(Number)
    if ([f,id,x,y,w,h,conf].some(v => Number.isNaN(v))) continue
    out.push({ frame:f, id, x, y, w, h, conf })
  }
  return out
}
