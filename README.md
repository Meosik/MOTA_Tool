# Tracker Eval (Local WebApp + Local Server)

A local evaluation tool for object tracking and detection with two modes:
- **MOTA Mode**: Multi-Object Tracking Accuracy evaluation with video playback
- **MAP Mode**: Mean Average Precision calculation for object detection

## Features

- **Frontend**: React + Vite (local web app UI)
- **Backend**: FastAPI (MOTA/mAP computation), runs on `127.0.0.1:8000`
- **MOTA Mode**:
  - Video playback with annotation overlay
  - Real-time tracking metrics (MOTA, MOTP, ID switches)
  - Interactive frame-by-frame analysis
  - Video files selected locally (not uploaded)
- **MAP Mode**: 
  - COCO format annotation support
  - Per-class Average Precision
  - Interactive bounding box editing
  - Configurable confidence and IoU thresholds
- **Annotations**: GT/Prediction uploaded **locally to the local API** for normalization/evaluation (stored under `appdata/`).

## Quick Start (Docker Compose - Dev)
```bash
cp infra/env/backend.local.env backend/.env
cp infra/env/frontend.local.env frontend/.env

docker compose -f infra/docker-compose.yml up --build
# Frontend: http://localhost:5173
# Backend:  http://127.0.0.1:8000/docs
```
## Mode Switching

The application supports two evaluation modes accessible through the mode selector in the top bar:

### MOTA Mode (Default)
For evaluating multi-object tracking performance:
1. Upload video file
2. Upload GT and prediction annotations (MOT format)
3. View real-time tracking metrics
4. Analyze frame-by-frame results
5. Export results

### MAP Mode
For evaluating object detection performance:
1. Upload image folder
2. Upload GT annotations (COCO JSON format)
3. Upload predictions (COCO JSON format)
4. Adjust confidence and IoU thresholds
5. View mAP and per-class AP metrics
6. Edit bounding boxes interactively (optional)
7. Export edited predictions

## Documentation

- **[MAP Mode Integration Guide](MAP_MODE_INTEGRATION.md)** - Detailed MAP mode usage
- **[Implementation Summary](IMPLEMENTATION_SUMMARY.md)** - Technical implementation details
- **[Architecture](ARCHITECTURE.md)** - System architecture and design

## Supported Annotation Formats

### MOTA Mode
- **Input**: MOT format (CSV/TXT)
  ```
  frame_id,track_id,x,y,width,height,confidence,-1,-1,-1
  ```

### MAP Mode
- **Input**: COCO JSON format
  ```json
  {
    "images": [...],
    "annotations": [...],
    "categories": [...]
  }
  ```
- **Output**: COCO JSON format with edited predictions
