# backend/app/api/analysis.py
from fastapi import APIRouter, HTTPException, Query
from app.core.config import settings
from app.services.mota import evaluate_mota_detailed

router = APIRouter(prefix="/analysis", tags=["analysis"])

@router.get("/idsw_frames")
def idsw_frames(
    gt_id: str = Query(...),
    pred_id: str = Query(...),
    iou: float = Query(0.5),
    conf: float = Query(0.0),
):
    root = settings.DATA_ROOT / "annotations"
    gt_path = root / f"{gt_id}.txt"
    pr_path = root / f"{pred_id}.txt"
    if not gt_path.exists() or not pr_path.exists():
        raise HTTPException(status_code=404, detail="annotation id not found")

    try:
        mota, stats, frames, details = evaluate_mota_detailed(gt_path, pr_path, iou, conf)
    except Exception as e:
        # Convert unexpected errors to HTTPException so FastAPI returns a JSON error
        # and CORS middleware can still attach headers. Also provide useful debug info.
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "mota": mota,
        "tp": stats["TP"],
        "fp": stats["FP"],
        "fn": stats["FN"],
        "idsw": stats["IDSW"],
        "total_gt": stats["total_gt"],
        "frames": frames,         # IDSW 발생 프레임 번호 배열
        "details": details,       # [{f,tp,fp,fn,idsw,gt,pred}, ...] (모든 프레임 순서대로)
    }
