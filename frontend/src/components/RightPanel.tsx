import React, { useEffect, useMemo, useRef, useState } from 'react';
import useFrameStore from '../store/frameStore';
import { PreviewWS } from '../lib/ws';

export default function RightPanel(){
  const {
    gtId, predId, editedPredId,
    iou, setIou,
    conf, setConf,
  } = useFrameStore() as any;

  const iouSafe  = useMemo(() => (Number.isFinite(iou)  ? iou  : 0.5), [iou]);
  const confSafe = useMemo(() => (Number.isFinite(conf) ? conf : 0.0), [conf]);

  const wsRef = useRef<PreviewWS | null>(null);
  const [wsState, setWsState] = useState<'idle'|'connecting'|'open'|'close'|'error'>('idle');
  const [mota, setMota] = useState<number|undefined>();
  const [detail, setDetail] = useState<{tp?:number;fp?:number;fn?:number;idsw?:number;error?:string}>({});

  useEffect(() => {
    if (!wsRef.current) wsRef.current = new PreviewWS();
    const ws = wsRef.current;

    const gid = gtId;
    const pid = editedPredId || predId;

    if (gid && pid){
      ws.connect((msg) => {
        if (typeof msg.mota === 'number') setMota(msg.mota);
        setDetail({ tp:msg.tp, fp:msg.fp, fn:msg.fn, idsw:msg.idsw, error:msg.error });
      }, setWsState);
      ws.sendPreview({ gt_id: gid, pred_id: pid, iou: iouSafe });
    } else {
      ws.close();
      setWsState('idle');
      setMota(undefined);
      setDetail({});
    }
  }, [gtId, predId, editedPredId, iouSafe]);

  const stepSmall = 0.01;
  const stepLarge = 0.05;
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  const adjustIou  = (delta: number) => setIou(clamp01(round2(iouSafe  + delta)));
  const adjustConf = (delta: number) => setConf(clamp01(round2(confSafe + delta)));

  return (
    <aside className="w-80 shrink-0 border-l border-neutral-200 p-3 flex flex-col gap-4">
      <div className="text-sm text-neutral-500">WS: <span className="font-mono">{wsState}</span></div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">IoU Threshold</div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustIou(-stepLarge)} aria-label="IoU -0.05" title="IoU -0.05">
            <svg viewBox="0 0 20 12" width="16" height="12">
              <polygon points="9,6 17,1 17,11" />
              <polygon points="1,6 9,1 9,11" />
            </svg>
          </button>
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustIou(-stepSmall)} aria-label="IoU -0.01" title="IoU -0.01">
            <svg viewBox="0 0 12 12" width="12" height="12" style={{ transform: 'scaleX(-1)' }}>
              <polygon points="2,1 10,6 2,11" />
            </svg>
          </button>
          <input type="range" min={0} max={1} step={0.01} value={iouSafe} onChange={(e)=> setIou(clamp01(parseFloat(e.currentTarget.value)))} className="flex-1" />
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustIou(+stepSmall)} aria-label="IoU +0.01" title="IoU +0.01">
            <svg viewBox="0 0 12 12" width="12" height="12">
              <polygon points="2,1 10,6 2,11" />
            </svg>
          </button>
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustIou(+stepLarge)} aria-label="IoU +0.05" title="IoU +0.05">
            <svg viewBox="0 0 20 12" width="16" height="12">
              <polygon points="3,1 11,6 3,11" />
              <polygon points="11,1 19,6 11,11" />
            </svg>
          </button>
        </div>
        <div className="text-xs text-neutral-600 font-mono">IoU = {iouSafe.toFixed(2)}</div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">Confidence Threshold</div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustConf(-stepLarge)} aria-label="conf -0.05" title="conf -0.05">
            <svg viewBox="0 0 20 12" width="16" height="12">
              <polygon points="9,6 17,1 17,11" />
              <polygon points="1,6 9,1 9,11" />
            </svg>
          </button>
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustConf(-stepSmall)} aria-label="conf -0.01" title="conf -0.01">
            <svg viewBox="0 0 12 12" width="12" height="12" style={{ transform: 'scaleX(-1)' }}>
              <polygon points="2,1 10,6 2,11" />
            </svg>
          </button>
          <input type="range" min={0} max={1} step={0.01} value={confSafe} onChange={(e)=> setConf(clamp01(parseFloat(e.currentTarget.value)))} className="flex-1" />
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustConf(+stepSmall)} aria-label="conf +0.01" title="conf +0.01">
            <svg viewBox="0 0 12 12" width="12" height="12">
              <polygon points="2,1 10,6 2,11" />
            </svg>
          </button>
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustConf(+stepLarge)} aria-label="conf +0.05" title="conf +0.05">
            <svg viewBox="0 0 20 12" width="16" height="12">
              <polygon points="3,1 11,6 3,11" />
              <polygon points="11,1 19,6 11,11" />
            </svg>
          </button>
        </div>
        <div className="text-xs text-neutral-600 font-mono">conf ≥ {confSafe.toFixed(2)}</div>
      </div>

      <div className="space-y-1">
        <div className="text-sm font-semibold">MOTA</div>
        <div className="text-2xl font-mono">{typeof mota === 'number' ? mota.toFixed(4) : '—'}</div>
        <div className="text-xs text-neutral-600 font-mono">
          TP:{detail.tp ?? '—'} / FP:{detail.fp ?? '—'} / FN:{detail.fn ?? '—'} / IDSW:{detail.idsw ?? '—'}
        </div>
        {detail.error && <div className="text-xs text-red-500 break-words">{detail.error}</div>}
      </div>
    </aside>
  );
}
