import { useFrameStore } from '../store/frameStore'
import { FolderOpen, Upload, Download } from 'lucide-react'

export default function TopBar(){
  const { openFrameDir, openGT, openPred } = useFrameStore()
  return (
    <div className="h-12 flex items-center gap-2 px-3 border-b bg-white text-sm">
      <button onClick={openFrameDir} className="px-3 py-1.5 rounded bg-brand-600 text-white hover:bg-brand-700 inline-flex items-center gap-2">
        <FolderOpen size={16}/> 프레임 폴더 열기
      </button>
      <button onClick={openGT} className="px-3 py-1.5 rounded border inline-flex items-center gap-2">
        <Upload size={16}/> GT 불러오기
      </button>
      <button onClick={openPred} className="px-3 py-1.5 rounded border inline-flex items-center gap-2">
        <Upload size={16}/> Pred 불러오기
      </button>
      <div className="flex-1" />
      <button className="px-3 py-1.5 rounded border inline-flex items-center gap-2" onClick={()=>alert('내보내기는 추후 연결')}>
        <Download size={16}/> 내보내기
      </button>
    </div>
  )
}

