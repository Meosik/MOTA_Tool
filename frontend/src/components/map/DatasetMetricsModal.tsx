import React from 'react';
import { getCategoryNameById } from '../../constants/cocoCategories';
import { useMapStore } from '../../store/mapStore';

interface DatasetMetricsModalProps {
  open: boolean;
  onClose: () => void;
  overallLoading: boolean;
  overallMap: number | null;
  snapshotGt: any[];
  snapshotPred: any[];
  snapshotIou: number;
  snapshotConf: number;
}

// Utility: IoU
function iou(box1: [number,number,number,number], box2: [number,number,number,number]){
  const [x1,y1,w1,h1]=box1; const [x2,y2,w2,h2]=box2;
  const xa=Math.max(x1,x2), ya=Math.max(y1,y2); const xb=Math.min(x1+w1,x2+w2), yb=Math.min(y1+h1,y2+h2);
  if(xb<xa|| yb<ya) return 0; const inter=(xb-xa)*(yb-ya); const u=w1*h1 + w2*h2 - inter; return u>0? inter/u:0;
}

function buildPRCurve(gts:any[], preds:any[], thr:number){
  if(!gts.length || !preds.length) return [{precision:0, recall:0}];
  const sorted=[...preds].sort((a,b)=>(b.conf||0)-(a.conf||0));
  let tp=0, fp=0; const matched=new Set<number>();
  const prec:number[]=[]; const rec:number[]=[];
  for(const p of sorted){
    let best=0, bestIdx=-1; for(let i=0;i<gts.length;i++){ if(matched.has(i)) continue; const v=iou(p.bbox,gts[i].bbox); if(v>best){best=v; bestIdx=i;} }
    if(best>=thr && bestIdx>=0){ tp++; matched.add(bestIdx);} else { fp++; }
    prec.push(tp/(tp+fp)); rec.push(tp/gts.length);
  }
  const env=[...prec]; for(let i=env.length-2;i>=0;i--) env[i]=Math.max(env[i], env[i+1]);
  const out: {precision:number; recall:number}[]=[]; let last=-1; for(let i=0;i<rec.length;i++){ if(rec[i]===last) continue; out.push({precision:env[i], recall:rec[i]}); last=rec[i]; }
  if(out.length && out[0].recall>0) out.unshift({precision:out[0].precision, recall:0});
  return out;
}

