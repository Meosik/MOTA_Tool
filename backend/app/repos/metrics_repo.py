import os, json

class MetricsRepo:
    def __init__(self, data_root: str):
        self.root = data_root
    def read(self, run_id: str):
        p = os.path.join(self.root, "runs", run_id, "metrics.json")
        if not os.path.exists(p): return None
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)