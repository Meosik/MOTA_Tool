import os
import uuid
from fastapi import APIRouter, UploadFile, File, Form
from app.core.settings import Settings
settings = Settings()

router = APIRouter()

@router.post("/annotations")
async def upload_annotation(kind: str = Form(...), file: UploadFile = File(...)):
    """Upload MOT-format annotation and return a new annotation_id.

    kind: 'gt' or 'pred' (no strict check here; the caller controls it).

    It saves into settings.DATA_ROOT / 'annotations' directory.
    """
    data_root = settings.DATA_ROOT
    save_dir = os.path.join(data_root, "annotations")
    os.makedirs(save_dir, exist_ok=True)

    raw = await file.read()
    suffix = uuid.uuid4().hex[:8]
    ann_id = f"{kind}_{suffix}"
    save_path = os.path.join(save_dir, f"{ann_id}.txt")

    with open(save_path, 'wb') as f:
        f.write(raw)

    return {"annotation_id": ann_id}