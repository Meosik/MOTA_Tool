from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Any, Dict
from app.services.mota import evaluate_mota
from app.core.settings import Settings
settings = Settings()

router = APIRouter()

@router.websocket("/ws/preview")
async def ws_preview(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            req: Dict[str, Any] = await ws.receive_json()
            gt_id = req.get("gt_annotation_id")
            pred_id = req.get("pred_annotation_id")
            iou = float(req.get("iou_threshold", 0.5))

            if not gt_id or not pred_id:
                await ws.send_json({"error": "missing gt_annotation_id or pred_annotation_id"})
                continue

            try:
                result = evaluate_mota(settings.DATA_ROOT, gt_id, pred_id, iou)
            except FileNotFoundError:
                await ws.send_json({"error": "annotation id not found"})
                continue
            except Exception as e:
                await ws.send_json({"error": f"internal: {e}"})
                continue

            await ws.send_json(result)
    except WebSocketDisconnect:
        pass
