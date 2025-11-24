import React, { useState, useDeferredValue } from 'react'
import { useMapMetrics } from '../../hooks/mapApi'
import { useMapStore } from '../../store/mapStore'
import { getCategoryNameById } from '../../constants/cocoCategories'

// Calculate IoU (Intersection over Union) between two bounding boxes
function calculateIoU(box1: [number, number, number, number], box2: [number, number, number, number]): number {
  const [x1, y1, w1, h1] = box1;
  const [x2, y2, w2, h2] = box2;
  
  // Calculate intersection
  const xLeft = Math.max(x1, x2);
  const yTop = Math.max(y1, y2);
  const xRight = Math.min(x1 + w1, x2 + w2);
  const yBottom = Math.min(y1 + h1, y2 + h2);
  
  if (xRight < xLeft || yBottom < yTop) {
    return 0.0;  // No intersection
  }
  
  const intersectionArea = (xRight - xLeft) * (yBottom - yTop);
  const box1Area = w1 * h1;
  const box2Area = w2 * h2;
  const unionArea = box1Area + box2Area - intersectionArea;
  
  return unionArea > 0 ? intersectionArea / unionArea : 0.0;
}

// Calculate simple AP for a single image
function calculateImageAP(gtBoxes: any[], predBoxes: any[], iouThreshold: number): number {
  if (gtBoxes.length === 0) return predBoxes.length === 0 ? 1.0 : 0.0;
  if (predBoxes.length === 0) return 0.0;
  
  // Sort predictions by confidence (descending)
  const sortedPreds = [...predBoxes].sort((a, b) => (b.conf || 0) - (a.conf || 0));
  
  let tp = 0;
  const matched = new Set<number>();
  
  // For each prediction, find best matching GT
  for (const pred of sortedPreds) {
    let bestIou = 0;
    let bestGtIdx = -1;
    
    gtBoxes.forEach((gt, idx) => {
      if (matched.has(idx)) return;
      const iou = calculateIoU(pred.bbox, gt.bbox);
      if (iou > bestIou) {
        bestIou = iou;
        bestGtIdx = idx;
      }
    });
    
    if (bestIou >= iouThreshold && bestGtIdx >= 0) {
      tp++;
      matched.add(bestGtIdx);
    }
  }
  
  // Simple precision = TP / (TP + FP)
  const precision = tp / sortedPreds.length;
  // Simple recall = TP / total GT
  const recall = tp / gtBoxes.length;
  
  // Simple AP as average of precision and recall
  return (precision + recall) / 2;
}

interface MapControlPanelProps {
  projectId: string;
  annotationId: string | null;
  gtId?: string | null;
  predId?: string | null;
  selectedPrCurveCat?: number | null;
  setSelectedPrCurveCat?: (cat: number | null) => void;
}

