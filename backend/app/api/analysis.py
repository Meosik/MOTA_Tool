# backend/app/api/analysis.py
from fastapi import APIRouter, HTTPException, Query
from pathlib import Path
from pydantic import BaseModel
from typing import Dict, Any
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

# ---- Override-aware evaluation (geometry + id) ----
class OverrideBox(BaseModel):
    id: int
    x: float
    y: float
    w: float
    h: float
    conf: float | None = None

class OverrideEvalRequest(BaseModel):
    gt_id: str
    pred_id: str
    iou: float = 0.5
    conf: float = 0.0
    overrides: Dict[str, Dict[str, OverrideBox]] = {}

@router.post("/idsw_frames_override")
def idsw_frames_override(body: OverrideEvalRequest):
    """Override 반영 상세 평가.
    overrides 구조: {"frame": {"orig_id": {id,x,y,w,h,conf?}}}
    원본 pred 파일 라인별 파싱 후 해당 frame & orig_id 매칭 시 id/geometry/conf 치환.
    존재하지 않는 frame/orig_id 조합은 무시.
    """
    root = settings.DATA_ROOT / "annotations"
    gt_path = root / f"{body.gt_id}.txt"
    pr_path = root / f"{body.pred_id}.txt"
    if not gt_path.exists() or not pr_path.exists():
        raise HTTPException(status_code=404, detail="annotation id not found")

    # pred 파일 변환 (임시 파일에서 evaluate)
    import tempfile, shutil, csv, traceback
    try:
        rows: list[list[str]] = []
        with pr_path.open("r", encoding="utf-8") as fp:
            reader = csv.reader(fp)
            for row in reader:
                if not row:
                    continue
                try:
                    fr = int(float(row[0]))
                    tid = int(float(row[1]))
                except Exception:
                    rows.append(row)
                    continue
                frame_map = body.overrides.get(str(fr)) or {}
                ov = frame_map.get(str(tid))
                if ov:
                    row[1] = str(int(ov.id))
                    while len(row) < 7:
                        row.append("-1")
                    row[2] = f"{ov.x}"; row[3] = f"{ov.y}"; row[4] = f"{ov.w}"; row[5] = f"{ov.h}"
                    if ov.conf is not None:
                        row[6] = f"{ov.conf}"
                rows.append(row)
        tmp_dir = tempfile.mkdtemp(prefix="mota_override_eval_")
        tmp_pred_path = Path(tmp_dir) / "pred.txt"
        with tmp_pred_path.open("w", encoding="utf-8", newline="") as wfp:
            writer = csv.writer(wfp)
            writer.writerows(rows)
        from app.services.mota import evaluate_mota_detailed
        mota, stats, frames, details = evaluate_mota_detailed(gt_path, tmp_pred_path, body.iou, body.conf)
        return {
            "mota": mota,
            "tp": stats["TP"],
            "fp": stats["FP"],
            "fn": stats["FN"],
            "idsw": stats["IDSW"],
            "total_gt": stats["total_gt"],
            "frames": frames,
            "details": details,
        }
    except HTTPException:
        raise
    except Exception as e:
        tb = traceback.format_exc(limit=5)
        raise HTTPException(status_code=500, detail=f"override evaluation fatal: {e} | {tb}")
    finally:
        try:
            if 'tmp_dir' in locals():
                shutil.rmtree(tmp_dir)
        except Exception:
            pass
