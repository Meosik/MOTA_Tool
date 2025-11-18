from fastapi import APIRouter, HTTPException, Query
from pathlib import Path
from typing import Optional
from ..core.settings import Settings
from ..services.map import calculate_map, evaluate_map
from ..services.coco_loader import load_coco_annotations, load_predictions
from ..services.mota import load_mot

router = APIRouter()
settings = Settings()

@router.get("/calculate")
def calculate_map_metrics(
    gt_id: str = Query(..., description="GT annotation ID"),
    pred_id: str = Query(..., description="Prediction annotation ID"),
    iou: float = Query(0.5, ge=0.05, le=0.95, description="IoU threshold"),
    conf: float = Query(0.0, ge=0.0, le=1.0, description="Confidence threshold")
):
    """Calculate mAP metrics for given GT and prediction annotations."""
    gt_path = Path(settings.DATA_ROOT) / "annotations" / f"{gt_id}.json"
    pred_path = Path(settings.DATA_ROOT) / "annotations" / f"{pred_id}.json"
    
    # Try COCO format first
    if gt_path.exists() and pred_path.exists():
        images, gt_annotations_by_img, categories = load_coco_annotations(gt_path)
        pred_annotations_by_img = load_predictions(pred_path)
        
        if images is not None and gt_annotations_by_img is not None and pred_annotations_by_img is not None:
            # Flatten annotations for mAP calculation
            gt_anns = []
            for img_id, anns in gt_annotations_by_img.items():
                gt_anns.extend(anns)
            
            pred_anns = []
            for img_id, anns in pred_annotations_by_img.items():
                pred_anns.extend(anns)
            
            mAP, detail = calculate_map(gt_anns, pred_anns, categories, iou, conf)
            
            # Format response with category names
            class_aps = {}
            for cat_id, ap in detail['APs'].items():
                cat_name = categories.get(cat_id, {}).get('name', f'class_{cat_id}')
                class_aps[cat_name] = ap
            
            return {
                'mAP': mAP,
                'class_aps': class_aps,
                'pr_curves': detail.get('pr_curves', {}),
                'num_categories': len(categories),
                'num_images': len(images)
            }
    
    # Fallback to MOT format for backward compatibility
    gt_path_txt = Path(settings.DATA_ROOT) / "annotations" / f"{gt_id}.txt"
    pred_path_txt = Path(settings.DATA_ROOT) / "annotations" / f"{pred_id}.txt"
    
    if gt_path_txt.exists() and pred_path_txt.exists():
        gt_frames = load_mot(gt_path_txt)
        pred_frames = load_mot(pred_path_txt)
        
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
                    'score': b[5] if len(b) > 5 else 1.0
                })
        
        mAP, detail = evaluate_map(gt_boxes, pred_boxes, iou_thr=iou)
        return {
            'mAP': mAP,
            'class_aps': {'default': mAP},
            'detail': detail
        }
    
    raise HTTPException(status_code=404, detail="Annotation files not found")