// Hierarchical Instance Panel Component
function InstancePanel(props: {
  currentImage: any;
  gtAnnotations: any[];
  predAnnotations: any[];
  selectedPrCurveCat?: number | null;
  setSelectedPrCurveCat?: (cat: number | null) => void;
  imageMap?: number; // overall current image AP
}) {
  const { currentImage, gtAnnotations, predAnnotations, selectedPrCurveCat, setSelectedPrCurveCat, imageMap } = props;
  const visibleInstances = useMapStore(s => s.visibleInstances);
  const setVisibleInstances = useMapStore(s => s.setVisibleInstances);
  // GT/Pred/이미지 변경 시 visibleInstances를 GT+Pred 전체로 직접 세팅
  React.useEffect(() => {
    const all = new Set<string>();
    gtAnnotations.filter(a => !a.image_id || a.image_id === currentImage?.id).forEach(a => all.add(`gt-${a.id}`));
    predAnnotations.filter(a => !a.image_id || a.image_id === currentImage?.id).forEach(a => all.add(`pred-${a.id}`));
    setVisibleInstances(all);
  }, [currentImage?.id, gtAnnotations, predAnnotations, setVisibleInstances]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['gt', 'pred']));
  

  
    // Group annotations by category (for table)
    const groupedAnns = React.useMemo(() => {
      const gtForImage = gtAnnotations.filter(a => !a.image_id || a.image_id === currentImage?.id);
      const predForImage = predAnnotations.filter(a => !a.image_id || a.image_id === currentImage?.id);
      // GT/Pred의 모든 카테고리 합집합
      const cats = new Set<number>([...gtForImage.map(a => a.category), ...predForImage.map(a => a.category)]);
      const byCat: { [cat: number]: { gt: any[]; pred: any[] } } = {};
      cats.forEach(cat => {
        byCat[cat] = {
          gt: gtForImage.filter(a => a.category === cat),
          pred: predForImage.filter(a => a.category === cat),
        };
      });
      return byCat;
    }, [currentImage?.id, gtAnnotations, predAnnotations]);

    // 클래스별 PR-curve radio state (상위에서 내려받음)
    // 이미 props 구조분해에서 selectedPrCurveCat, setSelectedPrCurveCat 선언됨 (중복 제거)
  
  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };
  
  const toggleInstance = (id: string) => {
    setVisibleInstances(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  
  const toggleAllInGroup = (type: 'gt' | 'pred', category?: number) => {
    const instances: string[] = [];
    const anns = type === 'gt' ? gtAnnotations : predAnnotations;
    anns.filter(a => (!a.image_id || a.image_id === currentImage?.id) && (category === undefined || a.category === category))
      .forEach(a => instances.push(`${type}-${a.id}`));
    
    const allVisible = instances.every(id => visibleInstances.has(id));
    setVisibleInstances(prev => {
      const next = new Set(prev);
      instances.forEach(id => allVisible ? next.delete(id) : next.add(id));
      return next;
    });
  };
  
  if (!currentImage) return null;

  // IoU threshold (store에서)
  const iou = useMapStore(s => s.iou);
  const confThr = useMapStore(s => s.conf);

  // 클래스별 TP/FP 계산
  function getStats(gt: any[], pred: any[]): {tp: number, fp: number, gt: number} {
    let tp = 0, fp = 0;
    const matched = new Set<number>();
    const sortedPred = [...pred].sort((a, b) => (b.conf || 0) - (a.conf || 0));
    for (const p of sortedPred) {
      let bestIou = 0, bestIdx = -1;
      gt.forEach((g, idx) => {
        if (matched.has(idx)) return;
        const iouVal = calculateIoU(p.bbox, g.bbox);
        if (iouVal > bestIou) { bestIou = iouVal; bestIdx = idx; }
      });
      if (bestIou >= iou && bestIdx >= 0) { tp++; matched.add(bestIdx); }
      else { fp++; }
    }
    return { tp, fp, gt: gt.length };
  }

  // 테이블 렌더링
  return (
    <div className="overflow-x-auto max-h-80">
      <table className="min-w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-2 py-1 font-normal"> </th>
            <th className="px-2 py-1 font-normal text-left">Class</th>
            <th className="px-2 py-1 font-normal">GT</th>
            <th className="px-2 py-1 font-normal">TP</th>
            <th className="px-2 py-1 font-normal">FP</th>
            <th className="px-2 py-1 font-normal">AP</th>
            <th className="px-2 py-1 font-normal"> </th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(groupedAnns).map(([cat, {gt, pred}]) => {
            // Confidence threshold 적용 (COCO 시각화용; 공식 AP는 전체 활용)
            const filteredPred = pred.filter(p => (p.conf ?? 0) >= confThr);
            const stats = getStats(gt, filteredPred);
            const catId = Number(cat);
            const catName = getCategoryNameById(catId) || `Category ${catId}`;
            // conf 존재 여부로 pred/gt 구분하던 오류 제거 (GT도 conf=1.0이라 잘못 pred로 분류됨)
            const allGtVisible = gt.every(a => visibleInstances.has(`gt-${a.id}`));
            const allPredVisible = pred.every(a => visibleInstances.has(`pred-${a.id}`)); // toggle는 원본 기준
            // 초기 렌더에서 visibleInstances가 아직 채워지지 않았다면 체크된 상태로 표시
            const allVisible = (visibleInstances.size === 0)
              ? true
              : (allGtVisible && allPredVisible);
            return (
              <tr key={catId} className="border-b last:border-b-0">
                <td className="px-2 py-1 text-center">
                  <input
                    type="checkbox"
                    checked={allVisible}
                    onChange={e => {
                      // 체크박스 상태에 따라 전체 on/off
                      setVisibleInstances(prev => {
                        const next = new Set(prev);
                        if (e.target.checked) {
                          gt.forEach(a => next.add(`gt-${a.id}`));
                          pred.forEach(a => next.add(`pred-${a.id}`));
                        } else {
                          gt.forEach(a => next.delete(`gt-${a.id}`));
                          pred.forEach(a => next.delete(`pred-${a.id}`));
                        }
                        return next;
                      });
                    }}
                    className="w-4 h-4"
                  />
                </td>
                <td className="px-2 py-1 text-left">{catName}</td>
                <td className="px-2 py-1 text-center text-green-700">{stats.gt}</td>
                <td className="px-2 py-1 text-center text-blue-700">{stats.tp}</td>
                <td className="px-2 py-1 text-center text-red-700">{stats.fp}</td>
                <td className="px-2 py-1 text-center text-purple-700">
                  {(() => {
                    // 101-point interpolated AP per class (unfiltered or filteredPred?) use filteredPred for visual consistency
                    if (gt.length === 0) return '—';
                    const predsSorted = [...filteredPred].sort((a,b)=>(b.conf||0)-(a.conf||0));
                    let tp=0, fp=0; const matched=new Set<number>();
                    const precisions:number[]=[]; const recalls:number[]=[];
                    predsSorted.forEach(p=>{
                      let bestIou=0, bestIdx=-1;
                      gt.forEach((g,i)=>{ if(matched.has(i)) return; const iou=calculateIoU(p.bbox,g.bbox); if(iou>bestIou){bestIou=iou;bestIdx=i;} });
                      if(bestIou>=iou){ tp++; matched.add(bestIdx);} else { fp++; }
                      precisions.push(tp/(tp+fp)); recalls.push(tp/gt.length);
                    });
                    let ap=0; for(let r=0;r<=100;r++){ const thr=r/100; let pMax=0; for(let i=0;i<recalls.length;i++){ if(recalls[i]>=thr) pMax=Math.max(pMax, precisions[i]); } ap+=pMax; }
                    ap/=101; return (ap*100).toFixed(1)+'%';
                  })()}
                </td>
                <td className="px-2 py-1 text-center">
                  <input
                    type="radio"
                    name="prcurve-class"
                    checked={selectedPrCurveCat === catId}
                    onChange={() => setSelectedPrCurveCat && setSelectedPrCurveCat(catId)}
                  />
                </td>
              </tr>
            );
          })}
          {imageMap != null && (
            <tr className="border-t bg-neutral-50">
              <td />
              <td className="px-2 py-1 text-left font-semibold">Current Image mAP</td>
              <td className="px-2 py-1 text-center" colSpan={3}></td>
              <td className="px-2 py-1 text-center font-mono text-purple-700">{(imageMap * 100).toFixed(2)}%</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function MapControlPanel({
  projectId, annotationId, gtId, predId,
  selectedPrCurveCat, setSelectedPrCurveCat
}: MapControlPanelProps & {
  selectedPrCurveCat?: number | null;
  setSelectedPrCurveCat?: (cat: number | null) => void;
}) {
  // Read thresholds from store (like MOTA mode's RightPanel)
  const iou = useMapStore(s => s.iou);
  const conf = useMapStore(s => s.conf);
  const setIou = useMapStore(s => s.setIou);
  const setConf = useMapStore(s => s.setConf);
  
  // Defer expensive calculations to avoid blocking slider interactions
  const deferredIou = useDeferredValue(iou);
  const deferredConf = useDeferredValue(conf);
  
  // Get current image and annotations from store with stable selectors
  const currentImageIndex = useMapStore(s => s.currentImageIndex);
  const images = useMapStore(s => s.images);
  const gtAnnotations = useMapStore(s => s.gtAnnotations);
  const predAnnotations = useMapStore(s => s.predAnnotations);
  const currentImage = images[currentImageIndex] || null;
  
  // Use gtId/predId if provided, fallback to projectId/annotationId
  const effectiveGtId = gtId || projectId
  const effectivePredId = predId || annotationId
  
  // Manual trigger for overall mAP calculation
  const [shouldCalculateOverall, setShouldCalculateOverall] = useState(false);
  
  // Call backend API only when manually triggered (use deferred values to reduce API calls)
  const { data, isLoading, error, refetch } = useMapMetrics(
    effectiveGtId, 
    effectivePredId!, 
    deferredConf, 
    deferredIou,
    shouldCalculateOverall
  );
  
  // Handle calculate overall mAP button click
  const handleCalculateOverallMap = () => {
    setShouldCalculateOverall(true);
    refetch();
  };
  
  // Memoize GT filtering separately (only depends on currentImage and gtAnnotations)
  const gtForImage = React.useMemo(() => {
    if (!currentImage) return [];
    return gtAnnotations.filter(a => {
      // If no image_id, show for all images
      if (!a.image_id) return true;
      // Otherwise match current image
      return a.image_id === currentImage.id;
    });
  }, [currentImage, gtAnnotations]);

  // Memoize pred filtering (uses deferred values to avoid blocking slider)
  const predForImage = React.useMemo(() => {
    if (!currentImage) return [];
    
    return predAnnotations.filter(a => {
      // Check image_id
      if (a.image_id && a.image_id !== currentImage.id) return false;
      
      // Check confidence threshold
      if ((a.conf || 0) < deferredConf) return false;
      
      // Check IoU threshold - pred must have IoU >= threshold with at least one GT box
      if (deferredIou > 0 && gtForImage.length > 0) {
        const maxIoU = Math.max(...gtForImage.map(gt => calculateIoU(a.bbox, gt.bbox)));
        if (maxIoU < deferredIou) return false;
      }
      
      return true;
    });
  }, [currentImage, predAnnotations, deferredConf, deferredIou, gtForImage]);

  // Calculate per-image statistics (uses deferred values)
  const imageStats = React.useMemo(() => {
    if (!currentImage) return null;
    
    console.log('MapControlPanel: Calculating stats for image', currentImage.id);
    console.log('MapControlPanel: Filtered GT', gtForImage.length, 'Filtered Pred', predForImage.length);
    
    // Calculate AP for current image
    const imageAP = calculateImageAP(gtForImage, predForImage, deferredIou);
    
    return {
      gtCount: gtForImage.length,
      predCount: predForImage.length,
      imageName: currentImage.name,
      imageId: currentImage.id,
      mAP: imageAP,
    };
  }, [currentImage, gtForImage, predForImage, deferredIou]);

  // Slider adjustment utilities (matching MOTA RightPanel)
  const stepSmall = 0.01
  const stepLarge = 0.05
  const round2 = (v: number) => Math.round(v * 100) / 100
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
  const adjustIou = (d: number) => setIou(clamp01(round2(iou + d)))
  const adjustConf = (d: number) => setConf(clamp01(round2(conf + d)))

  return (
    <aside className="w-80 shrink-0 border-l border-neutral-200 p-3 flex flex-col gap-4">
      {/* IoU Threshold */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">IoU Threshold</div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustIou(-stepLarge)} title="IoU -0.05">
            <svg viewBox="0 0 20 12" width="16" height="12"><polygon points="9,6 17,1 17,11"/><polygon points="1,6 9,1 9,11"/></svg>
          </button>
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustIou(-stepSmall)} title="IoU -0.01">
            <svg viewBox="0 0 12 12" width="12" height="12" style={{ transform: 'scaleX(-1)' }}><polygon points="2,1 10,6 2,11"/></svg>
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={iou}
            onChange={e => setIou(clamp01(parseFloat(e.currentTarget.value)))}
            className="flex-1"
          />
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustIou(+stepSmall)} title="IoU +0.01">
            <svg viewBox="0 0 12 12" width="12" height="12"><polygon points="2,1 10,6 2,11"/></svg>
          </button>
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustIou(+stepLarge)} title="IoU +0.05">
            <svg viewBox="0 0 20 12" width="16" height="12"><polygon points="3,1 11,6 3,11"/><polygon points="11,1 19,6 11,11"/></svg>
          </button>
        </div>
        <div className="text-xs text-neutral-600 font-mono">IoU = {iou.toFixed(2)}</div>
      </div>

      {/* Confidence Threshold */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">Confidence Threshold</div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustConf(-stepLarge)} title="conf -0.05">
            <svg viewBox="0 0 20 12" width="16" height="12"><polygon points="9,6 17,1 17,11"/><polygon points="1,6 9,1 9,11"/></svg>
          </button>
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustConf(-stepSmall)} title="conf -0.01">
            <svg viewBox="0 0 12 12" width="12" height="12" style={{ transform: 'scaleX(-1)' }}><polygon points="2,1 10,6 2,11"/></svg>
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={conf}
            onChange={e => setConf(clamp01(parseFloat(e.currentTarget.value)))}
            className="flex-1"
          />
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustConf(+stepSmall)} title="conf +0.01">
            <svg viewBox="0 0 12 12" width="12" height="12"><polygon points="2,1 10,6 2,11"/></svg>
          </button>
          <button className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => adjustConf(+stepLarge)} title="conf +0.05">
            <svg viewBox="0 0 20 12" width="16" height="12"><polygon points="3,1 11,6 3,11"/><polygon points="11,1 19,6 11,11"/></svg>
          </button>
        </div>
        <div className="text-xs text-neutral-600 font-mono">conf ≥ {conf.toFixed(2)}</div>
      </div>

      {/* Instance Visibility Panel + per-image class stats */}
      {currentImage && imageStats && (
        <InstancePanel
          currentImage={currentImage}
          gtAnnotations={gtAnnotations}
          predAnnotations={predAnnotations}
          selectedPrCurveCat={selectedPrCurveCat}
          setSelectedPrCurveCat={setSelectedPrCurveCat}
          imageMap={imageStats.mAP}
        />
      )}

      {/* Current image PR Curve (selected class or all) */}
      {currentImage && (
        <ImagePRCurve
          imageId={currentImage.id}
          gtAnnotations={gtAnnotations}
          predAnnotations={predAnnotations}
          selectedCat={selectedPrCurveCat}
        />
      )}

      {/* Bottom metrics removed per new layout */}
    </aside>
  )
}

