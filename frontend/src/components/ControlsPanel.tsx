import { useEffect, useState } from 'react'
import { ws } from '../lib/socket'
import { useEvalStore } from '../store/evalStore'

export default function ControlsPanel(){
  const [iou,setIou] = useState(0.5)
  const { setMetrics } = useEvalStore()

  useEffect(()=>{
    ws.connect().then(()=>{
      ws.preview({gt_annotation_id:'GT_ID', pred_annotation_id:'PRED_ID', iou_threshold:iou}, (msg)=>{
        setMetrics(msg)
      })
    })
    return ()=>ws.close()
  }, [])

  const onChange = (v:number)=>{
    setIou(v)
    ws.preview({gt_annotation_id:'GT_ID', pred_annotation_id:'PRED_ID', iou_threshold:v}, (msg)=>{
      setMetrics(msg)
    })
  }

  return <div style={{display:'flex', gap:12, alignItems:'center'}}>
    <span>IoU:</span>
    <input type="range" min={0.3} max={0.8} step={0.05} value={iou} onChange={e=>onChange(parseFloat(e.target.value))}/>
    <span>{iou.toFixed(2)}</span>
  </div>
}