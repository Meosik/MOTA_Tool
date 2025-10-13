import { useState } from 'react'
import { api } from '../lib/api'

export default function Runs(){
  const [gtId,setGtId]=useState('')
  const [predId,setPredId]=useState('')
  const [runId,setRunId]=useState<string|undefined>()
  const [iou,setIou]=useState(0.5)

  const create = async ()=>{
    const res = await api('/runs', {method:'POST', json:{gt_annotation_id:gtId, pred_annotation_id:predId, iou_threshold:iou}})
    setRunId(res.run_id)
  }
  const evaluate = async ()=>{
    if(!runId) return
    await api(`/runs/${runId}/evaluate`, {method:'POST'})
    alert('evaluated')
  }

  return <div style={{display:'grid', gap:8}}>
    <h2>Runs</h2>
    <label>GT annotation id <input value={gtId} onChange={e=>setGtId(e.target.value)} /></label>
    <label>Pred annotation id <input value={predId} onChange={e=>setPredId(e.target.value)} /></label>
    <label>IoU <input type="number" value={iou} step={0.05} onChange={e=>setIou(parseFloat(e.target.value))}/></label>
    <div style={{display:'flex', gap:8}}>
      <button onClick={create}>Create Run</button>
      <button onClick={evaluate} disabled={!runId}>Evaluate</button>
    </div>
    {runId && <div>run_id: {runId}</div>}
  </div>
}