// frontend/src/components/LeftPanel.tsx
import { useMemo, useState } from 'react'
import useFrameStore from '../store/frameStore'

const PAGE = 10

export default function LeftPanel(){
  const { frames, idswFrames, setCur, scanIdSwitches } = useFrameStore(s=>({
    frames: s.frames,
    idswFrames: s.idswFrames,
    setCur: s.setCur,
    scanIdSwitches: s.scanIdSwitches,
  }))

  const [page, setPage] = useState(0)
  const totalPages = Math.max(1, Math.ceil(idswFrames.length / PAGE))
  const curPage = Math.min(page, totalPages - 1)

  const pageItems = useMemo(()=>{
    const start = curPage * PAGE
    return idswFrames.slice(start, start + PAGE)
  }, [idswFrames, curPage])

  return (
    <aside className="w-64 border-r bg-white flex flex-col">
      <div className="p-2 border-b flex items-center gap-2">
        <div className="font-semibold text-sm">ID Switch</div>
        <button
          onClick={scanIdSwitches}
          className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
          title="GT/PRED을 IoU 기준으로 매칭해 IDSW가 발생한 프레임을 찾습니다."
        >
          스캔
        </button>
        <div className="ml-auto text-xs text-gray-500">
          {idswFrames.length}개
        </div>
      </div>

      {/* Pager */}
      <div className="p-2 border-b flex items-center justify-between text-xs">
        <button
          className="px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-50"
          onClick={()=> setPage(p=> Math.max(0, p-1))}
          disabled={curPage<=0}
        >Prev</button>
        <div className="font-mono">{curPage+1} / {totalPages}</div>
        <button
          className="px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-50"
          onClick={()=> setPage(p=> Math.min(totalPages-1, p+1))}
          disabled={curPage>=totalPages-1}
        >Next</button>
      </div>

      {/* List (max 10 / page) */}
      <div className="p-2 overflow-auto space-y-2">
        {pageItems.length === 0 && (
          <div className="text-xs text-gray-500">IDSW 프레임이 없습니다. 스캔을 눌러 탐색하세요.</div>
        )}
        {pageItems.map(fi => {
          const idx = frames.findIndex(f=>f.i===fi)
          const url = idx>=0 ? frames[idx].url : undefined
          return (
            <button
              key={fi}
              className="w-full flex items-center gap-2 text-left hover:bg-gray-50 p-1 rounded border"
              onClick={()=> { if (idx>=0) useFrameStore.getState().setCur(idx) }}
              title={`프레임 ${fi}로 이동`}
            >
              {url ? (
                <img src={url} className="w-16 h-10 object-cover rounded" />
              ) : (
                <div className="w-16 h-10 bg-gray-200 rounded" />
              )}
              <div className="text-xs">
                <div className="font-medium">Frame {fi}</div>
                <div className="text-gray-500">클릭하여 이동</div>
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
