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

  return (
    <aside className="h-full min-h-0 w-80 border-l bg-white flex flex-col gap-6 p-4 font-sans text-[15px] shadow-sm overflow-y-auto">
      {/* Info message */}
      <div className="text-xs text-gray-500 bg-blue-50 p-3 rounded">
        💡 TopBar에서 이미지 폴더, GT, Predictions를 업로드하고 내보내기를 할 수 있습니다.
      </div>

      {/* Threshold Controls */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="font-semibold text-brand-700 flex justify-between items-center mb-1">
            <span>Confidence Threshold</span>
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
            <span>IoU Threshold</span>
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
      </div>

      {/* Metrics Display */}
      <div className="flex flex-col gap-3 mt-2 border-t pt-4">
        <h3 className="font-bold text-brand-700">Metrics</h3>
        
        {error && (
          <div className="text-red-500 text-sm">Error loading metrics</div>
        )}
        
        {isLoading ? (
          <div className="text-gray-400 text-sm">Loading metrics...</div>
        ) : data ? (
          <>
            <div className="bg-brand-50 p-3 rounded">
              <div className="text-sm text-gray-600">Mean Average Precision</div>
              <div className="text-2xl font-bold text-brand-700 font-mono">
                {typeof data.mAP === 'number' ? (data.mAP * 100).toFixed(2) + '%' : 'N/A'}
              </div>
            </div>

            {data.class_aps && typeof data.class_aps === 'object' && Object.keys(data.class_aps).length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-sm font-semibold text-gray-700">Per-Class AP</div>
                <div className="max-h-64 overflow-y-auto">
                  {Object.entries(data.class_aps).map(([cls, ap]) => (
                    <div key={cls} className="flex justify-between items-center py-1 px-2 hover:bg-gray-50 rounded">
                      <span className="text-sm text-gray-700">{cls}</span>
                      <span className="text-sm font-mono text-brand-600">
                        {((ap as number) * 100).toFixed(2)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.num_categories !== undefined && (
              <div className="text-xs text-gray-500 mt-2">
                Categories: {data.num_categories} | Images: {data.num_images || 'N/A'}
              </div>
            )}
          </>
        ) : (
          <div className="text-gray-400 text-sm">No metrics available. Upload GT and Predictions to calculate.</div>
        )}
      </div>
    </aside>
  )
}