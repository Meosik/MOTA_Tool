# MAP Mode Testing Guide

## 🎯 목적 (Purpose)
이 문서는 MAP mode의 end-to-end 워크플로우를 테스트하기 위한 가이드입니다.

## 📋 사전 준비 (Prerequisites)

### 1. 테스트 환경 설정

#### Option A: Docker Compose (권장)
```bash
# 환경 변수 설정
cp infra/env/backend.local.env backend/.env
cp infra/env/frontend.local.env frontend/.env

# 빌드 및 실행
docker compose -f infra/docker-compose.yml up --build

# 접속
# Frontend: http://localhost:5173
# Backend API: http://127.0.0.1:8000/docs
```

#### Option B: 로컬 개발 환경
```bash
# Terminal 1: Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Terminal 2: Frontend
cd frontend
npm install
npm run dev

# 접속
# Frontend: http://localhost:5173
```

### 2. 테스트 데이터 준비

#### 방법 1: 간단한 테스트 데이터 직접 생성

**1) 테스트 이미지 생성**
```bash
mkdir -p test_data/images
# 아무 이미지나 test_data/images/test_image_001.jpg 로 저장
```

**2) GT annotations (COCO format)**
`test_data/gt_annotations.json`:
```json
{
  "images": [
    {
      "id": 1,
      "file_name": "test_image_001.jpg",
      "width": 640,
      "height": 480
    }
  ],
  "annotations": [
    {
      "id": 1,
      "image_id": 1,
      "category_id": 1,
      "bbox": [100, 100, 150, 150],
      "area": 22500,
      "iscrowd": 0
    },
    {
      "id": 2,
      "image_id": 1,
      "category_id": 2,
      "bbox": [300, 200, 120, 100],
      "area": 12000,
      "iscrowd": 0
    }
  ],
  "categories": [
    {"id": 1, "name": "person", "supercategory": "person"},
    {"id": 2, "name": "car", "supercategory": "vehicle"}
  ]
}
```

**3) Predictions (COCO format)**
`test_data/predictions.json`:
```json
[
  {
    "image_id": 1,
    "category_id": 1,
    "bbox": [105, 105, 145, 145],
    "score": 0.95
  },
  {
    "image_id": 1,
    "category_id": 2,
    "bbox": [305, 205, 115, 95],
    "score": 0.88
  },
  {
    "image_id": 1,
    "category_id": 1,
    "bbox": [500, 50, 80, 120],
    "score": 0.72
  }
]
```

#### 방법 2: COCO Validation Dataset 사용
```bash
# COCO val2017 일부 다운로드
mkdir -p test_data/coco_val2017
cd test_data/coco_val2017

# 이미지 및 annotations 다운로드 (선택적)
# https://cocodataset.org/#download
```

## 🧪 테스트 시나리오

### Test Case 1: 기본 워크플로우

#### 1단계: 모드 전환
- [x] 브라우저에서 http://localhost:5173 접속
- [x] 상단 바에서 "MAP" 모드 선택
- **예상 결과**: MAP mode 페이지가 표시됨

#### 2단계: 이미지 폴더 업로드
- [x] 왼쪽 사이드바에서 "Upload Folder" 버튼 클릭
- [x] `test_data/images` 폴더 선택
- **예상 결과**: 
  - 이미지 목록이 사이드바에 표시됨
  - 이미지 개수가 표시됨

#### 3단계: GT Annotations 업로드
- [x] 오른쪽 컨트롤 패널에서 "Upload GT" 버튼 클릭
- [x] `test_data/gt_annotations.json` 파일 선택
- **예상 결과**:
  - 업로드 성공 메시지
  - 카테고리 정보 표시 (person, car)

#### 4단계: Predictions 업로드
- [x] "Upload Predictions" 버튼 클릭
- [x] `test_data/predictions.json` 파일 선택
- **예상 결과**:
  - 업로드 성공 메시지
  - mAP 값 계산 및 표시

#### 5단계: Threshold 조정
- [x] Confidence threshold 슬라이더 조정 (예: 0.5 → 0.8)
- [x] IoU threshold 슬라이더 조정 (예: 0.5 → 0.6)
- **예상 결과**:
  - 캔버스에서 bbox 필터링 (conf < 0.8 제거됨)
  - mAP 값 재계산
  - 클래스별 AP 업데이트

#### 6단계: 이미지 확인
- [x] 사이드바에서 이미지 클릭
- **예상 결과**:
  - 중앙 캔버스에 이미지 표시
  - GT bbox (녹색) 표시
  - Prediction bbox (색상별) 표시
  - 라벨 및 confidence score 표시

