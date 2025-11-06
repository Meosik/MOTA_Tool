import { useFrameStore } from '../store/frameStore'

export default function Timeline(){
  const { frames, cur, setCur, prefetchAround } = useFrameStore()
  const max = Math.max(0, frames.length - 1)
  return (
    <div className="h-16 px-3 flex items-center gap-3 bg-white border-t">
      <button className="px-2 py-1 border rounded" onClick={()=> setCur(cur-1)} disabled={cur<=0}>◀</button>
      <input type="range" min={0} max={max} value={cur} onChange={(e)=> { const idx = parseInt(e.target.value); setCur(idx); prefetchAround(idx); }}className="w-full"/>
      <button className="px-2 py-1 border rounded" onClick={()=> setCur(cur+1)} disabled={cur>=max}>▶</button>
      <div className="w-40 text-right text-sm text-gray-600">
        {frames[cur]?.i ?? 0} (idx {cur+1}/{frames.length})
      </div>
    </div>
  )
}
