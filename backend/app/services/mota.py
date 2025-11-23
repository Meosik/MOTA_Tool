# backend/app/services/mota.py
from pathlib import Path
from typing import List, Dict, Tuple
try:
    from scipy.optimize import linear_sum_assignment  # Hungarian algorithm
    _SCIPY_OK = True
except Exception:
    _SCIPY_OK = False

def parse_line(line: str):
    parts = [p.strip() for p in line.strip().split(",")]
    if len(parts) < 6:
        return None
    try:
        f = int(float(parts[0]))
        i = int(float(parts[1]))
        x = float(parts[2]); y = float(parts[3])
        w = float(parts[4]); h = float(parts[5])
        return (f, i, x, y, w, h)
    except Exception:
        return None

def load_mot(path: Path) -> Dict[int, List[Tuple[int,float,float,float,float,float]]]:
    # Returns frames: { frame_id: [ (track_id, x, y, w, h, conf), ... ] }
    frames: Dict[int, List[Tuple[int,float,float,float,float,float]]] = {}
    text = path.read_text(encoding="utf-8", errors="ignore")
    for raw in text.splitlines():
        if not raw or raw.lstrip().startswith("#"):
            continue
        rec = parse_line(raw)
        if rec is None:
            continue
        # parse_line returns (f, id, x, y, w, h) -- but the MOT row may include
        # additional columns (confidence at index 6). We treat confidence as optional
        # and default to 1.0 for GT entries.
        f, i, x, y, w, h = rec
        conf = 1.0
        parts = [p.strip() for p in raw.strip().split(',')]
        if len(parts) > 6 and parts[6] not in ("", None):
            try:
                conf = float(parts[6])
            except Exception:
                conf = 1.0
        frames.setdefault(f, []).append((i, x, y, w, h, conf))
    return frames

def iou(a, b) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ax2, ay2 = ax + aw, ay + ah
    bx2, by2 = bx + bw, by + bh
    inter_w = max(0.0, min(ax2, bx2) - max(ax, bx))
    inter_h = max(0.0, min(ay2, by2) - max(ay, by))
    inter = inter_w * inter_h
    if inter <= 0: return 0.0
    union = aw*ah + bw*bh - inter
    if union <= 0: return 0.0
    return inter / union

def match_hungarian(preds: List[Tuple[int,float,float,float,float,float]],
                    gts: List[Tuple[int,float,float,float,float,float]],
                    thr: float):
    """Hungarian (linear sum assignment) 매칭.
    IoU 기반 cost = 1 - IoU. IoU < thr 인 경우 cost=1 (최대)로 설정 후 필터링 단계에서 제거.
    반환: ([(gt_id, pred_id), ...], [unmatched_gt_ids], [unmatched_pred_ids])
    SciPy 미사용 환경이면 그리디 방식 폴백.
    """
    if not preds or not gts:
        return [], [g[0] for g in gts], [p[0] for p in preds]
    if not _SCIPY_OK:
        # 폴백: 기존 그리디 (기존 함수 로직 간단 재현)
        pairs = []
        used_p = set(); used_g = set(); matches = []
        for gi, gt in enumerate(gts):
            gx, gy, gw, gh = gt[1], gt[2], gt[3], gt[4]
            for pi, pr in enumerate(preds):
                px, py, pw, ph = pr[1], pr[2], pr[3], pr[4]
                ov = iou((gx,gy,gw,gh), (px,py,pw,ph))
                if ov >= thr:
                    pairs.append((ov, gi, pi))
        pairs.sort(reverse=True, key=lambda t: t[0])
        for ov, gi, pi in pairs:
            if gi in used_g or pi in used_p:
                continue
            used_g.add(gi); used_p.add(pi)
            matches.append((gts[gi][0], preds[pi][0]))
        unmatched_g = [gts[i][0] for i in range(len(gts)) if i not in used_g]
        unmatched_p = [preds[i][0] for i in range(len(preds)) if i not in used_p]
        return matches, unmatched_g, unmatched_p

    import numpy as np
    G = len(gts); P = len(preds)
    cost = np.ones((G, P), dtype=float)  # 기본 cost=1 (worst)
    iou_mat = np.zeros((G, P), dtype=float)
    for gi, gt in enumerate(gts):
        gx, gy, gw, gh = gt[1], gt[2], gt[3], gt[4]
        for pi, pr in enumerate(preds):
            px, py, pw, ph = pr[1], pr[2], pr[3], pr[4]
            ov = iou((gx,gy,gw,gh), (px,py,pw,ph))
            iou_mat[gi, pi] = ov
            if ov >= thr:
                cost[gi, pi] = 1.0 - ov  # IoU 높을수록 cost 낮음
    row_ind, col_ind = linear_sum_assignment(cost)
    matches = []
    used_g = set(); used_p = set()
    for gi, pi in zip(row_ind, col_ind):
        ov = iou_mat[gi, pi]
        if ov >= thr:
            matches.append((gts[gi][0], preds[pi][0]))
            used_g.add(gi); used_p.add(pi)
    unmatched_g = [gts[i][0] for i in range(G) if i not in used_g]
    unmatched_p = [preds[i][0] for i in range(P) if i not in used_p]
    return matches, unmatched_g, unmatched_p

