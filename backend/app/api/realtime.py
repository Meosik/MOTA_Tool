# backend/app/api/realtime.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
from app.core.config import settings
from app.services.mota import evaluate_mota, evaluate_mota_detailed
from app.repos.ann_repo import AnnotationsRepo
from app.services.overlay_stream import slice_tracks
from pathlib import Path
import csv

router = APIRouter(prefix="/ws", tags=["ws"])
ann_repo = AnnotationsRepo(settings.DATA_ROOT)

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

            # use detailed evaluator to get idsw frames for the preview websocket
            mota, stats, _idsw_frames, _details = evaluate_mota_detailed(gt_path, pr_path, iou_thr, conf_thr)
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

@router.websocket("/tracks")
async def ws_tracks(ws: WebSocket):
    """프론트로 트랙 박스를 청크 단위 스트림 전송.
    초기 메시지(JSON): {
      "type":"subscribe",
      "annotations":[{"kind":"gt","id":"..."},{"kind":"pred","id":"..."}],
      "f0": 1, "f1": 300, "chunk": 50
    }
    응답 청크: {"type":"chunk","range":{"f0":<int>,"f1":<int>},"tracks":[{"kind":"gt","id":...,"tracks":[...]},{"kind":"pred",...}]}
    완료: {"type":"done"}
    중지: 클라이언트가 {"type":"stop"} 전송.
    """
    await ws.accept()
    try:
        # 대기: 초기 설정 수신
        raw = await ws.receive_text()
        try:
            payload = json.loads(raw)
        except Exception:
            await ws.send_text(json.dumps({"error":"invalid JSON"}))
            return
        if payload.get("type") != "subscribe":
            await ws.send_text(json.dumps({"error":"first message must be subscribe"}))
            return
        ann_list = payload.get("annotations", [])
        f0 = int(payload.get("f0", 0))
        f1 = int(payload.get("f1", f0))
        chunk = int(payload.get("chunk", 50))
        if chunk <= 0:
            chunk = 50
        # 정렬/범위 보정
        lo = min(f0, f1)
        hi = max(f0, f1)

        # 각 annotation 전체 doc 로드 (normalized 우선, fallback MOT/JSON)
        docs: dict[str, dict] = {}
        for ann in ann_list:
            ann_id = ann.get("id")
            kind = ann.get("kind")
            if not ann_id or kind not in ("gt","pred"):
                continue
            doc = ann_repo.read_normalized(ann_id)
            if doc is None:
                # fallback: 디스크 파싱 (txt / json)
                ann_dir = Path(settings.DATA_ROOT)/"annotations"
                cand_txt = ann_dir / f"{ann_id}.txt"
                cand_json = ann_dir / f"{ann_id}.json"
                parsed = {"tracks": []}
                if cand_txt.exists():
                    tracks: dict[int, list[dict]] = {}
                    with cand_txt.open("r", encoding="utf-8") as fp:
                        reader = csv.reader(fp)
                        for row in reader:
                            if not row:
                                continue
                            try:
                                fr = int(float(row[0]))
                                tid = int(float(row[1]))
                                x = float(row[2]); y = float(row[3]); w = float(row[4]); h = float(row[5])
                                conf = float(row[6]) if len(row) > 6 and row[6] not in ("", None) else 1.0
                            except Exception:
                                continue
                            tracks.setdefault(tid, []).append({"f": fr, "bbox": [x,y,w,h], "conf": conf})
                    parsed = {"tracks": [{"id": k, "frames": sorted(v, key=lambda a: a["f"])} for k,v in sorted(tracks.items())]}
                elif cand_json.exists():
                    try:
                        import json as _json
                        with cand_json.open("r", encoding="utf-8") as fp:
                            data = _json.load(fp)
                        if isinstance(data, dict) and "tracks" in data:
                            parsed = data
                        else:
                            tracks = {}
                            ann_list_json = []
                            if isinstance(data, list):
                                ann_list_json = data
                            elif isinstance(data, dict) and "annotations" in data:
                                ann_list_json = data["annotations"]
                            for r in ann_list_json:
                                tid = r.get("id", 0)
                                frame = r.get("image_id", 0)
                                box = r.get("bbox", [0,0,0,0])
                                conf = r.get("score", 1.0)
                                tracks.setdefault(tid, []).append({"f": frame, "bbox": box, "conf": conf})
                            parsed = {"tracks": [{"id": k, "frames": sorted(v, key=lambda a: a["f"])} for k,v in sorted(tracks.items())]}
                    except Exception:
                        parsed = {"tracks": []}
                doc = parsed
            docs[ann_id] = doc

        # 청크 단위 전송
        cur = lo
        while cur <= hi:
            # 중지 메시지 체크 (논블로킹 시도 대신 poll timeout 순차 적용 단순화)
            # 클라이언트가 stop을 보낼 경우 처리하기 위해 optional receive with timeout 구현 가능
            # 여기서는 간단히 try/except로 즉시 수신 텍스트 검사 (WebSocket API 제한 고려)
            try:
                # non-blocking receive_text는 FastAPI에서 직접 제공되지 않아 간단 stop 프로토콜은 별도 메시지로.
                pass
            except Exception:
                pass
            chunk_hi = min(hi, cur + chunk - 1)
            ann_payloads = []
            for ann in ann_list:
                ann_id = ann.get("id")
                kind = ann.get("kind")
                if ann_id not in docs:
                    continue
                sliced = slice_tracks(docs[ann_id], float(cur), float(chunk_hi))
                ann_payloads.append({"kind": kind, "id": ann_id, "tracks": sliced.get("tracks", [])})
            msg = {"type":"chunk", "range": {"f0": cur, "f1": chunk_hi}, "tracks": ann_payloads}
            await ws.send_text(json.dumps(msg))
            cur = chunk_hi + 1
        await ws.send_text(json.dumps({"type":"done"}))
    except WebSocketDisconnect:
        pass
