import os, json
from .database import SimpleKV

class AnnotationsRepo:
    def __init__(self, data_root: str):
        self.root = data_root
        self.kv = SimpleKV(data_root, "annotations")
        os.makedirs(os.path.join(self.root, "annotations"), exist_ok=True)

    def ensure_dir(self, sha: str):
        d = os.path.join(self.root, "annotations", sha)
        os.makedirs(d, exist_ok=True)
        return d

    def register(self, kind: str, sha: str, src_path: str):
        data = self.kv.read_all()
        # reuse id if exists
        for k,v in data.items():
            if v.get("sha")==sha:
                return k
        ann_id = self.kv.new_id()
        data[ann_id] = {"kind":kind, "sha":sha, "src":src_path}
        self.kv.write_all(data)
        return ann_id

    def exists_by_sha(self, sha: str)->bool:
        data = self.kv.read_all()
        return any(v.get("sha")==sha for v in data.values())

    def get_id_by_sha(self, sha: str):
        data = self.kv.read_all()
        for k,v in data.items():
            if v.get("sha")==sha:
                return k
        return None

    def read_normalized(self, ann_id: str):
        data = self.kv.read_all().get(ann_id)
        if not data: return None
        p = os.path.join(self.root, "annotations", data["sha"], "normalized.json")
        if not os.path.exists(p): return None
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)