# Tracker Eval (Local WebApp + Local Server)

- **Frontend**: React + Vite (local web app UI)
- **Backend**: FastAPI (MOTA computation), runs on `127.0.0.1:8000`
- **Video**: Not uploaded. Users select local video files and the browser plays them via `blob:` URL.
- **Annotations**: GT/Prediction uploaded **locally to the local API** for normalization/evaluation (stored under `appdata/`).

## Quick Start (Docker Compose - Dev)
```bash
cp infra/env/backend.local.env backend/.env
cp infra/env/frontend.local.env frontend/.env

docker compose -f infra/docker-compose.yml up --build
# Frontend: http://localhost:5173
# Backend:  http://127.0.0.1:8000/docs
```