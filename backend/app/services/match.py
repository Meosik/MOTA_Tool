import numpy as np
from scipy.optimize import linear_sum_assignment

def hungarian_maximize_iou(M):
    # Convert to cost (maximize IOU -> minimize (1-IOU)), invalid=-1 treated as large cost
    cost = 1.0 - M
    cost[M < 0] = 1e6  # gate invalid
    ri, ci = linear_sum_assignment(cost)
    matches = []
    for r,c in zip(ri,ci):
        if M[r,c] >= 0:
            matches.append((r,c,M[r,c]))
    return matches