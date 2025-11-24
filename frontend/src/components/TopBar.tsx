import { useState, useEffect } from 'react'
import DatasetMetricsModal from './map/DatasetMetricsModal'
import useFrameStore from '../store/frameStore'
import { useMapStore } from '../store/mapStore'
import { FolderOpen, Upload, Download, RotateCcw, RotateCw, Eraser } from 'lucide-react'
import { useMapMetrics } from '../hooks/mapApi'
import { useMode } from '../context/ModeContext'
import { useMapContext } from './map/MapContext'

function useMapModeHandlers(mode: 'MOTA' | 'MAP') {
  if (mode === 'MAP') {
    const openMapFolderStore = useMapStore(s => s.openMapFolder);
    const setCurrentImageIndex = useMapStore(s => s.setCurrentImageIndex);
    const openMapGTStore = useMapStore(s => s.openMapGT);
    const openMapPredStore = useMapStore(s => s.openMapPred);
    const exportFilteredPred = useMapStore(s => s.exportFilteredPred);
    const undoMap = useMapStore(s => s.undo);
    const redoMap = useMapStore(s => s.redo);
    const resetMapCurrentFrame = useMapStore(s => s.resetCurrentFrame);
    const { setImageId, setFolderId, setGtId, setPredId } = useMapContext();
    const openMapFolder = () => openMapFolderStore(id => {
      const storeImages = useMapStore.getState().images;
      setFolderId(id);
      
      // Get the first image's ID from the store (images are already loaded)
      const firstImage = storeImages[0];
      if (firstImage) {
        setImageId(firstImage.id); // Select first image by its actual ID
        setCurrentImageIndex(0); // Set store index to 0
      }
    });
    const openMapGT = () => openMapGTStore(id => {
      setGtId(id);
    });
    const openMapPred = () => openMapPredStore(id => {
      setPredId(id);
    });
    return { openMapFolder, openMapGT, openMapPred, exportFilteredPred, undoMap, redoMap, resetMapCurrentFrame };
  } else {
    // MOTA 모드에서는 더미 핸들러 반환
    const dummy = () => {};
    return {
      openMapFolder: dummy,
      openMapGT: dummy,
      openMapPred: dummy,
      exportFilteredPred: dummy,
      undoMap: dummy,
      redoMap: dummy,
      resetMapCurrentFrame: dummy,
    };
  }
}

