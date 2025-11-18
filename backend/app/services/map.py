from pathlib import Path
from typing import List, Dict, Tuple, Optional
import numpy as np
from collections import defaultdict


def calculate_iou(box1: List[float], box2: List[float]) -> float:
    """
    Calculate IoU between two bounding boxes.
    Box format: [xmin, ymin, width, height]
    """
    x1_1, y1_1, w1, h1 = box1
    x1_2, y1_2 = x1_1 + w1, y1_1 + h1
    x2_1, y2_1, w2, h2 = box2
    x2_2, y2_2 = x2_1 + w2, y2_1 + h2
    
    # Calculate intersection coordinates
    xi_1 = max(x1_1, x2_1)
    yi_1 = max(y1_1, y2_1)
    xi_2 = min(x1_2, x2_2)
    yi_2 = min(y1_2, y2_2)
    
    # Calculate intersection area
    inter_width = max(0, xi_2 - xi_1)
    inter_height = max(0, yi_2 - yi_1)
    inter_area = inter_width * inter_height
    
    # Calculate each box area
    area1 = w1 * h1
    area2 = w2 * h2
    
    # Calculate union area
    union_area = area1 + area2 - inter_area
    
    if union_area == 0:
        return 0.0
    
    return inter_area / union_area


def voc_ap(rec, prec):
    """Compute VOC AP given precision and recall."""
    rec = np.concatenate(([0.], rec, [1.]))
    prec = np.concatenate(([0.], prec, [0.]))
    for i in range(prec.size - 1, 0, -1):
        prec[i - 1] = np.maximum(prec[i - 1], prec[i])
    i = np.where(rec[1:] != rec[:-1])[0]
    ap = np.sum((rec[i + 1] - rec[i]) * prec[i + 1])
    return ap


def get_pr_arrays(gt_annotations: List[Dict], pred_annotations: List[Dict], 
                  category_id: Optional[int] = None, iou_threshold: float = 0.5):
    """
    Calculate precision and recall arrays for given category.
    
    Args:
        gt_annotations: List of GT annotations
        pred_annotations: List of prediction annotations
        category_id: Specific category ID (None for all categories)
        iou_threshold: IoU threshold for TP/FP determination
    
    Returns:
        Tuple of (precision array, recall array, total GT count)
    """
    if category_id is not None:
        gt = [ann for ann in gt_annotations if ann.get('category_id') == category_id]
        preds = [pred for pred in pred_annotations if pred.get('category_id') == category_id]
    else:
        gt = gt_annotations
        preds = pred_annotations
    
    if not gt and not preds:
        return None, None, 0
    if not preds:
        return np.array([0.]), np.array([0.]), len(gt)
    if not gt:
        tp = np.zeros(len(preds))
        fp = np.ones(len(preds))
        nd = 0
    else:
        # Sort predictions by score descending
        preds = sorted(preds, key=lambda x: x.get('score', 0), reverse=True)
        
        nd = len(gt)
        tp = np.zeros(len(preds))
        fp = np.zeros(len(preds))
        gt_matched = np.zeros(len(gt))
        
        for i, pred in enumerate(preds):
            best_iou = 0.0
            best_gt_idx = -1
            pred_cat_id = pred.get('category_id')
            
            for j, gt_ann in enumerate(gt):
                if gt_ann.get('category_id') == pred_cat_id:
                    iou = calculate_iou(pred['bbox'], gt_ann['bbox'])
                    if iou > best_iou:
                        best_iou = iou
                        best_gt_idx = j
            
            if best_gt_idx != -1 and best_iou >= iou_threshold and not gt_matched[best_gt_idx]:
                tp[i] = 1.
                gt_matched[best_gt_idx] = 1
            else:
                fp[i] = 1.
    
    # Calculate precision and recall
    tp_cumsum = np.cumsum(tp)
    fp_cumsum = np.cumsum(fp)
    
    rec = tp_cumsum / (nd + 1e-10)
    prec = tp_cumsum / (tp_cumsum + fp_cumsum + 1e-10)
    
    return prec, rec, nd


def calculate_map(gt_annotations: List[Dict], pred_annotations: List[Dict], 
                  categories: Dict, iou_threshold: float = 0.5, 
                  confidence_threshold: float = 0.0) -> Tuple[float, Dict]:
    """
    Calculate mAP for given annotations and categories.
    
    Args:
        gt_annotations: List of GT annotations with category_id and bbox
        pred_annotations: List of predictions with category_id, bbox, and score
        categories: Dictionary mapping category_id to category info
        iou_threshold: IoU threshold for TP/FP determination
        confidence_threshold: Minimum confidence score for predictions
    
    Returns:
        Tuple of (mAP value, dict with per-class APs and details)
    """
    # Filter predictions by confidence threshold
    pred_annotations = [p for p in pred_annotations if p.get('score', 0) >= confidence_threshold]
    
    aps = {}
    pr_curves = {}
    
    if not categories:
        print("Warning: No categories provided")
        return 0.0, {}
    
    for category_id, category_info in categories.items():
        gt_cat = [ann for ann in gt_annotations if ann.get('category_id') == category_id]
        preds_cat = [pred for pred in pred_annotations if pred.get('category_id') == category_id]
        
        if not gt_cat and not preds_cat:
            continue
        
        prec, rec, nd = get_pr_arrays(gt_cat, preds_cat, category_id, iou_threshold)
        
        if prec is None or rec is None:
            ap = 0.0
        else:
            ap = voc_ap(rec, prec)
        
        aps[category_id] = ap
        pr_curves[category_id] = {
            'precision': prec.tolist() if prec is not None else [],
            'recall': rec.tolist() if rec is not None else [],
            'num_gt': nd
        }
    
    mean_ap = np.mean(list(aps.values())) if aps else 0.0
    
    return mean_ap, {
        'APs': aps, 
        'categories': list(categories.keys()),
        'pr_curves': pr_curves
    }


def evaluate_map(gt_boxes: List[Dict], pred_boxes: List[Dict], iou_thr: float = 0.5):
    """
    Legacy function for backward compatibility.
    gt_boxes: [{image_id, category, bbox}]
    pred_boxes: [{image_id, category, bbox, score}]
    """
    aps = []
    categories = set([g['category'] for g in gt_boxes])
    category_dict = {cat: {'name': cat} for cat in categories}
    
    # Convert to category_id format
    cat_to_id = {cat: idx for idx, cat in enumerate(categories)}
    gt_with_id = [{'category_id': cat_to_id[g['category']], 'bbox': g['bbox']} for g in gt_boxes]
    pred_with_id = [{'category_id': cat_to_id[p['category']], 'bbox': p['bbox'], 'score': p['score']} for p in pred_boxes]
    
    mAP, detail = calculate_map(gt_with_id, pred_with_id, {cat_to_id[cat]: {'name': cat} for cat in categories}, iou_thr)
    
    return mAP, {'APs': list(detail['APs'].values()), 'categories': list(categories)}
