from fastapi import APIRouter, HTTPException
from ..models.types import RunCreate
from ..core.settings import Settings
from ..repos.runs_repo import RunsRepo
from ..services.mota import evaluate_mota

router = APIRouter()
settings = Settings()
runs_repo = RunsRepo(settings.DATA_ROOT)

@router.post("")
def create_run(run: RunCreate):
    run_id = runs_repo.create(run)
    return {"run_id": run_id}

@router.post("/{run_id}/evaluate")
def evaluate(run_id: str):
    run = runs_repo.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="run not found")
    result = evaluate_mota(data_root=settings.DATA_ROOT,
                           gt_id=run["gt_annotation_id"],
                           pred_id=run["pred_annotation_id"],
                           iou_thr=run.get("iou_threshold",0.5))
    runs_repo.save_metrics(run_id, result)
    return {"status":"done","run_id":run_id}