import React, { useEffect, useMemo, useRef, useState } from 'react'
import useFrameStore from '../store/frameStore'
import { PreviewWS } from '../lib/ws'

export default function RightPanel() {
  const { gtAnnotationId, predAnnotationId, iou, setIou, conf, setConf, overrideVersion } = useFrameStore(s => ({
    gtAnnotationId: s.gtAnnotationId,
    predAnnotationId: s.predAnnotationId,
    iou: s.iou, setIou: s.setIou,
    conf: s.conf, setConf: s.setConf,
    overrideVersion: s.overrideVersion,
  }))

  const iouSafe  = useMemo(() => Number.isFinite(iou)  ? iou  : 0.5, [iou])
  const confSafe = useMemo(() => Number.isFinite(conf) ? conf : 0.0, [conf])

  const wsRef = useRef<PreviewWS | null>(null)
  const overridesMap = useFrameStore(s => s.overrides)
  // WS 연결 상태는 더 이상 UI에 표시하지 않음
  const [mota, setMota] = useState<number|undefined>()
  const [detail, setDetail] = useState<{tp?:number;fp?:number;fn?:number;idsw?:number;error?:string}>({})

  // WS 연결
  useEffect(() => {
    const ws = new PreviewWS() // url은 ws.ts에서 VITE_WS_BASE/현재 호스트 기반으로 생성
    wsRef.current = ws
    ws.connect((raw) => {
      // 백엔드 메시지 키 케이스 호환 처리
      const msg: any = raw;
      const motaVal = msg.mota ?? msg.MOTA;
      setMota(typeof motaVal === 'number' ? motaVal : undefined);
      setDetail({
        tp: msg.tp ?? msg.TP,
        fp: msg.fp ?? msg.FP,
        fn: msg.fn ?? msg.FN,
        idsw: msg.idsw ?? msg.IDSW,
        error: msg.error,
      });
    }, () => {})
    return () => { ws.close(); wsRef.current = null }
  }, [])

  // 요청 전송 트리거: GT/PRED/IOU/오버라이드 변경 시
  useEffect(() => {
    const ws = wsRef.current
    const gid = gtAnnotationId
    const pid = predAnnotationId
    if (!ws || !gid || !pid) {
      setMota(undefined); setDetail({});
      return
    }
    // overrides 직렬화: frame -> { originalId: newId }
    // geometry & id 동시 전달 (백엔드가 미변경 항목은 그대로 사용)
    const overridesPayload: Record<string, Record<string, any>> = {}
    overridesMap.forEach((boxMap, frame) => {
      const frameMap: Record<string, any> = {}
      boxMap.forEach((box, origId) => {
        frameMap[String(origId)] = {
          id: box.id,
          x: box.x,
          y: box.y,
          w: box.w,
          h: box.h,
          ...(box.conf!=null ? { conf: box.conf } : {}),
        }
      })
      if (Object.keys(frameMap).length) overridesPayload[String(frame)] = frameMap
    })
    ws.sendPreview({ gt_id: gid, pred_id: pid, iou: iouSafe, conf: confSafe, overrides: overridesPayload })
  }, [gtAnnotationId, predAnnotationId, iouSafe, confSafe, overrideVersion, overridesMap])

  // 슬라이더 조정 유틸
  const stepSmall = 0.01
  const stepLarge = 0.05
  const round2 = (v:number)=> Math.round(v*100)/100
  const clamp01= (v:number)=> Math.max(0, Math.min(1, v))
  const adjustIou  = (d:number)=> setIou(clamp01(round2(iouSafe + d)))
  const adjustConf = (d:number)=> setConf(clamp01(round2(confSafe + d)))

  return (
    <aside className="w-80 shrink-0 border-l border-neutral-200 p-3 flex flex-col gap-4">

      {/* IoU */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">IoU threshold ({iouSafe.toFixed(2)})</div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={()=>adjustIou(-stepLarge)} title="IoU -0.05">
            <svg viewBox="0 0 20 12" width="16" height="12"><polygon points="9,6 17,1 17,11"/><polygon points="1,6 9,1 9,11"/></svg>
          </button>
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={()=>adjustIou(-stepSmall)} title="IoU -0.01">
            <svg viewBox="0 0 12 12" width="12" height="12" style={{transform:'scaleX(-1)'}}><polygon points="2,1 10,6 2,11"/></svg>
          </button>
          <input
            type="range" min={0} max={1} step={0.01}
            value={iouSafe}
            onChange={e=>setIou(clamp01(parseFloat(e.currentTarget.value)))}
            className="flex-1"
          />
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={()=>adjustIou(+stepSmall)} title="IoU +0.01">
            <svg viewBox="0 0 12 12" width="12" height="12"><polygon points="2,1 10,6 2,11"/></svg>
          </button>
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={()=>adjustIou(+stepLarge)} title="IoU +0.05">
            <svg viewBox="0 0 20 12" width="16" height="12"><polygon points="3,1 11,6 3,11"/><polygon points="11,1 19,6 11,11"/></svg>
          </button>
        </div>
        {/* value inline in title; no separate line */}
      </div>

      {/* Confidence */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">Confidence threshold ({confSafe.toFixed(2)})</div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={()=>adjustConf(-stepLarge)} title="conf -0.05">
            <svg viewBox="0 0 20 12" width="16" height="12"><polygon points="9,6 17,1 17,11"/><polygon points="1,6 9,1 9,11"/></svg>
          </button>
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={()=>adjustConf(-stepSmall)} title="conf -0.01">
            <svg viewBox="0 0 12 12" width="12" height="12" style={{transform:'scaleX(-1)'}}><polygon points="2,1 10,6 2,11"/></svg>
          </button>
          <input
            type="range" min={0} max={1} step={0.01}
            value={confSafe}
            onChange={e=>setConf(clamp01(parseFloat(e.currentTarget.value)))}
            className="flex-1"
          />
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={()=>adjustConf(+stepSmall)} title="conf +0.01">
            <svg viewBox="0 0 12 12" width="12" height="12"><polygon points="2,1 10,6 2,11"/></svg>
          </button>
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={()=>adjustConf(+stepLarge)} title="conf +0.05">
            <svg viewBox="0 0 20 12" width="16" height="12"><polygon points="3,1 11,6 3,11"/><polygon points="11,1 19,6 11,11"/></svg>
          </button>
        </div>
        {/* value inline in title; no separate line */}
      </div>

      {/* MOTA (Backend via WebSocket with overrides) */}
      <div className="space-y-1">
        <div className="text-sm font-semibold">MOTA</div>
        <div className="text-2xl font-mono">{typeof mota === 'number' ? mota.toFixed(4) : '—'}</div>
        <div className="text-xs text-neutral-600 font-mono">
          TP:{detail.tp ?? '—'} / FP:{detail.fp ?? '—'} / FN:{detail.fn ?? '—'} / IDSW:{detail.idsw ?? '—'}
        </div>
        {detail.error && <div className="text-xs text-red-500 break-words">{detail.error}</div>}
      </div>
    </aside>
  )
}
