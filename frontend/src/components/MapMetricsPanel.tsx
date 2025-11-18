/**
 * Map Metrics Panel Component
 * Displays mAP (mean Average Precision) and per-class AP values
 */
import React, { useEffect } from 'react';
import useMapStore from '../store/mapStore';
import useFrameStore from '../store/frameStore';

interface MapMetricsPanelProps {
  className?: string;
}

export default function MapMetricsPanel({ className = '' }: MapMetricsPanelProps) {
  const isMapMode = useMapStore(s => s.isMapMode);
  const mapMetrics = useMapStore(s => s.mapMetrics);
  const categories = useMapStore(s => s.categories);
  const isCalculating = useMapStore(s => s.isCalculating);
  const error = useMapStore(s => s.error);
  const calculateCurrentMap = useMapStore(s => s.calculateCurrentMap);

  // Get current thresholds from frame store
  const iouThr = useFrameStore(s => s.iou);
  const confThr = useFrameStore(s => s.conf);

  // Auto-calculate when thresholds change
  useEffect(() => {
    if (isMapMode) {
      calculateCurrentMap(iouThr, confThr);
    }
  }, [isMapMode, iouThr, confThr]);

  if (!isMapMode) {
    return null;
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm p-4 ${className}`}>
      <h3 className="text-lg font-semibold mb-3 text-gray-800">
        mAP Metrics
      </h3>

      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {isCalculating && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Calculating mAP...</span>
        </div>
      )}

      {!isCalculating && mapMetrics && (
        <>
          {/* Overall mAP */}
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Mean Average Precision</div>
            <div className="text-3xl font-bold text-blue-600">
              {(mapMetrics.mean_ap * 100).toFixed(2)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              IoU: {mapMetrics.iou_threshold.toFixed(2)} | 
              Conf: {mapMetrics.confidence_threshold.toFixed(2)}
            </div>
          </div>

          {/* Per-class AP */}
          <div>
            <div className="text-sm font-medium text-gray-700 mb-2">
              Per-Class AP ({mapMetrics.num_classes} classes)
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {Object.entries(mapMetrics.class_aps).length === 0 ? (
                <div className="text-sm text-gray-500 italic py-2">
                  No class data available
                </div>
              ) : (
                Object.entries(mapMetrics.class_aps)
                  .sort(([, a], [, b]) => b - a) // Sort by AP descending
                  .map(([catIdStr, ap]) => {
                    const catId = parseInt(catIdStr);
                    const category = categories[catId];
                    const categoryName = category?.name || `Class ${catId}`;
                    const apPercent = (ap * 100).toFixed(2);

                    return (
                      <div
                        key={catId}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
                      >
                        <span className="text-sm font-medium text-gray-700 flex-1">
                          {categoryName}
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-blue-500 h-full rounded-full transition-all"
                              style={{ width: `${Math.min(100, ap * 100)}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold text-gray-800 w-12 text-right">
                            {apPercent}%
                          </span>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </>
      )}

      {!isCalculating && !mapMetrics && !error && (
        <div className="text-center py-8 text-gray-500 text-sm">
          <p>Load GT and predictions to calculate mAP</p>
        </div>
      )}
    </div>
  );
}
