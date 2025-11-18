import type { Box } from '../types/annotation';

export function iouRect(a: Box, b: Box){
  const ax2 = a.x + a.w, ay2 = a.y + a.h
  const bx2 = b.x + b.w, by2 = b.y + b.h
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y)
  const x2 = Math.min(ax2, bx2), y2 = Math.min(ay2, by2)
  const iw = Math.max(0, x2 - x1), ih = Math.max(0, y2 - y1)
  const inter = iw * ih
  const union = a.w*a.h + b.w*b.h - inter
  return union>0 ? (inter/union) : 0
}

export function matchOneToOneGreedy(preds: Box[], gts: Box[], thr: number){
  type Pair = { p: number, g: number, iou: number }
  const pairs: Pair[] = []
  for (let i=0;i<preds.length;i++){
    for (let j=0;j<gts.length;j++){
      const v = iouRect(preds[i], gts[j])
      if (v >= thr) pairs.push({ p:i, g:j, iou:v })
    }
  }
  pairs.sort((a,b)=> b.iou - a.iou)
  const usedP = new Set<number>(), usedG = new Set<number>()
  const keepPred = new Set<number>()
  for (const pr of pairs){
    if (usedP.has(pr.p) || usedG.has(pr.g)) continue
    usedP.add(pr.p); usedG.add(pr.g)
    keepPred.add(pr.p)
  }
  return keepPred
}
