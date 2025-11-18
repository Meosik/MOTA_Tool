import React, { useState } from 'react'
import { useMapMetrics } from '../../hooks/mapApi'

export default function MapControlPanel({ projectId, annotationId }: { projectId: string, annotationId: string | null }) {
  const [conf, setConf] = useState(0.5)
  const [iou, setIou] = useState(0.5)
  const { data, isLoading } = useMapMetrics(projectId, annotationId!, conf, iou)

  return (
    <aside className="h-full min-h-0 w-80 border-l bg-white flex flex-col gap-6 p-4 font-sans text-[15px] shadow-sm">
      <div className="flex flex-col gap-1">
        <label className="font-semibold text-brand-700 flex justify-between items-center mb-1">
          <span>Confidence</span>
          <span className="text-xs text-gray-500">{conf.toFixed(2)}</span>
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={conf}
          onChange={e => setConf(Number(e.target.value))}
          className="w-full accent-brand-600 h-2 rounded-lg appearance-none bg-gray-200"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="font-semibold text-brand-700 flex justify-between items-center mb-1">
          <span>IoU</span>
          <span className="text-xs text-gray-500">{iou.toFixed(2)}</span>
        </label>
        <input
          type="range"
          min={0.05}
          max={0.95}
          step={0.01}
          value={iou}
          onChange={e => setIou(Number(e.target.value))}
          className="w-full accent-brand-600 h-2 rounded-lg appearance-none bg-gray-200"
        />
      </div>
      <div className="flex flex-col gap-2 mt-2">
        <div className="font-bold text-brand-700">mAP: <span className="font-mono">{isLoading ? '...' : (typeof data?.mAP === 'number' ? data.mAP.toFixed(4) : 'N/A')}</span></div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
          {data && typeof data.class_aps === 'object' && data.class_aps !== null && Object.entries(data.class_aps).map(([cls, ap]) =>
            <div key={cls} className="flex justify-between"><span>{cls}</span><span className="font-mono">{(ap as number).toFixed(4)}</span></div>
          )}
        </div>
      </div>
    </aside>
  )
}