def accumulate_events(matches, gt_count, pred_count):
    # matches: list of (gi, pj, iou)
    matched_gt = {gi for gi,_,_ in matches}
    matched_pred = {pj for _,pj,_ in matches}
    TP = len(matches)
    FN = gt_count - len(matched_gt)
    FP = pred_count - len(matched_pred)
    return TP, FP, FN