export default function TopBar() {
  // 기존 MOTA 모드용 상태
  const {
    openFrameDir, openGT, openPred, exportModifiedPred,
    undo, redo, resetCurrentFrame
  } = useFrameStore();
  const { mode, setMode } = useMode();
  // MAP 모드용 핸들러 (mode 전달)
  const {
    openMapFolder, openMapGT, openMapPred, exportFilteredPred,
    undoMap, redoMap, resetMapCurrentFrame
  } = useMapModeHandlers(mode);

  // 모드별로 모든 핸들러 분기
  const handleOpenFolder = mode === 'MOTA' ? openFrameDir      : openMapFolder;
  const handleGTUpload   = mode === 'MOTA' ? openGT            : openMapGT;
  const handlePredUpload = mode === 'MOTA' ? openPred          : openMapPred;
  const handleExport     = mode === 'MOTA' ? exportModifiedPred: exportFilteredPred;
  const handleUndo       = mode === 'MOTA' ? undo              : undoMap;
  const handleRedo       = mode === 'MOTA' ? redo              : redoMap;
  const handleResetFrame = mode === 'MOTA' ? resetCurrentFrame : resetMapCurrentFrame;

  // MAP overall mAP metrics (button relocated from control panel)
  const gtAnnId = useMapStore(s => s.gtAnnotationId);
  const predAnnId = useMapStore(s => s.predAnnotationId);
  const iou = useMapStore(s => s.iou);
  const conf = useMapStore(s => s.conf);
  const gtAnnotations = useMapStore(s => s.gtAnnotations);
  const predAnnotations = useMapStore(s => s.predAnnotations);
  const [triggerOverall, setTriggerOverall] = useState(false);
  const [snapshot, setSnapshot] = useState<null | { gt:any[]; pred:any[]; iou:number; conf:number }>(null);
  const [showDatasetModal, setShowDatasetModal] = useState(false);
  const { data: overallData, isLoading: overallLoading, error: overallError, refetch: refetchOverall } = useMapMetrics(
    gtAnnId || '',
    predAnnId || '',
    snapshot?.conf ?? 0,
    snapshot?.iou ?? 0,
    triggerOverall && snapshot != null
  );

  const handleOverallMap = () => {
    if (!gtAnnId || !predAnnId) return;
    // Capture snapshot of annotations & thresholds at click time
    setSnapshot({
      gt: [...gtAnnotations],
      pred: [...predAnnotations],
      iou,
      conf
    });
    setTriggerOverall(true);
    setShowDatasetModal(true); // open modal immediately showing loading pulse
    // refetch will use snapshot thresholds (set in same tick via state updater flush)
    setTimeout(() => refetchOverall(), 0);
  };

  // After first successful fetch, disable further auto refetching even if sliders change
  useEffect(() => {
    if (overallData && triggerOverall) {
      setTriggerOverall(false);
    }
  }, [overallData, triggerOverall]);

  return (
    <div className="h-12 flex items-center gap-2 px-3 border-b bg-white text-sm">
      {/* Left: mode switch dropdown + buttons */}
      <div className="flex items-center gap-2">
        <select
          aria-label="Switch mode"
          value={mode}
          onChange={e => setMode(e.target.value as 'MOTA' | 'MAP')}
          className="px-2 py-1.5 rounded border bg-white text-brand-700 font-bold"
          style={{ minWidth: 78 }}
        >
          <option value="MOTA">MOTA</option>
          <option value="MAP">MAP</option>
        </select>
        <button
          onClick={handleOpenFolder}
          className="px-3 py-1.5 rounded bg-brand-600 text-white hover:bg-brand-700 inline-flex items-center gap-2"
        >
          <FolderOpen size={16} />{' '}
          {mode === 'MOTA' ? 'Open Frame Folder' : 'Upload Images/COCO'}
        </button>
        <button
          onClick={handleGTUpload}
          className="px-3 py-1.5 rounded border inline-flex items-center gap-2"
        >
          <Upload size={16} />{' '}
          {mode === 'MOTA' ? 'Load GT' : 'GT Annotations'}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePredUpload}
            className="px-3 py-1.5 rounded border inline-flex items-center gap-2"
          >
            <Upload size={16} />{' '}
            {mode === 'MOTA' ? 'Load Pred' : 'Pred Annotations'}
          </button>
          {mode === 'MAP' && (
            <button
              onClick={handleOverallMap}
              disabled={!gtAnnId || !predAnnId || overallLoading}
              className="px-3 py-1.5 rounded bg-brand-600 text-white hover:bg-brand-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-xs"
              title="Compute overall dataset mAP"
            >
              {overallLoading ? 'Computing mAP...' : 'Overall mAP'}
            </button>
          )}
          {mode === 'MAP' && overallData && typeof overallData.mAP === 'number' && (
            <div className="text-xs font-mono text-neutral-700 ml-1" title="Mean Average Precision">
              {(overallData.mAP * 100).toFixed(2)}%
            </div>
          )}
        </div>
      </div>

      <div className="ml-4 flex items-center gap-3 text-xs">
        {/* 색상 레전드 (모드별) */}
        {mode === 'MOTA' && (
          <>
            <LegendItem label="GT"   color="rgba(80,220,120,0.95)" />
            <LegendItem label="TP"   color="rgba(255,140,0,0.95)" />
            <LegendItem label="FP"   color="rgba(255,0,80,0.95)" />
            <LegendItem label="IDSW" color="rgba(120,0,255,0.95)" />
          </>
        )}
        {mode === 'MAP' && (
          <>
            <LegendItem label="GT" color="rgba(80,220,120,0.95)" />
            <LegendItem label="TP" color="rgba(255,140,0,0.95)" />
            <LegendItem label="FP" color="rgba(255,0,80,0.95)" />
          </>
        )}
      </div>
      <div className="flex-1" />

      {/* Right: editing tools & export (shown in all modes) */}
      <div className="flex items-center gap-1">
        <button
          className="px-2 py-1.5 rounded border inline-flex items-center gap-1"
          onClick={handleUndo}
          title="Undo (Ctrl+Z)"
        >
          <RotateCcw size={16} /> Undo
        </button>
        <button
          className="px-2 py-1.5 rounded border inline-flex items-center gap-1"
          onClick={handleRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          <RotateCw size={16} /> Redo
        </button>
        <button
          className="px-2 py-1.5 rounded border inline-flex items-center gap-1"
          onClick={handleResetFrame}
          title="Reset current frame edits"
        >
          <Eraser size={16} /> Reset Frame
        </button>
        <button
          className="px-3 py-1.5 rounded border inline-flex items-center gap-2"
          onClick={handleExport}
          title={mode === 'MOTA' ? 'Export with edits' : 'Export results'}
        >
          <Download size={16} /> Export
        </button>
      </div>
      {/* Dataset metrics modal */}
      {mode === 'MAP' && (
        <DatasetMetricsModal
          open={showDatasetModal}
          onClose={()=> setShowDatasetModal(false)}
          overallLoading={overallLoading}
          overallMap={overallData?.mAP ?? null}
          snapshotGt={snapshot?.gt ?? []}
          snapshotPred={snapshot?.pred ?? []}
          snapshotIou={snapshot?.iou ?? 0}
          snapshotConf={snapshot?.conf ?? 0}
        />
      )}
    </div>
  );
}

function LegendItem({ label, color }: { label:string; color:string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="inline-block w-3 h-3 rounded-full" style={{ background: color }} />
      <span className="text-[11px] font-medium" style={{ color }}>{label}</span>
    </div>
  );
}
