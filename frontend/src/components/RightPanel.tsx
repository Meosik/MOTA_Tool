// frontend/src/components/RightPanel.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import useFrameStore from '../store/frameStore'
import { PreviewWS } from '../lib/ws'

export default function RightPanel(){
  const { iou, setIou, gtId, predId, editedPredId } = useFrameStore() as any

  // WS 전용으로 항상 동작
  const [wsState, setWsState] = useState<'open'|'close'|'error'|'idle'>('idle')
  const [mota, setMota] = useState<number | undefined>(undefined)
  const [details, setDetails] = useState<{tp?:number; fp?:number; fn?:number; idsw?:number}>({})

  const wsRef = useRef<PreviewWS | null>(null)

  // 1) 연결 (마운트 시 1회)
  useEffect(() => {
    if (!wsRef.current){
      wsRef.current = new PreviewWS() // env의 VITE_WS_BASE로 ws://.../ws/preview 자동 구성
      wsRef.current.connect(
        (msg) => {
          // { mota, tp, fp, fn, idsw, error }
          if (typeof msg.mota === 'number') setMota(msg.mota)
          setDetails(prev => ({
            tp:  typeof msg.tp   === 'number' ? msg.tp   : prev.tp,
            fp:  typeof msg.fp   === 'number' ? msg.fp   : prev.fp,
            fn:  typeof msg.fn   === 'number' ? msg.fn   : prev.fn,
            idsw:typeof msg.idsw === 'number' ? msg.idsw : prev.idsw,
          }))
        },
        (state) => setWsState(state)
      )
    }
    return () => { wsRef.current?.close(); wsRef.current = null }
  }, [])

  // 2) 의존성 변경 시 프리뷰 전송
  const iouSafe = useMemo(() => (Number.isFinite(iou) ? iou : 0.5), [iou])
  useEffect(() => {
    const gid = gtId
    const pid = editedPredId || predId
    if (!gid || !pid) return
    wsRef.current?.sendPreview({ gt_id: gid, pred_id: pid, iou: iouSafe })
  }, [gtId, predId, editedPredId, iouSafe])

  const fmt = (v?: number, digits=3) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '-')

  return (
    <aside className="w-80 shrink-0 border-l border-neutral-200 p-3 space-y-4">
      <h2 className="text-lg font-semibold">Metrics (WS)</h2>

      <div className="text-xs text-neutral-500">
        WS: <span className={wsState==='open' ? 'text-green-600' : wsState==='error' ? 'text-red-600' : ''}>
          {wsState}
        </span>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">IoU threshold: {fmt(iouSafe, 2)}</label>
        <input
          type="range"
          min={0.1}
          max={0.9}
          step={0.05}
          value={Number.isFinite(iou) ? iou : 0.5}
          onChange={(e)=> setIou?.(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="col-span-2 flex items-center justify-between">
          <span className="font-medium">MOTA</span>
          <span className="tabular-nums">{fmt(mota, 3)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>TP</span><span className="tabular-nums">{fmt(details.tp, 0)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>FP</span><span className="tabular-nums">{fmt(details.fp, 0)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>FN</span><span className="tabular-nums">{fmt(details.fn, 0)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>IDSW</span><span className="tabular-nums">{fmt(details.idsw, 0)}</span>
        </div>
      </div>

      <div className="text-xs text-neutral-500">
        gt={gtId || '-'} / pred={editedPredId || predId || '-'}
      </div>
    </aside>
  )
}
