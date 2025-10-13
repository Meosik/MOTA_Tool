import os, json, uuid

class SimpleKV:
    def __init__(self, root: str, name: str):
        self.path = os.path.join(root, "db", f"{name}.json")
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        if not os.path.exists(self.path):
            with open(self.path, "w") as f:
                json.dump({}, f)
    def read_all(self):
        with open(self.path, "r") as f:
            return json.load(f)
    def write_all(self, data):
        with open(self.path, "w") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    def new_id(self):
        return uuid.uuid4().hex[:12]