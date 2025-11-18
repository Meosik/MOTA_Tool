import React, { useState } from 'react'
import { useMapMetrics } from '../../hooks/mapApi'
import { useMapStore } from '../../store/mapStore'

interface MapControlPanelProps {
  projectId: string;
  annotationId: string | null;
  gtId?: string | null;
  predId?: string | null;
}

export default function MapControlPanel({ projectId, annotationId, gtId, predId }: MapControlPanelProps) {
  const [conf, setConf] = useState(0.0)
  const [iou, setIou] = useState(0.5)
  
  // Use gtId/predId if provided, fallback to projectId/annotationId
  const effectiveGtId = gtId || projectId
  const effectivePredId = predId || annotationId
  
  const { data, isLoading, error } = useMapMetrics(effectiveGtId, effectivePredId!, conf, iou)

  // Slider adjustment utilities (matching MOTA RightPanel)
  const stepSmall = 0.01
  const stepLarge = 0.05
  const round2 = (v: number) => Math.round(v * 100) / 100
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
  const adjustIou = (d: number) => setIou(clamp01(round2(iou + d)))
  const adjustConf = (d: number) => setConf(clamp01(round2(conf + d)))

  return (
    <aside className="w-80 shrink-0 border-l border-neutral-200 p-3 flex flex-col gap-4">
      {/* Info message */}
      <div className="text-sm text-neutral-500">
        💡 TopBar에서 이미지 폴더, GT, Predictions를 업로드하고 내보내기를 할 수 있습니다.
      </div>

      {/* IoU Threshold */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">IoU Threshold</div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustIou(-stepLarge)} title="IoU -0.05">
            <svg viewBox="0 0 20 12" width="16" height="12"><polygon points="9,6 17,1 17,11"/><polygon points="1,6 9,1 9,11"/></svg>
          </button>
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustIou(-stepSmall)} title="IoU -0.01">
            <svg viewBox="0 0 12 12" width="12" height="12" style={{ transform: 'scaleX(-1)' }}><polygon points="2,1 10,6 2,11"/></svg>
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={iou}
            onChange={e => setIou(clamp01(parseFloat(e.currentTarget.value)))}
            className="flex-1"
          />
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustIou(+stepSmall)} title="IoU +0.01">
            <svg viewBox="0 0 12 12" width="12" height="12"><polygon points="2,1 10,6 2,11"/></svg>
          </button>
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustIou(+stepLarge)} title="IoU +0.05">
            <svg viewBox="0 0 20 12" width="16" height="12"><polygon points="3,1 11,6 3,11"/><polygon points="11,1 19,6 11,11"/></svg>
          </button>
        </div>
        <div className="text-xs text-neutral-600 font-mono">IoU = {iou.toFixed(2)}</div>
      </div>

      {/* Confidence Threshold */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">Confidence Threshold</div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustConf(-stepLarge)} title="conf -0.05">
            <svg viewBox="0 0 20 12" width="16" height="12"><polygon points="9,6 17,1 17,11"/><polygon points="1,6 9,1 9,11"/></svg>
          </button>
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustConf(-stepSmall)} title="conf -0.01">
            <svg viewBox="0 0 12 12" width="12" height="12" style={{ transform: 'scaleX(-1)' }}><polygon points="2,1 10,6 2,11"/></svg>
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={conf}
            onChange={e => setConf(clamp01(parseFloat(e.currentTarget.value)))}
            className="flex-1"
          />
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustConf(+stepSmall)} title="conf +0.01">
            <svg viewBox="0 0 12 12" width="12" height="12"><polygon points="2,1 10,6 2,11"/></svg>
          </button>
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustConf(+stepLarge)} title="conf +0.05">
            <svg viewBox="0 0 20 12" width="16" height="12"><polygon points="3,1 11,6 3,11"/><polygon points="11,1 19,6 11,11"/></svg>
          </button>
        </div>
        <div className="text-xs text-neutral-600 font-mono">conf ≥ {conf.toFixed(2)}</div>
      </div>

      {/* Metrics Display */}
      <div className="space-y-1">
        <div className="text-sm font-semibold">Metrics</div>
        
        {error && (
          <div className="text-xs text-red-500">Error loading metrics</div>
        )}
        
        {isLoading ? (
          <div className="text-xs text-neutral-600">Loading metrics...</div>
        ) : data ? (
          <>
            <div className="text-2xl font-mono">{typeof data.mAP === 'number' ? (data.mAP * 100).toFixed(2) + '%' : '—'}</div>
            <div className="text-xs text-neutral-600">Mean Average Precision</div>

            {data.class_aps && typeof data.class_aps === 'object' && Object.keys(data.class_aps).length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="text-sm font-semibold">Per-Class AP</div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {Object.entries(data.class_aps).map(([cls, ap]) => (
                    <div key={cls} className="flex justify-between items-center text-xs">
                      <span className="text-neutral-700">{cls}</span>
                      <span className="font-mono text-neutral-600">
                        {((ap as number) * 100).toFixed(2)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.num_categories !== undefined && (
              <div className="text-xs text-neutral-600 mt-2">
                Categories: {data.num_categories} | Images: {data.num_images || 'N/A'}
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-neutral-600">No metrics available. Upload GT and Predictions to calculate.</div>
        )}
      </div>
    </aside>
  )
}