import { useEffect } from 'react'
import LeftPanel from '../components/LeftNav'
import OverlayCanvas from '../components/OverlayCanvas'
import RightPanel from '../components/RightPanel'
import useFrameStore from '../store/frameStore'
import BottomHud from '../components/BottomHud'

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
  return (
    <div className="w-screen h-screen flex flex-col bg-white">
      {/* TopBar는 상위 컴포넌트에서만 렌더합니다! */}
      <div className="flex-1 grid grid-cols-[16rem_1fr_20rem] min-h-0">
        <LeftPanel />
        <div className="min-h-0 min-w-0">
          <OverlayCanvas />
          <BottomHud />
        </div>
        <RightPanel />
      </div>
      <KeyboardShortcuts />
    </div>
  )
}