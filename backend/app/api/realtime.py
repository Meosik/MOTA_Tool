# backend/app/api/realtime.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
from app.core.config import settings
from app.services.mota import evaluate_mota

router = APIRouter(prefix="/ws", tags=["ws"])

@router.websocket("/preview")
async def ws_preview(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            raw = await ws.receive_text()
            try:
                payload = json.loads(raw)
            except Exception:
                await ws.send_text(json.dumps({"error":"invalid JSON"}))
                continue

            gt_id   = payload.get("gt_id")
            pred_id = payload.get("pred_id")
            iou_thr = payload.get("iou", 0.5)
            conf_thr= payload.get("conf", 0.0)

            try:    iou_thr = float(iou_thr)
            except: iou_thr = 0.5
            try:    conf_thr = float(conf_thr)
            except: conf_thr = 0.0

            if not gt_id or not pred_id:
                await ws.send_text(json.dumps({"error":"gt_id/pred_id required"}))
                continue

            root = settings.DATA_ROOT / "annotations"
            gt_path = root / f"{gt_id}.txt"
            pr_path = root / f"{pred_id}.txt"
            if not gt_path.exists() or not pr_path.exists():
                await ws.send_text(json.dumps({"error":"annotation id not found"}))
                continue

            mota, stats, _idsw_frames = evaluate_mota(gt_path, pr_path, iou_thr, conf_thr)
            resp = {
                "MOTA": mota,
                "TP": stats["TP"],
                "FP": stats["FP"],
                "FN": stats["FN"],
                "IDSW": stats["IDSW"],
            }
            await ws.send_text(json.dumps(resp))
    except WebSocketDisconnect:
        pass
