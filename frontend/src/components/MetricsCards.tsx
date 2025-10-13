import { useEvalStore } from '../store/evalStore'

export default function MetricsCards(){
  const { metrics } = useEvalStore()
  return <div style={{display:'flex', gap:16}}>
    <Card title='MOTA' value={metrics?.MOTA?.toFixed(3) ?? '-'} />
    <Card title='GT' value={metrics?.counts?.GT ?? '-'} />
    <Card title='FP' value={metrics?.counts?.FP ?? '-'} />
    <Card title='FN' value={metrics?.counts?.FN ?? '-'} />
    <Card title='IDSW' value={metrics?.counts?.IDSW ?? '-'} />
  </div>
}

function Card({title, value}:{title:string, value:any}){
  return <div style={{border:'1px solid #ddd', padding:12, minWidth:80}}>
    <div style={{fontSize:12, color:'#666'}}>{title}</div>
    <div style={{fontSize:20}}>{value}</div>
  </div>
}