"""
API endpoints for mAP (mean Average Precision) calculation.
Supports object detection evaluation with COCO-style annotations.
"""
from fastapi import APIRouter, HTTPException
from typing import Dict, List
from ..models.types import (
    MapCalculateRequest,
    MapMetricsOut,
    Category,
    BBoxAnnotation
)
from ..services.map_calculator import (
    calculate_map,
    calculate_map_multi_image
)

router = APIRouter()


@router.post("/calculate", response_model=MapMetricsOut)
def calculate_map_endpoint(request: MapCalculateRequest):
    """
    Calculate mAP (mean Average Precision) for object detection.
    
    Accepts GT and prediction annotations along with category information,
    and returns mAP and per-class AP values.
    
    Args:
        request: MapCalculateRequest containing:
            - gt_annotations: List of ground truth annotations
            - pred_annotations: List of prediction annotations
            - categories: Dictionary of category information
            - iou_threshold: IoU threshold for TP/FP (default 0.5)
            - confidence_threshold: Minimum confidence for predictions (default 0.0)
    
    Returns:
        MapMetricsOut with mean_ap, class_aps, and metadata
    """
    try:
        # Filter predictions by confidence threshold
        filtered_preds = [
            pred for pred in request.pred_annotations
            if (pred.score or 1.0) >= request.confidence_threshold
        ]
        
        # Convert to dictionaries for calculator
        gt_list = [
            {
                'bbox': ann.bbox,
                'category_id': ann.category_id
            }
            for ann in request.gt_annotations
        ]
        
        pred_list = [
            {
                'bbox': ann.bbox,
                'category_id': ann.category_id,
                'score': ann.score or 1.0
            }
            for ann in filtered_preds
        ]
        
        categories_dict = {
            cat_id: {'id': cat.id, 'name': cat.name}
            for cat_id, cat in request.categories.items()
        }
        
        # Calculate mAP
        mean_ap, class_aps = calculate_map(
            gt_list,
            pred_list,
            categories_dict,
            request.iou_threshold
        )
        
        return MapMetricsOut(
            mean_ap=mean_ap,
            class_aps=class_aps,
            iou_threshold=request.iou_threshold,
            confidence_threshold=request.confidence_threshold,
            num_classes=len(class_aps)
        )
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to calculate mAP: {str(e)}"
        )


@router.post("/calculate-multi", response_model=MapMetricsOut)
def calculate_map_multi_endpoint(
    gt_annotations: Dict[int, List[BBoxAnnotation]],
    pred_annotations: Dict[int, List[BBoxAnnotation]],
    categories: Dict[int, Category],
    iou_threshold: float = 0.5,
    confidence_threshold: float = 0.0
):
    """
    Calculate mAP across multiple images.
    
    Args:
        gt_annotations: Dictionary mapping image_id to list of GT annotations
        pred_annotations: Dictionary mapping image_id to list of predictions
        categories: Dictionary of category information
        iou_threshold: IoU threshold for TP/FP (default 0.5)
        confidence_threshold: Minimum confidence for predictions (default 0.0)
    
    Returns:
        MapMetricsOut with mean_ap, class_aps, and metadata
    """
    try:
        # Convert to format expected by calculator
        gt_dict = {}
        for image_id, anns in gt_annotations.items():
            gt_dict[image_id] = [
                {
                    'bbox': ann.bbox,
                    'category_id': ann.category_id
                }
                for ann in anns
            ]
        
        pred_dict = {}
        for image_id, preds in pred_annotations.items():
            pred_dict[image_id] = [
                {
                    'bbox': pred.bbox,
                    'category_id': pred.category_id,
                    'score': pred.score or 1.0
                }
                for pred in preds
                if (pred.score or 1.0) >= confidence_threshold
            ]
        
        categories_dict = {
            cat_id: {'id': cat.id, 'name': cat.name}
            for cat_id, cat in categories.items()
        }
        
        # Calculate mAP
        mean_ap, class_aps = calculate_map_multi_image(
            gt_dict,
            pred_dict,
            categories_dict,
            iou_threshold
        )
        
        return MapMetricsOut(
            mean_ap=mean_ap,
            class_aps=class_aps,
            iou_threshold=iou_threshold,
            confidence_threshold=confidence_threshold,
            num_classes=len(class_aps)
        )
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to calculate mAP: {str(e)}"
        )
