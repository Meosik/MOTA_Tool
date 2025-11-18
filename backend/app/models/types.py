from pydantic import BaseModel
from typing import List, Literal, Optional, Dict

class FrameBox(BaseModel):
    t: float
    bbox: list[float]
    score: Optional[float] = None

class Track(BaseModel):
    id: int
    category: str
    score: Optional[float] = None
    frames: List[FrameBox]

class AnnotationDoc(BaseModel):
    video: dict
    categories: List[str]
    tracks: List[Track]

class RunCreate(BaseModel):
    project_id: Optional[str] = None
    gt_annotation_id: str
    pred_annotation_id: str
    iou_threshold: float = 0.5

class MetricsOut(BaseModel):
    MOTA: float
    counts: dict
    settings: dict

class Category(BaseModel):
    """Category/class information for object detection"""
    id: int
    name: str
    supercategory: Optional[str] = None

class BBoxAnnotation(BaseModel):
    """Single bounding box annotation for mAP calculation"""
    bbox: List[float]  # [x, y, width, height]
    category_id: int
    score: Optional[float] = None  # For predictions
    image_id: Optional[int] = None

class MapCalculateRequest(BaseModel):
    """Request body for mAP calculation"""
    gt_annotations: List[BBoxAnnotation]
    pred_annotations: List[BBoxAnnotation]
    categories: Dict[int, Category]
    iou_threshold: float = 0.5
    confidence_threshold: float = 0.0

class MapMetricsOut(BaseModel):
    """mAP calculation results"""
    mean_ap: float
    class_aps: Dict[int, float]  # category_id -> AP
    iou_threshold: float
    confidence_threshold: float
    num_classes: int