def evaluate_mota(gt_path: Path, pred_path: Path, iou_thr: float, conf_thr: float = 0.0):
    gt_frames = load_mot(gt_path)
    pr_frames = load_mot(pred_path)

    all_frames = sorted(set(gt_frames.keys()) | set(pr_frames.keys()))
    TP = FP = FN = IDSW = 0
    total_gt = 0
    assign = {}  # gt id -> last matched pred id

    for f in all_frames:
        gts = gt_frames.get(f, [])
        prs_all = pr_frames.get(f, [])
        # apply confidence threshold filter (pred entries may include conf at index 5)
        prs = [p for p in prs_all if float(p[5]) >= conf_thr]
        total_gt += len(gts)

        matches, un_g, un_p = match_hungarian(prs, gts, iou_thr)
        TP += len(matches)
        FN += len(un_g)
        FP += len(un_p)

        for (gt_id, pred_id) in matches:
            if gt_id in assign and assign[gt_id] != pred_id:
                IDSW += 1
            assign[gt_id] = pred_id

    mota = 1.0
    if total_gt > 0:
        mota = 1.0 - (FN + FP + IDSW) / float(total_gt)
    return mota, {"TP": TP, "FP": FP, "FN": FN, "IDSW": IDSW}

def evaluate_mota_detailed(
    gt_path: Path,
    pred_path: Path,
    iou_thr: float,
    conf_thr: float = 0.0
):
    gt_frames = load_mot(gt_path)
    pr_frames = load_mot(pred_path)

    all_frames = sorted(set(gt_frames.keys()) | set(pr_frames.keys()))
    TP = FP = FN = IDSW = 0
    total_gt = 0
    assign: Dict[int, int] = {}     # gt id -> last matched pred id
    idsw_frames: List[int] = []

    per_frame: List[Dict] = []      # ← 프레임별 요약 저장

    for f in all_frames:
        gts = gt_frames.get(f, [])
        prs_all = pr_frames.get(f, [])
        # conf 필터
        prs = [p for p in prs_all if float(p[5]) >= conf_thr]

        total_gt += len(gts)

        matches, un_g, un_p = match_hungarian(prs, gts, iou_thr)
        tp = len(matches)
        fn = len(un_g)
        fp = len(un_p)

        TP += tp; FN += fn; FP += fp

        # IDSW 판정
        changed = False
        cur_map: Dict[int,int] = {}
        for (gt_id, pred_id) in matches:
            cur_map[gt_id] = pred_id
            if gt_id in assign and assign[gt_id] != pred_id:
                IDSW += 1
                changed = True
        if changed:
            idsw_frames.append(f)
        assign.update(cur_map)

        per_frame.append({
            "f": f,
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "idsw": changed,
            "gt": len(gts),
            "pred": len(prs),
        })

    mota = 1.0 if total_gt == 0 else (1.0 - (FN + FP + IDSW) / float(total_gt))
    stats = {"TP": TP, "FP": FP, "FN": FN, "IDSW": IDSW, "total_gt": total_gt}
    return mota, stats, idsw_frames, per_frame