"""
COCO format annotation loader utility.
Supports loading COCO-style JSON annotations for object detection.
"""
import json
from typing import Dict, List, Tuple, Optional
from pathlib import Path
from collections import defaultdict


def load_coco_annotations(filepath: str) -> Tuple[
    Optional[Dict[int, dict]], 
    Optional[Dict[int, List[dict]]], 
    Optional[Dict[int, dict]]
]:
    """
    Load COCO format Ground Truth annotation file.
    
    Args:
        filepath: Path to COCO JSON file
    
    Returns:
        Tuple of (images_dict, annotations_dict, categories_dict) where:
        - images_dict: {image_id: image_info}
        - annotations_dict: {image_id: [list of annotations]}
        - categories_dict: {category_id: category_info}
    
    Returns (None, None, None) if loading fails.
    """
    path = Path(filepath)
    if not path.exists():
        print(f"Error: GT annotation file not found - {filepath}")
        return None, None, None
    
    try:
        with open(path, 'r') as f:
            coco_data = json.load(f)
        
        # Build images dictionary
        images = {img['id']: img for img in coco_data.get('images', [])}
        
        # Build annotations dictionary grouped by image_id
        annotations = defaultdict(list)
        for ann in coco_data.get('annotations', []):
            annotations[ann['image_id']].append(ann)
        
        # Build categories dictionary
        categories = {cat['id']: cat for cat in coco_data.get('categories', [])}
        
        print(f"GT loaded: {len(images)} images, "
              f"{len(coco_data.get('annotations', []))} annotations, "
              f"{len(categories)} categories")
        
        return images, dict(annotations), categories
    
    except Exception as e:
        print(f"Error loading GT annotation file: {e}")
        return None, None, None


def load_predictions(filepath: str) -> Optional[Dict[int, List[dict]]]:
    """
    Load model prediction annotations from COCO format file.
    
    Args:
        filepath: Path to predictions JSON file
    
    Returns:
        Dictionary mapping image_id to list of predictions:
        {image_id: [{'bbox': [...], 'category_id': int, 'score': float}, ...]}
        
    Returns None if loading fails.
    """
    path = Path(filepath)
    if not path.exists():
        print(f"Error: Prediction file not found - {filepath}")
        return None
    
    try:
        with open(path, 'r') as f:
            predictions = json.load(f)
        
        # Group predictions by image_id
        predictions_by_image = defaultdict(list)
        for pred in predictions:
            formatted_pred = {
                "image_id": pred.get("image_id"),
                "category_id": int(pred.get("category_id")),
                "bbox": [float(c) for c in pred.get("bbox", [])],
                "score": float(pred.get("score", 1.0)),
                "id": pred.get("id", None)  # Optional ID for tracking
            }
            if formatted_pred["image_id"] is not None:
                predictions_by_image[formatted_pred["image_id"]].append(formatted_pred)
        
        print(f"Predictions loaded: {len(predictions)} predictions for "
              f"{len(predictions_by_image)} images")
        
        return dict(predictions_by_image)
    
    except Exception as e:
        print(f"Error loading prediction file: {e}")
        return None


def save_predictions(predictions: List[dict], filepath: str) -> bool:
    """
    Save predictions to COCO format JSON file.
    
    Args:
        predictions: List of prediction dictionaries
        filepath: Output file path
    
    Returns:
        True if successful, False otherwise
    """
    try:
        path = Path(filepath)
        path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(path, 'w') as f:
            json.dump(predictions, f, indent=2)
        
        print(f"Predictions saved to: {filepath}")
        return True
    
    except Exception as e:
        print(f"Error saving predictions: {e}")
        return False


def get_image_path(image_info: dict, image_dir: str) -> Optional[str]:
    """
    Get full image path from image info and directory.
    
    Args:
        image_info: Image information dict with 'file_name' key
        image_dir: Base directory containing images
    
    Returns:
        Full path to image file, or None if info is invalid
    """
    if not image_info or 'file_name' not in image_info:
        return None
    
    return str(Path(image_dir) / image_info['file_name'])
