import os, json
from collections import defaultdict
from .gating import iou_matrix, gate_matrix
from .match import hungarian_maximize_iou
from .events import accumulate_events

def _iter_frames(doc):
    # Very simplified: expects doc['tracks'][*]['frames'] with 't' and 'bbox'
    # Build per-time lists of GT and Pred by category ignored here.
    frames = defaultdict(lambda: {"gt": [], "pred": []})
    for kind, key in (("gt","gt"),("pred","pred")):
        pass

def _tracks_to_time_dict(doc):
    fdict = defaultdict(lambda: [])
    for tr in doc.get("tracks", []):
        for fr in tr.get("frames", []):
            fdict[round(float(fr["t"]), 3)].append({"id": tr["id"], "cat": tr.get("category",""), "bbox": fr["bbox"]})
    return fdict

def evaluate_mota(data_root: str, gt_id: str, pred_id: str, iou_thr: float=0.5) -> dict:
    # Load normalized docs
    gt_path = _ann_path(data_root, gt_id)
    pred_path = _ann_path(data_root, pred_id)
    with open(gt_path, "r", encoding="utf-8") as f:
        gt = json.load(f)
    with open(pred_path, "r", encoding="utf-8") as f:
        pred = json.load(f)

    gt_frames = _tracks_to_time_dict(gt)
    pred_frames = _tracks_to_time_dict(pred)
    times = sorted(set(gt_frames.keys()) | set(pred_frames.keys()))

    GT_total = 0
    FP_total = 0
    FN_total = 0
    IDSW_total = 0

    # ID association memory: gt_id -> pred_id at previous time
    assoc_prev = {}

    for t in times:
        g = [x["bbox"] for x in gt_frames.get(t, [])]
        p = [x["bbox"] for x in pred_frames.get(t, [])]
        GT_total += len(g)

        if len(g)==0 and len(p)==0:
            continue

        M = iou_matrix(g, p) if g and p else None
        matches = []
        if M is not None:
            G = gate_matrix(M, iou_thr)
            matches = hungarian_maximize_iou(G)

        TP, FP, FN = accumulate_events(matches, len(g), len(p))
        FP_total += FP
        FN_total += FN

        # crude ID switch counting using order index (since ids may not sync in skeleton)
        # In real impl: map GT track ids to matched Pred track ids.
        # Here we simulate with position indices to keep skeleton simple.
        current_assoc = {}
        for gi, pj, _ in matches:
            current_assoc[gi] = pj
            if gi in assoc_prev and assoc_prev[gi] != pj:
                IDSW_total += 1
        assoc_prev = current_assoc

    mota = 1.0 - ((FN_total + FP_total + IDSW_total) / GT_total) if GT_total>0 else 0.0
    return {
        "MOTA": round(mota, 6),
        "counts": {"GT": GT_total, "FP": FP_total, "FN": FN_total, "IDSW": IDSW_total},
        "settings": {"iou_threshold": iou_thr}
    }

def mota_preview(data_root: str, gt_id: str, pred_id: str, iou_thr: float=0.5) -> dict:
    # simply call evaluate_mota for now (optimization later)
    return evaluate_mota(data_root, gt_id, pred_id, iou_thr)

def _ann_path(root: str, ann_id: str) -> str:
    # ann_id -> sha lookup
    ann_index = os.path.join(root, "db", "annotations.json")
    with open(ann_index, "r", encoding="utf-8") as f:
        idx = json.load(f)
    meta = idx.get(ann_id)
    if not meta:
        raise FileNotFoundError("annotation id not found")
    return os.path.join(root, "annotations", meta["sha"], "normalized.json")