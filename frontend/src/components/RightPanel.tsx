
import { useState } from 'react'

export default function RightPanel(){
  const [iou, setIou] = useState(0.5)
  return (
    <div className="p-3 text-sm space-y-4">
      <section>
        <div className="font-semibold text-gray-700 mb-1">IoU 임계값</div>
        <div className="flex items-center gap-3">
          <input type="range" min={0.1} max={0.9} step={0.05} value={iou}
            onChange={(e)=> setIou(parseFloat(e.target.value))}
            className="w-full"/>
          <span className="w-12 text-right">{iou.toFixed(2)}</span>
        </div>
      </section>
      <section>
        <div className="font-semibold text-gray-700 mb-1">가시성</div>
        <div className="space-y-1">
          <label className="flex items-center gap-2"><input type="checkbox" defaultChecked/> GT</label>
          <label className="flex items-center gap-2"><input type="checkbox" defaultChecked/> Pred</label>
        </div>
      </section>
      <section>
        <div className="font-semibold text-gray-700 mb-1">스타일</div>
        <div className="space-y-1 text-gray-500">선 굵기, 라벨 스타일 등</div>
      </section>
    </div>
  )
}
