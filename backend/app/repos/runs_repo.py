import os, json
from .database import SimpleKV

class RunsRepo:
    def __init__(self, data_root: str):
        self.root = data_root
        self.kv = SimpleKV(data_root, "runs")

    def create(self, run: dict):
        run_id = self.kv.new_id()
        data = self.kv.read_all()
        data[run_id] = {
            "gt_annotation_id": run.gt_annotation_id,
            "pred_annotation_id": run.pred_annotation_id,
            "iou_threshold": run.iou_threshold,
            "project_id": run.project_id,
        }
        self.kv.write_all(data)
        return run_id

    def get(self, run_id: str):
        return self.kv.read_all().get(run_id)

    def save_metrics(self, run_id: str, metrics: dict):
        run_dir = os.path.join(self.root, "runs", run_id)
        os.makedirs(run_dir, exist_ok=True)
        with open(os.path.join(run_dir, "metrics.json"), "w") as f:
            json.dump(metrics, f, ensure_ascii=False, indent=2)