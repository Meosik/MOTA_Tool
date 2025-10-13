from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..core.settings import Settings
from ..repos.ann_repo import AnnotationsRepo
from ..services.mota import mota_preview

router = APIRouter()
settings = Settings()
ann_repo = AnnotationsRepo(settings.DATA_ROOT)

@router.websocket("/preview")
async def ws_preview(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            data = await ws.receive_json()
            iou = float(data.get("iou_threshold", 0.5))
            gt_id = data.get("gt_annotation_id")
            pred_id = data.get("pred_annotation_id")
            result = mota_preview(settings.DATA_ROOT, gt_id, pred_id, iou)
            await ws.send_json(result)
    except WebSocketDisconnect:
        pass