export default function DatasetMetricsModal({ open, onClose, overallLoading, overallMap, snapshotGt, snapshotPred, snapshotIou, snapshotConf }: DatasetMetricsModalProps){
  // Use snapshot copies passed from TopBar; ignore live store changes for stable view
  const gt = snapshotGt;
  const pred = snapshotPred;
  const iouThr = snapshotIou;
  const confThr = snapshotConf; // visualization filtering (snapshot)
  const [selectedCat, setSelectedCat] = React.useState<number|null>(null);
  const [rows, setRows] = React.useState<Array<{cat:number; gt:number; tp:number; fp:number; ap:number}>>([]);
  const [progressIdx, setProgressIdx] = React.useState(0);
  const [computing, setComputing] = React.useState(false);
  const [curvesCache, setCurvesCache] = React.useState<Map<number,{precision:number; recall:number}[]>>(new Map());

  // Kick off incremental computation when modal opens or underlying data changes
  React.useEffect(()=>{
    if(!open || overallLoading) return; // wait for backend overall mAP
    setRows([]); setCurvesCache(new Map()); setProgressIdx(0); setComputing(true);
    const cats = Array.from(new Set([...gt.map(g=>g.category), ...pred.map(p=>p.category)])).sort((a,b)=>a-b);
    setSelectedCat(cats.length?cats[0]:null);
    let cancelled=false;
    function processNext(i:number){
      if(cancelled) return; if(i>=cats.length){ setComputing(false); return; }
      const cat=cats[i];
      const gts=gt.filter(g=>g.category===cat);
      const predsAll=pred.filter(p=>p.category===cat);
      const predsVis=predsAll.filter(p=>(p.conf??0)>=confThr);
      // Fast TP/FP & PR calculation
      const sorted=[...predsVis].sort((a,b)=>(b.conf||0)-(a.conf||0));
      let tp=0, fp=0; const matched=new Set<number>();
      const precisions:number[]=[]; const recalls:number[]=[];
      for(const p of sorted){
        let best=0, bestIdx=-1; for(let gi=0; gi<gts.length; gi++){ if(matched.has(gi)) continue; const v=iou(p.bbox,gts[gi].bbox); if(v>best){best=v; bestIdx=gi;} }
        if(best>=iouThr && bestIdx>=0){ tp++; matched.add(bestIdx);} else { fp++; }
        precisions.push(tp/(tp+fp)); recalls.push(tp/(gts.length||1));
      }
      // Envelope + AP
      const env=[...precisions]; for(let k=env.length-2;k>=0;k--) env[k]=Math.max(env[k], env[k+1]);
      const curve: {precision:number; recall:number}[]=[]; let lastR=-1; for(let k=0;k<recalls.length;k++){ if(recalls[k]===lastR) continue; curve.push({precision:env[k], recall:recalls[k]}); lastR=recalls[k]; }
      if(curve.length && curve[0].recall>0) curve.unshift({precision:curve[0].precision, recall:0});
      let ap=0; for(let r=0;r<=100;r++){ const rr=r/100; let pMax=0; for(const pt of curve){ if(pt.recall>=rr) pMax=Math.max(pMax, pt.precision); } ap+=pMax; } ap/=101;
      setCurvesCache(prev=>{ const m=new Map(prev); m.set(cat, curve); return m; });
      setRows(prev=>[...prev, {cat, gt:gts.length, tp, fp, ap}]);
      setProgressIdx(i+1);
      // Yield to event loop
      setTimeout(()=>processNext(i+1), 0);
    }
    processNext(0);
    return ()=>{ cancelled=true; };
  }, [open, overallLoading, gt, pred, iouThr, confThr]);

  if(!open) return null;
  // Show backend loading or per-class incremental progress
  if(overallLoading || computing){
    const totalCats = computing ? Array.from(new Set([...gt.map(g=>g.category), ...pred.map(p=>p.category)])).length : 0;
    const pct = overallLoading ? 0 : (totalCats? Math.round((progressIdx/totalCats)*100):0);
    return (
      <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40">
        <div className="w-[460px] bg-white rounded shadow-lg p-6 space-y-4">
          <div className="text-lg font-semibold">Overall mAP Calculation (IoU {snapshotIou.toFixed(2)}, Conf {snapshotConf.toFixed(2)})</div>
          <div className="text-sm text-gray-700">{overallLoading? 'Collecting mAP from backend...' : 'Calculating per-class statistics...'}</div>
          <div className="h-3 w-full rounded bg-gray-200 overflow-hidden">
            <div className="h-full bg-brand-600" style={{ width: overallLoading? '40%' : pct+'%' }} />
          </div>
          <div className="text-xs text-gray-600">{overallLoading? 'Waiting for server response' : `${pct}% (${progressIdx}/${totalCats})`}</div>
          <div className="flex justify-end">
            <button onClick={onClose} className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50">Close</button>
          </div>
        </div>
      </div>
    );
  }

  const selectedCurve = (selectedCat!=null && curvesCache.has(selectedCat)) ? curvesCache.get(selectedCat)! : [];

  const width=300, height=240, pad=38; const cw=width-2*pad, ch=height-2*pad;
  const curvePath = selectedCurve.map((p,i)=>{ const x=pad + p.recall*cw; const y=pad + (1-p.precision)*ch; return `${i?'L':'M'} ${x} ${y}`; }).join(' ');

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/45">
      <div className="w-[960px] max-h-[80vh] bg-white rounded shadow-xl p-5 flex gap-4">
        {/* Left: table */}
        <div className="flex-1 overflow-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="text-lg font-semibold">Dataset Class Statistics (IoU {iouThr.toFixed(2)}, Conf {confThr.toFixed(2)})</div>
            <div className="text-sm text-gray-600">Overall mAP: {overallMap!=null ? (overallMap*100).toFixed(2)+'%' : '—'}</div>
          </div>
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-2 py-1 text-left font-medium">Class</th>
                <th className="px-2 py-1 font-medium">GT</th>
                <th className="px-2 py-1 font-medium">TP</th>
                <th className="px-2 py-1 font-medium">FP</th>
                <th className="px-2 py-1 font-medium">AP</th>
                <th className="px-2 py-1 font-medium">PR</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r=> {
                const name = getCategoryNameById(r.cat) || `Category ${r.cat}`;
                return (
                <tr key={r.cat} className="border-b last:border-b-0">
                  <td className="px-2 py-1 text-left">{name}</td>
                  <td className="px-2 py-1 text-center text-green-700">{r.gt}</td>
                  <td className="px-2 py-1 text-center text-blue-700">{r.tp}</td>
                  <td className="px-2 py-1 text-center text-red-700">{r.fp}</td>
                  <td className="px-2 py-1 text-center text-purple-700">{(r.ap*100).toFixed(1)}%</td>
                  <td className="px-2 py-1 text-center">
                    <input type="radio" name="ds-pr-class" checked={selectedCat===r.cat} onChange={()=> setSelectedCat(r.cat)} />
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
        {/* Right: PR curve */}
        <div className="w-[340px] flex flex-col">
          <div className="text-sm font-semibold mb-1">Dataset PR Curve{selectedCat!=null?` · ${getCategoryNameById(selectedCat) || 'Category '+selectedCat}`:''}</div>
          <svg width={width} height={height} className="bg-white rounded border border-gray-300">
            {[0,0.25,0.5,0.75,1].map(v=> (
              <g key={v}>
                <line x1={pad} y1={pad+(1-v)*ch} x2={pad+cw} y2={pad+(1-v)*ch} stroke="#e5e7eb" />
                <line x1={pad+v*cw} y1={pad} x2={pad+v*cw} y2={pad+ch} stroke="#e5e7eb" />
              </g>
            ))}
            <line x1={pad} y1={pad} x2={pad} y2={pad+ch} stroke="#374151" strokeWidth={2} />
            <line x1={pad} y1={pad+ch} x2={pad+cw} y2={pad+ch} stroke="#374151" strokeWidth={2} />
            <path d={curvePath} fill="none" stroke="#3b82f6" strokeWidth={2} />
            {[0,0.5,1].map(v=> (
              <g key={v}>
                <text x={pad+v*cw} y={pad+ch+14} fontSize={10} textAnchor="middle" fill="#6b7280">{v.toFixed(1)}</text>
                <text x={pad-6} y={pad+(1-v)*ch+4} fontSize={10} textAnchor="end" fill="#6b7280">{v.toFixed(1)}</text>
              </g>
            ))}
            <text x={pad+cw/2} y={height-6} fontSize={11} textAnchor="middle" fill="#374151">Recall</text>
            <text x={16} y={pad+ch/2} fontSize={11} textAnchor="middle" fill="#374151" transform={`rotate(-90, 16, ${pad+ch/2})`}>Precision</text>
          </svg>
          <div className="mt-3 flex justify-end">
            <button onClick={onClose} className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}