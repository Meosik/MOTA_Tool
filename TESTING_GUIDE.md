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
