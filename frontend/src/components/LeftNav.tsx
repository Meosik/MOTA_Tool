// frontend/src/components/LeftPanel.tsx
import { useMemo, useState, useEffect } from 'react'
import useFrameStore from '../store/frameStore'

const PAGE = 8

type DetailItem = { f: number; tp: number; fp: number; fn: number; idsw: boolean; gt: number; pred: number }

export default function LeftPanel(){
  const { frames, gtAnnotationId, predAnnotationId, iou, conf, setCur, getThumbnail, requestThumbnail, thumbnailVersion, idswFrames, overrideVersion, idswDetails, overrides } = useFrameStore(s=>({
    frames: s.frames,
    gtAnnotationId: s.gtAnnotationId,
    predAnnotationId: s.predAnnotationId,
    iou: s.iou,
    conf: s.conf,
    setCur: s.setCur,
    getThumbnail: s.getThumbnail,
    requestThumbnail: s.requestThumbnail,
    thumbnailVersion: s.thumbnailVersion,
    idswFrames: s.idswFrames,
    overrideVersion: s.overrideVersion,
    idswDetails: s.idswDetails,
    overrides: s.overrides,
  }))

  // 서버 기반 세부 카운트 (override 미반영) 별도 저장
  const [serverDetails, setServerDetails] = useState<DetailItem[]>([])
  const [page, setPage] = useState(0)

  const totalPages = Math.max(1, Math.ceil(idswFrames.length / PAGE))
  const curPage = Math.min(page, totalPages - 1)

  const pageItems = useMemo(()=>{
    const start = curPage * PAGE
    const ids = idswFrames.slice(start, start + PAGE)
    // override 반영 로컬 상세 map
    const localMap = new Map(idswDetails.map(d => [d.f, d]))
    const serverMap = new Map(serverDetails.map(d => [d.f, d]))
    return ids.map(f => localMap.get(f) || serverMap.get(f) || { f, tp:0, fp:0, fn:0, idsw:true, gt:0, pred:0 })
  }, [idswFrames, idswDetails, serverDetails, curPage])

  // 저해상도 썸네일 생성 트리거
  useEffect(()=>{
    for (const item of pageItems){
      const thumb = getThumbnail(item.f);
      if (!thumb) requestThumbnail(item.f);
    }
  }, [pageItems, getThumbnail, requestThumbnail, thumbnailVersion])

  async function scanServer(){
    // 서버 세부정보는 참고용: override 반영 안 됨.
    setPage(0)
    setServerDetails([])
    if (!gtAnnotationId || !predAnnotationId) return
    try {
      let base: string = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8000'
      // 혼용된 127.0.0.1 / localhost 로 인해 CORS 실패 시 프론트 호스트 기준 재정규화
      const frontHost = window.location.host; // e.g. localhost:5173
      const wantLocal = /localhost/i.test(frontHost);
      const want127 = /127\.0\.0\.1/i.test(frontHost);
      if (wantLocal && /127\.0\.0\.1/.test(base)) {
        base = base.replace('127.0.0.1','localhost')
      } else if (want127 && /localhost/.test(base)) {
        base = base.replace('localhost','127.0.0.1')
      }
      // trailing slash 제거
      const baseClean = base.replace(/\/$/, '')
      // overrides 직렬화 (geometry 포함)
      const overridesPayload: Record<string, Record<string, any>> = {}
      overrides.forEach((boxMap, frame) => {
        const frameMap: Record<string, any> = {}
        boxMap.forEach((box, origId) => {
          frameMap[String(origId)] = {
            id: box.id,
            x: box.x,
            y: box.y,
            w: box.w,
            h: box.h,
            ...(box.conf!=null ? { conf: box.conf } : {}),
          }
        })
        if (Object.keys(frameMap).length) overridesPayload[String(frame)] = frameMap
      })
      const body = {
        gt_id: gtAnnotationId,
        pred_id: predAnnotationId,
        iou,
        conf,
        overrides: overridesPayload,
      }
      const r = await fetch(baseClean + '/analysis/idsw_frames_override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error(await r.text())
      const data = await r.json()
      // 서버가 override 반영한 결과를 idswDetails/idswFrames로 대체하기 위해 store 업데이트 필요 (여기서 직접 적용)
      // idswFrames는 기존 store 상태를 재사용하므로 프론트 로컬 계산 비활성화 시 store patch 필요.
      // 간단히 store setState 사용.
      const framesArr = Array.isArray(data.frames) ? data.frames : []
      const detailsArr = Array.isArray(data.details) ? data.details : []
      // store 업데이트
      useFrameStore.setState({ idswFrames: framesArr, idswDetails: detailsArr })
      setServerDetails(detailsArr)
    } catch(e) {
      console.warn('scanServer failed', e)
      if (e instanceof TypeError) {
        console.warn('[Hint] CORS 가능성: front host=' + window.location.host + ' / attempted base URL 재확인 필요')
      }
    }
  }

  // 자동 재스캔 비활성화: 사용자가 "재스캔" 버튼을 눌러야 서버 측 IDSW/카운트 갱신

  return (
    <aside className="w-64 border-r bg-white flex flex-col">
      <div className="p-2 border-b flex items-center gap-2">
        <div className="font-semibold text-sm">ID Switch</div>
        <button
          onClick={()=>{ scanServer(); }}
          className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
          title="서버(override 반영) 재스캔"
        >
          재스캔
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
          <div className="text-xs text-gray-500">IDSW 프레임이 없습니다. 재스캔을 눌러 탐색하세요.</div>
        )}
        {pageItems.map(item => {
          const idx = frames.findIndex(f=>f.i===item.f)
          const url = getThumbnail(item.f) || (idx>=0 ? frames[idx].url : undefined)
          return (
            <button
              key={item.f}
              className="w-full flex items-center gap-2 text-left hover:bg-gray-50 p-1 rounded border"
              onClick={()=> { if (idx>=0) setCur(idx) }}
              title={`프레임 ${item.f}로 이동`}
            >
              {url ? (
                <img src={url} className="w-16 h-10 object-cover rounded" loading="lazy" />
              ) : (
                <div className="w-16 h-10 bg-gray-200 rounded animate-pulse" />
              )}
              <div className="text-xs flex-1">
                <div className="font-medium flex items-center gap-1">
                  Frame {item.f}
                  {item.idsw && <span className="ml-1 px-1 rounded bg-amber-100 text-amber-700 border border-amber-200">IDSW</span>}
                </div>
                {(idswDetails.length>0 || serverDetails.length>0) && (
                  <div className="mt-0.5 flex gap-2 text-[11px] text-gray-600">
                    <span className="px-1 rounded bg-green-100 text-green-700 border border-green-200">TP {item.tp}</span>
                    <span className="px-1 rounded bg-red-100 text-red-700 border border-red-200">FP {item.fp}</span>
                    <span className="px-1 rounded bg-blue-100 text-blue-700 border border-blue-200">FN {item.fn}</span>
                    <span className="px-1 rounded bg-gray-100 text-gray-700 border border-gray-200">GT {item.gt}</span>
                    <span className="px-1 rounded bg-gray-100 text-gray-700 border border-gray-200">PR {item.pred}</span>
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
