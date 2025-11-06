import { useEffect, useRef, useState } from 'react'
import { useFrameStore } from '../store/frameStore'
import { PreviewWS } from '../lib/ws'

export default function RightPanel(){
  const {
    mode, setMode,
    iou, setIou,
    showGT, showPred, toggleGT, togglePred,
    gtId, predId, editedPredId, dirty, syncEditedPredDebounced
  } = useFrameStore() as any

  const [mota, setMota] = useState<number|null>(null)
  const wsRef = useRef<PreviewWS|null>(null)

  // iou가 비정상(undefined/NaN)일 때 0.5로 보정
  useEffect(() => {
    if (typeof iou !== 'number' || Number.isNaN(iou)) {
      setIou(0.5);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(()=>{
    if (mode !== 'server-ws') { wsRef.current?.close(); wsRef.current = null; setMota(null); return }
    if (!gtId) return
    const host = import.meta.env.VITE_WS_BASE || '127.0.0.1:8000'
    const wsURL = (location.protocol==='https:'?'wss://':'ws://') + host + '/ws/preview'
    const ws = new PreviewWS(wsURL)
    ws.connect((msg:any)=>{
      if ('MOTA' in msg) setMota(Number(msg.MOTA))
    })
    wsRef.current = ws
    return ()=> { ws.close(); wsRef.current=null }
  }, [mode, gtId])

  useEffect(()=>{
    if (mode !== 'server-ws') return
    if (!gtId) return
    if (dirty) { syncEditedPredDebounced() }
    const usePred = editedPredId || predId
    if (!usePred) return
    wsRef.current?.sendPreview({
      gt_annotation_id: gtId,
      pred_annotation_id: usePred,
      iou_threshold: iou
    })
  }, [mode, iou, editedPredId, predId, gtId, dirty, syncEditedPredDebounced])

  return (
    <div className="p-3 text-sm space-y-4">
      <section>
        <div className="font-semibold mb-1">동작 모드</div>
        <label><input type="radio" checked={mode==='local'} onChange={()=>setMode('local')}/> 로컬</label><br/>
        <label><input type="radio" checked={mode==='server-tracks'} onChange={()=>setMode('server-tracks')}/> /tracks</label><br/>
        <label><input type="radio" checked={mode==='server-ws'} onChange={()=>setMode('server-ws')}/> WS(MOTA)</label>
      </section>

      <section>
        <div className="font-semibold mb-1">IoU 임계값</div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.05}
            value={Number.isFinite(iou) ? iou : 0.5}
            onChange={(e) => setIou(parseFloat(e.target.value))}
            className="w-full"
          />
          <span className="w-12 text-right">
            {Number.isFinite(iou) ? iou.toFixed(2) : '0.50'}
          </span>
        </div>
        {mode === 'server-ws' && (
          <div className="mt-2 text-gray-800">MOTA: {mota == null ? '-' : mota.toFixed(4)}</div>
        )}
      </section>

      <section>
        <div className="font-semibold mb-1">가시성</div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={showGT} onChange={toggleGT}/> GT</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={showPred} onChange={togglePred}/> Pred</label>
      </section>
    </div>
  )
}