// Extracted PR curve logic for reuse (current image)
function ImagePRCurve({ imageId, gtAnnotations, predAnnotations, selectedCat }: { imageId: number; gtAnnotations: any[]; predAnnotations: any[]; selectedCat: number | null | undefined }) {
  const iou = useMapStore(s => s.iou);
  const conf = useMapStore(s => s.conf);
  const gtForImage = gtAnnotations.filter(a => a.image_id === imageId && (selectedCat == null || a.category === selectedCat));
  let predForImage = predAnnotations.filter(a => a.image_id === imageId && (selectedCat == null || a.category === selectedCat));
  predForImage = predForImage.filter(p => (p.conf ?? 0) >= conf);

  const points = React.useMemo(() => {
    // Reuse calculation similar to MapImageList (enveloped)
    if (gtForImage.length === 0 || predForImage.length === 0) return [{ precision: 0, recall: 0 }];
    const sortedPreds = [...predForImage].sort((a, b) => (b.conf || 0) - (a.conf || 0));
    let tp = 0, fp = 0; const matched = new Set<number>();
    const precisions:number[]=[]; const recalls:number[]=[];
    for (const pred of sortedPreds) {
      let bestIou = 0, bestIdx = -1;
      for (let gi=0; gi<gtForImage.length; gi++) { if (matched.has(gi)) continue; const iouV = calculateIoU(pred.bbox, gtForImage[gi].bbox); if (iouV > bestIou) { bestIou = iouV; bestIdx = gi; } }
      if (bestIou >= iou && bestIdx >= 0) { tp++; matched.add(bestIdx); } else { fp++; }
      precisions.push(tp/(tp+fp)); recalls.push(tp/gtForImage.length);
    }
    const env = [...precisions]; for (let i=env.length-2;i>=0;i--) env[i] = Math.max(env[i], env[i+1]);
    const out: {precision:number; recall:number}[] = [];
    let lastR=-1; for (let i=0;i<recalls.length;i++){ if(recalls[i]===lastR) continue; out.push({precision:env[i], recall:recalls[i]}); lastR=recalls[i]; }
    if (out.length && out[0].recall>0) out.unshift({precision:out[0].precision, recall:0});
    return out;
  }, [gtForImage, predForImage, iou]);

  const width=260, height=170, pad=30; const cw=width-2*pad, ch=height-2*pad;
  const path = points.map((p,i)=>{ const x=pad + p.recall*cw; const y=pad + (1-p.precision)*ch; return `${i?'L':'M'} ${x} ${y}`; }).join(' ');

  return (
    <div className="mt-2 border rounded bg-gray-50 p-2">
      <div className="text-xs font-semibold mb-1">PR Curve (Current Image{selectedCat!=null?` · ${getCategoryNameById(selectedCat) || 'Category '+selectedCat}`:''})</div>
      <svg width={width} height={height} className="bg-white rounded border">
        {[0,0.25,0.5,0.75,1].map(v=> (
          <g key={v}>
            <line x1={pad} y1={pad+(1-v)*ch} x2={pad+cw} y2={pad+(1-v)*ch} stroke="#e5e7eb" />
            <line x1={pad+v*cw} y1={pad} x2={pad+v*cw} y2={pad+ch} stroke="#e5e7eb" />
          </g>
        ))}
        <line x1={pad} y1={pad} x2={pad} y2={pad+ch} stroke="#374151" strokeWidth={2} />
        <line x1={pad} y1={pad+ch} x2={pad+cw} y2={pad+ch} stroke="#374151" strokeWidth={2} />
        <path d={path} fill="none" stroke="#3b82f6" strokeWidth={2} />
        {[0,0.5,1].map(v=> (
          <g key={v}>
            <text x={pad+v*cw} y={pad+ch+12} fontSize={8} textAnchor="middle" fill="#6b7280">{v.toFixed(1)}</text>
            <text x={pad-5} y={pad+(1-v)*ch+3} fontSize={8} textAnchor="end" fill="#6b7280">{v.toFixed(1)}</text>
          </g>
        ))}
        <text x={pad+cw/2} y={height-5} fontSize={10} textAnchor="middle" fill="#374151">Recall</text>
        <text x={10} y={pad+ch/2} fontSize={10} textAnchor="middle" fill="#374151" transform={`rotate(-90, 10, ${pad+ch/2})`}>Precision</text>
      </svg>
    </div>
  );
}