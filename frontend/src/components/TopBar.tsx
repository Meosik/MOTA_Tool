// frontend/src/components/TopBar.tsx
import { useFrameStore } from '../store/frameStore'
import useMapStore from '../store/mapStore'
import { FolderOpen, Upload, Download, RotateCcw, RotateCw, Eraser, Activity, Target } from 'lucide-react'

export default function TopBar(){
  const { openFrameDir, openGT, openPred, exportModifiedPred, undo, redo, resetCurrentFrame } = useFrameStore()
  const { isMapMode, setMapMode } = useMapStore()

  return (
    <div className="h-12 flex items-center gap-2 px-3 border-b bg-white text-sm">
      {/* 좌측: 기존 3버튼 유지 */}
      <button onClick={openFrameDir} className="px-3 py-1.5 rounded bg-brand-600 text-white hover:bg-brand-700 inline-flex items-center gap-2">
        <FolderOpen size={16}/> 프레임 폴더 열기
      </button>
      <button onClick={openGT} className="px-3 py-1.5 rounded border inline-flex items-center gap-2">
        <Upload size={16}/> GT 불러오기
      </button>
      <button onClick={openPred} className="px-3 py-1.5 rounded border inline-flex items-center gap-2">
        <Upload size={16}/> Pred 불러오기
      </button>

      {/* Mode Toggle */}
      <div className="flex items-center gap-1 ml-4 border-l pl-4">
        <button
          onClick={() => setMapMode(false)}
          className={`px-3 py-1.5 rounded inline-flex items-center gap-2 transition-colors ${
            !isMapMode 
              ? 'bg-blue-100 text-blue-700 border border-blue-300' 
              : 'border hover:bg-gray-50'
          }`}
        >
          <Activity size={16}/> MOTA Mode
        </button>
        <button
          onClick={() => setMapMode(true)}
          className={`px-3 py-1.5 rounded inline-flex items-center gap-2 transition-colors ${
            isMapMode 
              ? 'bg-green-100 text-green-700 border border-green-300' 
              : 'border hover:bg-gray-50'
          }`}
        >
          <Target size={16}/> mAP Mode
        </button>
      </div>

      <div className="flex-1" />

      {/* 우측: 편집 도구들 (일관된 톤) */}
      <div className="flex items-center gap-1">
        <button
          className="px-2 py-1.5 rounded border inline-flex items-center gap-1"
          onClick={undo}
          title="실행 취소 (Ctrl+Z)"
        >
          <RotateCcw size={16}/> Undo
        </button>
        <button
          className="px-2 py-1.5 rounded border inline-flex items-center gap-1"
          onClick={redo}
          title="다시 실행 (Ctrl+Shift+Z)"
        >
          <RotateCw size={16}/> Redo
        </button>
        <button
          className="px-2 py-1.5 rounded border inline-flex items-center gap-1"
          onClick={resetCurrentFrame}
          title="현재 프레임 수정 리셋"
        >
          <Eraser size={16}/> 프레임 리셋
        </button>
        <button
          className="px-3 py-1.5 rounded border inline-flex items-center gap-2"
          onClick={exportModifiedPred}
          title="수정 포함 전체 내보내기"
        >
          <Download size={16}/> 내보내기
        </button>
      </div>
    </div>
  )
}

