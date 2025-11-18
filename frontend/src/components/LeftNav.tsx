// frontend/src/components/LeftPanel.tsx
import { useMemo, useState } from 'react'
import useFrameStore from '../store/frameStore'

const PAGE = 8

type DetailItem = { f: number; tp: number; fp: number; fn: number; idsw: boolean; gt: number; pred: number }

export default function LeftPanel(){
  const { frames, gtAnnotationId, predAnnotationId, iou, conf, setCur } = useFrameStore(s=>({
    frames: s.frames,
    gtAnnotationId: s.gtAnnotationId,
    predAnnotationId: s.predAnnotationId,
    iou: s.iou,
    conf: s.conf,
    setCur: s.setCur,
  }))

  const [idswFrames, setIdswFrames] = useState<number[]>([])
  const [details, setDetails] = useState<DetailItem[]>([])
  const [page, setPage] = useState(0)

  const totalPages = Math.max(1, Math.ceil(idswFrames.length / PAGE))
  const curPage = Math.min(page, totalPages - 1)

  const pageItems = useMemo(()=>{
    const start = curPage * PAGE
    const ids = idswFrames.slice(start, start + PAGE)
    // details에서 해당 프레임만 추출
    const map = new Map(details.map(d => [d.f, d]))
    return ids.map(f => map.get(f) || { f, tp:0, fp:0, fn:0, idsw:true, gt:0, pred:0 })
  }, [idswFrames, details, curPage])

  async function scanServer(){
    setPage(0)
    setIdswFrames([])
    setDetails([])
    if (!gtAnnotationId || !predAnnotationId) return
    try{
      const base = (import.meta as any).env?.VITE_API_BASE || 'http://127.0.0.1:8000'
      const url = `${base.replace(/\/$/,'')}/analysis/idsw_frames?gt_id=${encodeURIComponent(gtAnnotationId)}&pred_id=${encodeURIComponent(predAnnotationId)}&iou=${iou}&conf=${conf}`
      const r = await fetch(url)
      if (!r.ok) throw new Error(await r.text())
      const data = await r.json()
      setIdswFrames(Array.isArray(data.frames) ? data.frames : [])
      setDetails(Array.isArray(data.details) ? data.details : [])
    }catch(e){
      console.warn('scanServer failed', e)
    }
  }

  return (
    <aside className="w-64 border-r bg-white flex flex-col">
      <div className="p-2 border-b flex items-center gap-2">
        <div className="font-semibold text-sm">ID Switch</div>
        <button
          onClick={scanServer}
          className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
          title="서버에서 IDSW 프레임 목록을 계산합니다."
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
        {pageItems.map(item => {
          const idx = frames.findIndex(f=>f.i===item.f)
          const url = idx>=0 ? frames[idx].url : undefined
          return (
            <button
              key={item.f}
              className="w-full flex items-center gap-2 text-left hover:bg-gray-50 p-1 rounded border"
              onClick={()=> { if (idx>=0) setCur(idx) }}
              title={`프레임 ${item.f}로 이동`}
            >
              {url ? (
                <img src={url} className="w-16 h-10 object-cover rounded" />
              ) : (
                <div className="w-16 h-10 bg-gray-200 rounded" />
              )}
              <div className="text-xs flex-1">
                <div className="font-medium flex items-center gap-1">
                  Frame {item.f}
                  {item.idsw && <span className="ml-1 px-1 rounded bg-amber-100 text-amber-700 border border-amber-200">IDSW</span>}
                </div>
                <div className="mt-0.5 flex gap-2 text-[11px] text-gray-600">
                  <span className="px-1 rounded bg-green-100 text-green-700 border border-green-200">TP {item.tp}</span>
                  <span className="px-1 rounded bg-red-100 text-red-700 border border-red-200">FP {item.fp}</span>
                  <span className="px-1 rounded bg-blue-100 text-blue-700 border border-blue-200">FN {item.fn}</span>
                  <span className="px-1 rounded bg-gray-100 text-gray-700 border border-gray-200">GT {item.gt}</span>
                  <span className="px-1 rounded bg-gray-100 text-gray-700 border border-gray-200">PR {item.pred}</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
