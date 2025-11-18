from fastapi import APIRouter, HTTPException
from ..models.types import RunCreate
from ..core.settings import Settings
from ..repos.runs_repo import RunsRepo
from ..services.map import evaluate_map
from ..services.mota import load_mot

router = APIRouter()
settings = Settings()
runs_repo = RunsRepo(settings.DATA_ROOT)

@router.post("/{run_id}/evaluate_map")
def evaluate_map_run(run_id: str):
    run = runs_repo.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="run not found")
    # GT/PRED 파일 경로
    gt_path = settings.DATA_ROOT + f"/annotations/{run['gt_annotation_id']}.txt"
    pred_path = settings.DATA_ROOT + f"/annotations/{run['pred_annotation_id']}.txt"
    # MOT 파일 파싱
    gt_frames = load_mot(Path(gt_path))
    pred_frames = load_mot(Path(pred_path))
    # GT/PRED를 mAP 포맷으로 변환
    gt_boxes = []
    pred_boxes = []
    for f, boxes in gt_frames.items():
        for b in boxes:
            gt_boxes.append({
                'image_id': f,
                'category': 'default',
                'bbox': [b[1], b[2], b[3], b[4]]
            })
    for f, boxes in pred_frames.items():
        for b in boxes:
            pred_boxes.append({
                'image_id': f,
                'category': 'default',
                'bbox': [b[1], b[2], b[3], b[4]],
                'score': b[5]
            })
    mAP, detail = evaluate_map(gt_boxes, pred_boxes, iou_thr=run.get('iou_threshold',0.5))
    result = {'mAP': mAP, 'detail': detail}
    runs_repo.save_metrics(run_id, result)
    return {'status': 'done', 'run_id': run_id}
