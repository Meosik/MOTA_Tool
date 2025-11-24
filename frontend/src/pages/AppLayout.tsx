import { useEffect } from 'react'
import LeftPanel from '../components/LeftNav'
import OverlayCanvas from '../components/OverlayCanvas'
import RightPanel from '../components/RightPanel'
import ExportModal from '../components/ExportModal'
import useFrameStore from '../store/frameStore'
import BottomHud from '../components/BottomHud'
import CollapseBoundaryToggle from '../components/CollapseBoundaryToggle'
import { useUIStore } from '../store/uiStore'

function KeyboardShortcuts() {
  const undo = useFrameStore(s => s.undo)
  const redo = useFrameStore(s => s.redo)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mac = navigator.platform.toLowerCase().includes('mac')
      const mod = mac ? e.metaKey : e.ctrlKey
      if (!mod) return
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  return null
}

export default function AppLayout() {
  const motaLeftCollapsed = useUIStore(s=>s.motaLeftCollapsed)
  const setMotaLeftCollapsed = useUIStore(s=>s.setMotaLeftCollapsed)
  const leftWidthPx = 256; // 16rem
  return (
    <div className="w-screen h-screen flex flex-col bg-white relative">
      {/* TopBar는 상위 컴포넌트에서만 렌더합니다! */}
      <div className={`flex-1 min-h-0 ${motaLeftCollapsed ? 'grid grid-cols-[1fr_20rem]' : 'grid grid-cols-[16rem_1fr_20rem]'} transition-[grid-template-columns] duration-200`}>
        {!motaLeftCollapsed && <LeftPanel />}
        <div className="min-h-0 min-w-0 relative">
          {/* 패널 접힘 상태가 바뀔 때마다 OverlayCanvas를 remount하여 layout 강제 갱신 */}
          <OverlayCanvas key={motaLeftCollapsed ? 'collapsed' : 'expanded'} />
          <BottomHud />
          <CollapseBoundaryToggle
            collapsed={motaLeftCollapsed}
            onToggle={()=> setMotaLeftCollapsed(!motaLeftCollapsed)}
            expandedOffsetPx={leftWidthPx}
          />
        </div>
        <RightPanel />
      </div>
      <KeyboardShortcuts />
      <ExportModal />
    </div>
  )
}