### Test Case 2: Interactive 편집 기능

#### 7단계: Bbox 이동
- [x] Prediction bbox 클릭하여 선택
- [x] 마우스로 드래그하여 이동
- **예상 결과**:
  - Bbox가 마우스를 따라 이동
  - 이동 중 실시간 업데이트
  - 마우스 릴리스 시 최종 위치 확정

#### 8단계: Bbox 크기 조절 (8개 핸들)
- [x] 선택된 bbox의 코너 핸들 드래그 (4개)
  - Top-left corner
  - Top-right corner
  - Bottom-left corner
  - Bottom-right corner
- [x] 선택된 bbox의 엣지 핸들 드래그 (4개)
  - Top edge
  - Bottom edge
  - Left edge
  - Right edge
- **예상 결과**:
  - 각 핸들에 맞는 커서 표시
  - 크기 조절이 올바르게 작동
  - 최소 크기 제한 (10px)

#### 9단계: 카테고리 변경
- [x] Prediction bbox 더블클릭
- [x] 카테고리 선택 드롭다운에서 새 카테고리 선택
- **예상 결과**:
  - 카테고리 변경 모달 표시
  - 선택한 카테고리로 업데이트
  - Bbox 색상 변경
  - mAP 재계산

#### 10단계: Undo/Redo
- [x] `Ctrl+Z` (Undo) 키 입력
- [x] `Ctrl+Y` (Redo) 키 입력
- **예상 결과**:
  - 마지막 편집 취소/재실행
  - 캔버스 및 mAP 업데이트

#### 11단계: Zoom/Pan
- [x] 마우스 휠로 줌 인/아웃
- **예상 결과**:
  - 이미지 확대/축소
  - 줌 레벨 표시 (우하단)
  - Bbox도 함께 스케일링

### Test Case 3: Export 기능

#### 12단계: Annotations Export
- [x] "Export Predictions" 버튼 클릭
- **예상 결과**:
  - 수정된 predictions가 COCO format JSON으로 다운로드
  - 파일명: `edited_predictions_<timestamp>.json`

#### 13단계: Export 파일 검증
- [x] 다운로드된 JSON 파일 열기
- [x] 수정된 bbox 좌표 확인
- [x] 변경된 카테고리 확인
- **예상 결과**:
  - 유효한 COCO format JSON
  - 모든 편집 내용 반영

#### 14단계: Re-upload 테스트
- [x] Export한 JSON을 다시 predictions로 업로드
- **예상 결과**:
  - 편집 내용 유지
  - mAP 재계산

## 🐛 버그 체크리스트

### UI/UX 버그
- [ ] 로딩 인디케이터 없음 (파일 업로드 시)
- [ ] 에러 메시지 표시 안 됨
- [ ] 이미지 없을 때 빈 화면
- [ ] Threshold 슬라이더 반응 느림

### 기능 버그
- [ ] Resize 중 bbox가 음수 크기로 변함
- [ ] 카테고리 picker 위치가 화면 밖
- [ ] Undo/Redo가 작동 안 함
- [ ] Export 파일 형식 오류

### 성능 버그
- [ ] 대량 이미지(100+) 처리 시 느림
- [ ] 많은 bbox(50+) 표시 시 렌더링 지연
- [ ] 메모리 누수 (장시간 사용 시)

## 📊 성능 테스트

### Small Dataset
- 이미지: 10개
- Annotations: 50개
- **기대 성능**:
  - 업로드: < 1초
  - mAP 계산: < 0.5초
  - Interactive 편집: 실시간

### Medium Dataset
- 이미지: 100개
- Annotations: 500개
- **기대 성능**:
  - 업로드: < 5초
  - mAP 계산: < 2초
  - 이미지 전환: < 0.5초

### Large Dataset (스트레스 테스트)
- 이미지: 1000개
- Annotations: 5000개
- **기대 성능**:
  - 업로드: < 30초
  - mAP 계산: < 10초
  - UI 응답성: 유지

## 🔍 추가 테스트 항목

### Edge Cases
- [ ] 빈 이미지 폴더
- [ ] GT 없이 predictions만
- [ ] Predictions 없이 GT만
- [ ] 존재하지 않는 카테고리 ID
- [ ] 잘못된 COCO format JSON
- [ ] 이미지 파일 없음 (annotations만 있음)
- [ ] 매우 큰 이미지 (10000x10000)
- [ ] 매우 작은 bbox (1x1)

### Cross-browser 테스트
- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Edge

### 반응형 테스트
- [ ] Desktop (1920x1080)
- [ ] Laptop (1366x768)
- [ ] Tablet (portrait/landscape)

