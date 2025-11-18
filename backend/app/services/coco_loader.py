"""COCO format annotation loader for MAP mode."""
import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from collections import defaultdict


def load_coco_annotations(filepath: Path) -> Tuple[Optional[Dict], Optional[Dict], Optional[Dict]]:
    """
    Load COCO format Ground Truth annotation file.
    
    Returns:
        Tuple of (images_dict, annotations_by_image, categories_dict)
        Returns (None, None, None) if loading fails.
    """
    if not filepath.exists():
        print(f"Error: GT annotation file not found - {filepath}")
        return None, None, None
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            coco_data = json.load(f)
        
        images = {img['id']: img for img in coco_data.get('images', [])}
        
        annotations = defaultdict(list)
        for ann in coco_data.get('annotations', []):
            annotations[ann['image_id']].append(ann)
        
        categories = {cat['id']: cat for cat in coco_data.get('categories', [])}
        
        print(f"GT loaded: {len(images)} images, {len(coco_data.get('annotations', []))} annotations")
        return images, dict(annotations), categories
        
    except Exception as e:
        print(f"Error loading GT annotation file: {e}")
        return None, None, None


def load_predictions(filepath: Path) -> Optional[Dict[int, List[Dict]]]:
    """
    Load model prediction annotation file.
    
    Returns:
        Dictionary mapping image_id to list of predictions, or None if loading fails.
    """
    if not filepath.exists():
        print(f"Error: Prediction annotation file not found - {filepath}")
        return None
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            predictions = json.load(f)
        
        # Group predictions by image_id
        predictions_by_image = defaultdict(list)
        for pred in predictions:
            formatted_pred = {
                "image_id": pred.get("image_id"),
                "category_id": int(pred.get("category_id")),
                "bbox": [float(c) for c in pred.get("bbox", [])],
                "score": float(pred.get("score")),
                "id": pred.get("id", None)
            }
            if formatted_pred["image_id"] is not None:
                predictions_by_image[formatted_pred["image_id"]].append(formatted_pred)
        
        print(f"Predictions loaded: {len(predictions)} predictions")
        return dict(predictions_by_image)
        
    except Exception as e:
        print(f"Error loading prediction annotation file: {e}")
        return None


def get_image_path(image_info: Dict, image_dir: Path) -> Optional[Path]:
    """Get image file path from image info and directory."""
    if not image_info or 'file_name' not in image_info:
        return None
    return image_dir / image_info['file_name']


def save_coco_predictions(predictions: List[Dict], filepath: Path) -> bool:
    """Save predictions in COCO format."""
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(predictions, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving predictions: {e}")
        return False
