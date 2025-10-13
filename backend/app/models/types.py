from pydantic import BaseModel
from typing import List, Literal, Optional

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