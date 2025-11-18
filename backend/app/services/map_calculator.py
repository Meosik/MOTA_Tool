"""
mAP (mean Average Precision) calculator service.
Ported from Capstone_Team_MAP repository for object detection evaluation.
"""
import numpy as np
from typing import Dict, List, Tuple, Optional
from collections import defaultdict


def calculate_iou(box1: List[float], box2: List[float]) -> float:
    """
    Calculate IoU (Intersection over Union) between two bounding boxes.
    Box format: [xmin, ymin, width, height]
    
    Args:
        box1: First bounding box [x, y, w, h]
        box2: Second bounding box [x, y, w, h]
    
    Returns:
        IoU value between 0 and 1
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

    # Calculate individual box areas
    area1 = w1 * h1
    area2 = w2 * h2

    # Calculate union area
    union_area = area1 + area2 - inter_area

    if union_area == 0:
        return 0.0

    # Calculate IoU
    iou = inter_area / union_area
    return iou


def calculate_ap(rec: np.ndarray, prec: np.ndarray) -> float:
    """
    Calculate Average Precision (AP) from precision-recall curve.
    Uses all-point interpolation method.
    
    Args:
        rec: Recall array
        prec: Precision array
    
    Returns:
        Average Precision value
    """
    # Add sentinel values at the start and end
    mrec = np.concatenate(([0.], rec, [1.]))
    mpre = np.concatenate(([0.], prec, [0.]))

    # Make precision monotonically decreasing from right to left
    for i in range(len(mpre) - 2, -1, -1):
        mpre[i] = max(mpre[i], mpre[i + 1])

    # Calculate area under curve where recall changes
    i = np.where(mrec[1:] != mrec[:-1])[0]
    ap = np.sum((mrec[i + 1] - mrec[i]) * mpre[i + 1])
    return ap


def calculate_map(
    gt_annotations_img: List[Dict],
    pred_annotations_img: List[Dict],
    categories: Dict[int, Dict],
    iou_threshold: float = 0.5
) -> Tuple[float, Dict[int, float]]:
    """
    Calculate mAP for a single image or dataset.
    
    Args:
        gt_annotations_img: List of GT annotations, each with:
            {'bbox': [x, y, w, h], 'category_id': int}
        pred_annotations_img: List of prediction annotations, each with:
            {'bbox': [x, y, w, h], 'category_id': int, 'score': float}
        categories: Dictionary mapping category_id to category info:
            {cat_id: {'id': int, 'name': str}}
        iou_threshold: IoU threshold for TP/FP determination
    
    Returns:
        Tuple of (mean_ap, class_aps) where:
        - mean_ap: Mean Average Precision across all classes
        - class_aps: Dictionary mapping category_id to AP value
    """
    aps = {}
    
    if not categories:
        print("Warning: No category information provided")
        return 0.0, {}

    for category_id, category_info in categories.items():
        # Filter GT and predictions for current class
        gt = [ann for ann in gt_annotations_img if ann['category_id'] == category_id]
        preds = [pred for pred in pred_annotations_img if pred['category_id'] == category_id]

        # Skip if no GT and no predictions for this class
        if not gt and not preds:
            continue
            
        # If no predictions, AP is 0
        if not preds:
            aps[category_id] = 0.0
            continue
            
        # If no GT but predictions exist, all predictions are FP -> AP is 0
        if not gt:
            aps[category_id] = 0.0
            continue

        # Sort predictions by score in descending order
        preds.sort(key=lambda x: x['score'], reverse=True)

        nd = len(gt)  # Total number of GT for this class
        tp = np.zeros(len(preds))
        fp = np.zeros(len(preds))
        gt_matched = np.zeros(len(gt))  # Track which GTs have been matched

        for i, pred in enumerate(preds):
            best_iou = 0.0
            best_gt_idx = -1

            # Find GT with highest IoU for this prediction
            for j, gt_ann in enumerate(gt):
                iou = calculate_iou(pred['bbox'], gt_ann['bbox'])
                if iou > best_iou:
                    best_iou = iou
                    best_gt_idx = j

            # Mark as TP if IoU exceeds threshold and GT not already matched
            if best_iou >= iou_threshold and not gt_matched[best_gt_idx]:
                tp[i] = 1.
                gt_matched[best_gt_idx] = 1
            else:
                fp[i] = 1.

        # Calculate Precision and Recall
        tp_cumsum = np.cumsum(tp)
        fp_cumsum = np.cumsum(fp)

        rec = tp_cumsum / (nd + 1e-10)  # Recall
        prec = tp_cumsum / (tp_cumsum + fp_cumsum + 1e-10)  # Precision

        # Calculate AP
        ap = calculate_ap(rec, prec)
        aps[category_id] = ap

    # Calculate mAP (mean of all class APs)
    mean_ap = np.mean(list(aps.values())) if aps else 0.0

    return mean_ap, aps


def calculate_map_multi_image(
    gt_annotations: Dict[int, List[Dict]],
    pred_annotations: Dict[int, List[Dict]],
    categories: Dict[int, Dict],
    iou_threshold: float = 0.5
) -> Tuple[float, Dict[int, float]]:
    """
    Calculate mAP across multiple images.
    
    Args:
        gt_annotations: Dictionary mapping image_id to list of GT annotations
        pred_annotations: Dictionary mapping image_id to list of predictions
        categories: Dictionary mapping category_id to category info
        iou_threshold: IoU threshold for TP/FP determination
    
    Returns:
        Tuple of (mean_ap, class_aps)
    """
    # Aggregate all annotations across images per category
    all_gt_by_category = defaultdict(list)
    all_pred_by_category = defaultdict(list)
    
    # Get all unique image IDs from both GT and predictions
    all_image_ids = set(gt_annotations.keys()) | set(pred_annotations.keys())
    
    for image_id in all_image_ids:
        gt_anns = gt_annotations.get(image_id, [])
        pred_anns = pred_annotations.get(image_id, [])
        
        # Group by category
        for ann in gt_anns:
            all_gt_by_category[ann['category_id']].append({
                'image_id': image_id,
                'bbox': ann['bbox'],
                'category_id': ann['category_id']
            })
        
        for pred in pred_anns:
            all_pred_by_category[pred['category_id']].append({
                'image_id': image_id,
                'bbox': pred['bbox'],
                'category_id': pred['category_id'],
                'score': pred['score']
            })
    
    aps = {}
    
    for category_id in categories.keys():
        gt_list = all_gt_by_category[category_id]
        pred_list = all_pred_by_category[category_id]
        
        if not gt_list and not pred_list:
            continue
        
        if not pred_list:
            aps[category_id] = 0.0
            continue
        
        if not gt_list:
            aps[category_id] = 0.0
            continue
        
        # Sort predictions by score
        pred_list.sort(key=lambda x: x['score'], reverse=True)
        
        # Group GT by image for matching
        gt_by_image = defaultdict(list)
        for gt in gt_list:
            gt_by_image[gt['image_id']].append(gt)
        
        nd = len(gt_list)
        tp = np.zeros(len(pred_list))
        fp = np.zeros(len(pred_list))
        
        # Track matched GTs per image
        matched_gt = defaultdict(set)
        
        for i, pred in enumerate(pred_list):
            image_id = pred['image_id']
            image_gts = gt_by_image.get(image_id, [])
            
            best_iou = 0.0
            best_gt_idx = -1
            
            for j, gt in enumerate(image_gts):
                if j in matched_gt[image_id]:
                    continue
                    
                iou = calculate_iou(pred['bbox'], gt['bbox'])
                if iou > best_iou:
                    best_iou = iou
                    best_gt_idx = j
            
            if best_iou >= iou_threshold and best_gt_idx >= 0:
                tp[i] = 1.
                matched_gt[image_id].add(best_gt_idx)
            else:
                fp[i] = 1.
        
        tp_cumsum = np.cumsum(tp)
        fp_cumsum = np.cumsum(fp)
        
        rec = tp_cumsum / (nd + 1e-10)
        prec = tp_cumsum / (tp_cumsum + fp_cumsum + 1e-10)
        
        ap = calculate_ap(rec, prec)
        aps[category_id] = ap
    
    mean_ap = np.mean(list(aps.values())) if aps else 0.0
    
    return mean_ap, aps
