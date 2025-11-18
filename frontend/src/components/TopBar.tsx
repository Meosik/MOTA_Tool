import useFrameStore from '../store/frameStore'
import { useMapStore } from '../store/mapStore'
import { FolderOpen, Upload, Download, RotateCcw, RotateCw, Eraser } from 'lucide-react'
import { useMode } from '../context/ModeContext'
import { useMapContext } from './map/MapContext'

function useMapModeHandlers(mode: 'MOTA' | 'MAP') {
  if (mode === 'MAP') {
    const openMapFolderStore = useMapStore(s => s.openMapFolder);
    const openMapGTStore = useMapStore(s => s.openMapGT);
    const openMapPredStore = useMapStore(s => s.openMapPred);
    const exportMapPred = useMapStore(s => s.exportMapPred);
    const undoMap = useMapStore(s => s.undo);
    const redoMap = useMapStore(s => s.redo);
    const resetMap = useMapStore(s => s.reset);
    const { setImageId, setFolderId, setGtId, setPredId } = useMapContext();
    const openMapFolder = () => openMapFolderStore(id => {
      setFolderId(id);
      setImageId(1); // Select first image
    });
    const openMapGT = () => openMapGTStore(id => {
      setGtId(id);
    });
    const openMapPred = () => openMapPredStore(id => {
      setPredId(id);
    });
    return { openMapFolder, openMapGT, openMapPred, exportMapPred, undoMap, redoMap, resetMap };
  } else {
    // MOTA 모드에서는 더미 핸들러 반환
    const dummy = () => {};
    return {
      openMapFolder: dummy,
      openMapGT: dummy,
      openMapPred: dummy,
      exportMapPred: dummy,
      undoMap: dummy,
      redoMap: dummy,
      resetMap: dummy,
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
    openMapFolder, openMapGT, openMapPred, exportMapPred,
    undoMap, redoMap, resetMap
  } = useMapModeHandlers(mode);

  // 모드별로 모든 핸들러 분기
  const handleOpenFolder = mode === 'MOTA' ? openFrameDir      : openMapFolder;
  const handleGTUpload   = mode === 'MOTA' ? openGT            : openMapGT;
  const handlePredUpload = mode === 'MOTA' ? openPred          : openMapPred;
  const handleExport     = mode === 'MOTA' ? exportModifiedPred: exportMapPred;
  const handleUndo       = mode === 'MOTA' ? undo              : undoMap;
  const handleRedo       = mode === 'MOTA' ? redo              : redoMap;
  const handleResetFrame = mode === 'MOTA' ? resetCurrentFrame : resetMap;

  return (
    <div className="h-12 flex items-center gap-2 px-3 border-b bg-white text-sm">
      {/* 좌측: 모드 전환 드롭다운 + 버튼 */}
      <div className="flex items-center gap-2">
        <select
          aria-label="모드 전환"
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
          {mode === 'MOTA' ? '프레임 폴더 열기' : '이미지/COCO 업로드'}
        </button>
        <button
          onClick={handleGTUpload}
          className="px-3 py-1.5 rounded border inline-flex items-center gap-2"
        >
          <Upload size={16} />{' '}
          {mode === 'MOTA' ? 'GT 불러오기' : 'GT 어노테이션'}
        </button>
        <button
          onClick={handlePredUpload}
          className="px-3 py-1.5 rounded border inline-flex items-center gap-2"
        >
          <Upload size={16} />{' '}
          {mode === 'MOTA' ? 'Pred 불러오기' : 'Pred 어노테이션'}
        </button>
      </div>

      <div className="flex-1" />

      {/* 우측: 편집 도구 및 내보내기(모드 관계 없이 항상 표시) */}
      <div className="flex items-center gap-1">
        <button
          className="px-2 py-1.5 rounded border inline-flex items-center gap-1"
          onClick={handleUndo}
          title="실행 취소 (Ctrl+Z)"
        >
          <RotateCcw size={16} /> Undo
        </button>
        <button
          className="px-2 py-1.5 rounded border inline-flex items-center gap-1"
          onClick={handleRedo}
          title="다시 실행 (Ctrl+Shift+Z)"
        >
          <RotateCw size={16} /> Redo
        </button>
        <button
          className="px-2 py-1.5 rounded border inline-flex items-center gap-1"
          onClick={handleResetFrame}
          title="현재 프레임 수정 리셋"
        >
          <Eraser size={16} /> 프레임 리셋
        </button>
        <button
          className="px-3 py-1.5 rounded border inline-flex items-center gap-2"
          onClick={handleExport}
          title={mode === 'MOTA' ? '수정 포함 전체 내보내기' : '결과 내보내기'}
        >
          <Download size={16} /> 내보내기
        </button>
      </div>
    </div>
  );
}