## 📝 테스트 결과 기록

### Test Run 1: [날짜]
**환경**: Docker Compose / Chrome
**테스터**: [이름]

| Test Case | Status | Notes |
|-----------|--------|-------|
| 기본 워크플로우 | ✅/❌ | |
| Interactive 편집 | ✅/❌ | |
| Export 기능 | ✅/❌ | |

**발견된 버그**:
1. 
2. 
3. 

**개선 사항**:
1. 
2. 
3. 

## 🎓 트러블슈팅

### 문제: 이미지가 표시되지 않음
**해결방법**:
1. 이미지 경로 확인 (file_name이 실제 파일과 일치하는지)
2. CORS 설정 확인
3. 브라우저 콘솔에서 에러 확인

### 문제: mAP 값이 0으로 표시됨
**해결방법**:
1. GT와 predictions의 image_id 일치 확인
2. category_id 일치 확인
3. bbox format 확인 ([x, y, width, height])

### 문제: Bbox 편집이 작동하지 않음
**해결방법**:
1. GT가 아닌 prediction bbox인지 확인 (GT는 편집 불가)
2. 브라우저 캐시 삭제 후 재시도
3. 개발자 도구에서 JavaScript 에러 확인

## 📚 참고 자료

- **COCO Format**: https://cocodataset.org/#format-data
- **MOTA_Tool Docs**: `/README.md`, `/ARCHITECTURE.md`
- **Backend API**: http://127.0.0.1:8000/docs (실행 중일 때)

---

# MOTA Mode Testing Guide

## 🎯 목적
MOTA 모드(다중 객체 추적 평가)의 헝가리안 매칭 기반 MOTA/IDSW/TP/FP/FN 계산, Override 반영 평가, CORS/WS 안정성, 편집 반영 정확성을 테스트하기 위한 가이드입니다.

## 📋 사전 준비
Docker Compose 또는 로컬 방식은 MAP 가이드와 동일. Backend/Frontend 모두 실행 후 아래 확인:

```bash
curl -i http://localhost:8000/health
curl -s http://localhost:8000/cors_origins
```

예상: `cors_origins` JSON 배열에 `http://localhost:5173`, `http://127.0.0.1:5173` 포함.

## 🧪 기본 MOTA 테스트 데이터 생성

### 1. 최소 MOT 포맷 파일 (동일 GT/Pred → 완전 매칭)
`appdata/annotations/gt_min.txt` / `appdata/annotations/pred_min.txt` (프레임 0~2):
```text
0,1,10,10,20,20,1,-1,-1,-1
1,1,10,10,20,20,1,-1,-1,-1
2,1,10,10,20,20,1,-1,-1,-1
```
`pred_min.txt`는 동일 내용 복사.

### 2. 헝가리안 매칭 검증용 (3 GT / 3 Pred, 혼합 IoU)
`gt_hungarian.txt`:
```text
0,1,10,10,20,20,1,-1,-1,-1
0,2,40,10,20,20,1,-1,-1,-1
0,3,70,10,20,20,1,-1,-1,-1
```
`pred_hungarian.txt` (Pred ID 재배치로 그리디 vs 최적 차이 유도):
```text
0,101,12,12,20,20,1,-1,-1,-1   # GT1과 IoU 높음
0,103,42,10,20,20,1,-1,-1,-1   # GT2와 IoU 높음
0,102,72,14,20,20,1,-1,-1,-1   # GT3과 IoU 높음
```
그리디도 여기서는 동일 결과지만, 필요 시 일부 IoU를 교차되게 조정하여 검증(예: 하나를 중간 위치에 배치해 잘못된 우선순위 유도).

## 🔍 API 단위 테스트 (수동 cURL)

1) 기본 평가:
```bash
curl -H "Origin: http://localhost:5173" "http://localhost:8000/analysis/idsw_frames?gt_id=gt_min&pred_id=pred_min&iou=0.5&conf=0"
```
예상 결과: `mota=1.0`, `tp=3`, `fp=0`, `fn=0`, `idsw=0`, `frames=[]`.

2) Override 평가 (ID 변경으로 IDSW 발생 유도):
```bash
curl -H "Origin: http://localhost:5173" -H "Content-Type: application/json" \
  -d '{"gt_id":"gt_min","pred_id":"pred_min","iou":0.5,"conf":0,"overrides":{"1":{"1":{"id":999,"x":10,"y":10,"w":20,"h":20}}}}' \
  http://localhost:8000/analysis/idsw_frames_override
```
설명: 프레임 1에서 pred id=1 → 999로 변경. 프레임 0 매칭 id=1, 프레임 1 매칭 id=999 → 동일 GT id에 다른 pred id → `idsw=1` 증가 예상.

