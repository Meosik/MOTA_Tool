import React, { useState } from 'react'
import { useMapMetrics } from '../../hooks/mapApi'

export default function MapControlPanel({ projectId, imageId }: { projectId: string, imageId: number | null }) {
  const [conf, setConf] = useState(0.5)
  const [iou, setIou] = useState(0.5)
  const { data, isLoading } = useMapMetrics(projectId, imageId!, conf, iou)

  return (
    <aside className="p-4 w-80 border-l flex flex-col gap-6 bg-gray-50 h-full min-h-0">
      <div>
        <span>Confidence: {conf.toFixed(2)}</span>
        <input type="range" min={0} max={1} step={0.01} value={conf} onChange={e => setConf(Number(e.target.value))} />
      </div>
      <div>
        <span>IoU: {iou.toFixed(2)}</span>
        <input type="range" min={0.05} max={0.95} step={0.01} value={iou} onChange={e => setIou(Number(e.target.value))} />
      </div>
      <div>
        <div>mAP: {isLoading ? '...' : (typeof data?.mAP === 'number' ? data.mAP.toFixed(4) : 'N/A')}</div>
        <div>
          {data && typeof data.class_aps === 'object' && data.class_aps !== null && Object.entries(data.class_aps).map(([cls, ap]) =>
            <div key={cls}>{cls}: {(ap as number).toFixed(4)}</div>
          )}
        </div>
      </div>
    </aside>
  )
}