3) 헝가리안 매칭 검증:
```bash
curl -H "Origin: http://localhost:5173" "http://localhost:8000/analysis/idsw_frames?gt_id=gt_hungarian&pred_id=pred_hungarian&iou=0.5&conf=0"
```
예상: `tp=3`, 모든 매칭 성공, `mota=1.0`, 교차 IoU 배치 시에도 최적 비용 매칭 유지.

## 🌐 WebSocket Preview 테스트
Python 간단 스크립트(`tests/ws_preview_test.py` 권장):
```python
import asyncio, websockets, json

async def main():
  uri = "ws://localhost:8000/ws/preview"
  async with websockets.connect(uri) as ws:
    payload = {"gt_id":"gt_min","pred_id":"pred_min","iou":0.5,"conf":0,"overrides":{}}
    await ws.send(json.dumps(payload))
    msg = await ws.recv()
    print("Preview:", msg)
asyncio.run(main())
```
예상 응답: `{"mota":1.0,"tp":3,"fp":0,"fn":0,"idsw":0}`.

Override 적용 테스트:
```python
payload["overrides"] = {"1":{"1":{"id":999,"x":10,"y":10,"w":20,"h":20}}}
```
응답에서 `idsw`가 1로 증가하는지 확인.

## 🔁 편집(Override) 반영 흐름 검증
1. 프론트에서 박스 ID 변경 → `overrides` Map 반영.
2. LeftNav 디바운스 후 `POST /analysis/idsw_frames_override` 호출.
3. Store `idswFrames`, `idswDetails` 갱신 → UI 표시.
4. WebSocket preview도 동일 override 로직 적용(실시간 MOTA 반영).

체크리스트:
- [ ] ID 변경 후 350ms 내 서버 재스캔 발생
- [ ] 동일 프레임에서 다른 ID로 변경 시 IDSW 카운트 증가
- [ ] Geometry 수정 시 TP/FP/FN 변화 반영 (IoU 임계 경계값 근처 박스 시험)

## ⚙️ 실패/디버그 시나리오
| 증상 | 점검 | 해결 |
|------|------|------|
| 500 응답 + `override evaluation fatal` | 요청 JSON 형식, Path import 여부 | 최근 패치 반영 빌드 확인 |
| CORS 차단 | `/cors_origins` 목록, `Origin` 헤더 | backend 재빌드 / 확장 비활성화 |
| WS 조기 종료 | 서버 로그 `CORS-TRACE`, 첫 메시지 송신 여부 | 연결 직후 payload 즉시 send |

## 🧪 추가 자동화 테스트 제안 (pytest)
`backend/app/tests/unit/test_mota_hungarian.py` (예시):
```python
from pathlib import Path
from app.services.mota import evaluate_mota_detailed

def write(path: Path, lines: list[str]):
  path.write_text("\n".join(lines), encoding="utf-8")

def test_perfect_match(tmp_path: Path):
  gt = tmp_path/"gt.txt"; pred = tmp_path/"pred.txt"
  lines = ["0,1,10,10,20,20,1,-1,-1,-1", "1,1,10,10,20,20,1,-1,-1,-1"]
  write(gt, lines); write(pred, lines)
  mota, stats, frames, details = evaluate_mota_detailed(gt, pred, 0.5, 0.0)
  assert mota == 1.0 and stats["TP"] == 2 and stats["IDSW"] == 0 and frames == []

def test_id_switch(tmp_path: Path):
  gt = tmp_path/"gt.txt"; pred = tmp_path/"pred.txt"
  write(gt, ["0,1,10,10,20,20,1", "1,1,10,10,20,20,1"])
  write(pred, ["0,5,10,10,20,20,1", "1,6,10,10,20,20,1"])  # pred id 변경
  mota, stats, frames, details = evaluate_mota_detailed(gt, pred, 0.5, 0.0)
  assert stats["TP"] == 2 and stats["IDSW"] == 1 and frames == [1]
```

## ✅ 종료 기준
- API/WS 모두 200 응답 및 올바른 JSON 구조(MOTA/TP/FP/FN/IDSW) 확인.
- Override로 IDSW, TP/FP/FN 변화 재현 가능.
- CORS 에러 및 500 NameError 재발 없음.

## 📦 향후 개선 제안
- 매칭 모드 토글 (Hungarian vs Greedy) 벤치마크.
- 대형 시퀀스 스트림 성능 측정(WebSocket chunk latency).
- Override diff 내역 Export 기능.

