# MAP Mode 통합 진행 상황 분석 (Integration Status Analysis)

## 📊 전체 진행률: 약 85% 완료

## 1. 현재 상태 요약 (Current Status Summary)

### ✅ 성공적으로 통합된 부분

#### Backend (백엔드)
- **COCO 데이터 로더** (`backend/app/services/coco_loader.py`)
  - ✅ GT annotations 로드
  - ✅ Predictions 로드
  - ✅ 이미지 경로 처리
  - ✅ 데이터 저장 기능

- **mAP 계산 엔진** (`backend/app/services/map.py`)
  - ✅ IoU 계산 (calculate_iou)
  - ✅ Precision-Recall 배열 생성 (get_pr_arrays)
  - ✅ VOC AP 계산 (voc_ap)
  - ✅ 카테고리별 mAP 계산 (calculate_map)
  - ✅ Confidence threshold 필터링

- **API 엔드포인트**
  - ✅ `/map/calculate` - mAP 메트릭 계산
  - ✅ `/images/folder` - 이미지 폴더 업로드
  - ✅ `/images/{folder_id}` - 이미지 리스트
  - ✅ `/annotations/{id}` - Annotation CRUD

#### Frontend (프론트엔드)
- **핵심 컴포넌트**
  - ✅ `MapPage.tsx` - 메인 페이지
  - ✅ `MapContext.tsx` - 상태 관리
  - ✅ `MapControlPanel.tsx` - 제어 패널
  - ✅ `MapImageCanvas.tsx` - 이미지 표시
  - ✅ `InteractiveCanvas.tsx` - 인터랙티브 편집
  - ✅ `MapImageList.tsx` - 이미지 목록
  - ✅ `MapImageSidebar.tsx` - 사이드바

- **상태 관리**
  - ✅ `mapStore.ts` - Zustand 기반 상태 관리
  - ✅ Undo/Redo 히스토리
  - ✅ Annotation 편집 추적

- **API 통합**
  - ✅ `mapApi.ts` - React Query 훅
  - ✅ 이미지 로드
  - ✅ Annotation 로드
  - ✅ mAP 계산 요청

### 🔧 추가 작업이 필요한 부분

#### 1. InteractiveCanvas 기능 완성도
**현재 상태:**
- ✅ 기본 드래그 이동 구현됨
- ⚠️ Resize handles 부분적으로 구현됨
- ⚠️ 모든 코너/엣지 resize 미완성

**필요한 작업:**
```typescript
// InteractiveCanvas.tsx에서 추가 필요
- 4개 코너 resize (top-left, top-right, bottom-left, bottom-right) ✅ 부분 구현
- 4개 엣지 resize (top, bottom, left, right) ❌ 미구현
- Resize 중 실시간 좌표 업데이트 ⚠️ 부분 구현
- Resize 완료 후 annotation 저장 ⚠️ 부분 구현
```

#### 2. End-to-End 워크플로우 테스트
**테스트 필요 시나리오:**
1. 이미지 폴더 업로드
2. GT annotations 업로드 (COCO format)
3. Predictions 업로드 (COCO format)
4. mAP 계산 확인
5. Annotation 편집 (드래그, 리사이즈)
6. 편집된 annotations export
7. 재업로드 후 결과 확인

**테스트 데이터:**
- COCO validation set 샘플
- 또는 직접 생성한 테스트 데이터

#### 3. 사용자 경험 개선
**필요한 기능:**
- [ ] 로딩 인디케이터 (이미지 업로드 시)
- [ ] 에러 메시지 토스트/알림
- [ ] Progress bar (대량 이미지 처리 시)
- [ ] 키보드 단축키 가이드 (Help modal)

#### 4. 고급 기능 (Optional)
**Capstone_Team_MAP에는 없지만 추가하면 좋은 기능:**
- [ ] Thumbnail 자동 생성 (backend)
- [ ] PR curve 시각화 (frontend - Chart.js 사용)
- [ ] 카테고리별 필터링
- [ ] 배치 annotation 편집
- [ ] Annotation 품질 검증 도구

---

## 2. Capstone_Team_MAP vs MOTA_Tool 기능 비교

### Capstone_Team_MAP (Original - Tkinter GUI)

```python
# 주요 기능
1. GUI.py (메인 애플리케이션)
   - Tkinter 기반 데스크톱 GUI
   - 파일 업로드 (filedialog)
   - 이미지 목록 (Listbox)
   - Threshold 슬라이더 (Scale)
   - mAP 표시 (Label)
   - 클래스별 AP 표시 (Text widget)

2. interactive_canvas.py
   - Tkinter Canvas
   - Bbox 드래그 이동
   - 4개 코너 resize handles
   - 마우스 휠 줌
   - PIL Image 처리

3. map_calculator.py
   - IoU 계산
   - AP 계산
   - Precision-Recall 계산
   
4. coco_loader.py
   - COCO JSON 로드
   - Predictions 로드
```

### MOTA_Tool (Integrated - Web App)

```typescript
// 주요 기능
1. Frontend (React + TypeScript)
   - 웹 기반 UI
   - React Query로 API 호출
   - Zustand로 상태 관리
   - HTML5 Canvas 사용
   - Tailwind CSS 스타일링

2. Backend (FastAPI + Python)
   - RESTful API
   - CORS 지원
   - 파일 업로드 처리
   - numpy 기반 계산
   
3. 아키텍처 장점
   - 원격 접속 가능
   - 다중 사용자 지원 가능
   - 확장성 높음
   - 현대적인 UI/UX
```

### 기능별 구현 상태

| 기능 | Capstone_Team_MAP | MOTA_Tool | 상태 |
|------|-------------------|-----------|------|
| COCO 데이터 로드 | ✅ | ✅ | 완료 |
| mAP 계산 | ✅ | ✅ | 완료 |
| IoU Threshold 조정 | ✅ | ✅ | 완료 |
| Confidence Threshold | ✅ | ✅ | 완료 |
| 카테고리별 AP | ✅ | ✅ | 완료 |
| Bbox 드래그 이동 | ✅ | ✅ | 완료 |
| Bbox 크기 조절 | ✅ | ⚠️ | 부분 구현 |
| 마우스 휠 줌 | ✅ | ✅ | 완료 |
| 레이블 수정 | ✅ | ❌ | 미구현 |
| Undo/Redo | ❌ | ✅ | MOTA_Tool 우월 |
| Annotations 저장 | ✅ | ✅ | 완료 |
| 이미지 검색 | ❌ | ⚠️ | 기본 구현 |
| PR Curve 시각화 | ❌ | ❌ | 둘 다 미구현 |

---

## 3. 구체적인 다음 단계 (Next Steps)

### Phase 1: 핵심 기능 완성 (우선순위 높음)

#### Task 1.1: InteractiveCanvas Resize 기능 완성
**예상 시간:** 2-3시간

**파일:** `frontend/src/components/map/InteractiveCanvas.tsx`

**구현 내용:**
1. 모든 resize handles 구현 (8개: 4코너 + 4엣지)
2. Resize 중 실시간 bbox 업데이트
3. Resize 완료 후 store 업데이트
4. Min/Max 크기 제한

**코드 예시:**
```typescript
// 구현 필요 부분
const handleResizeTopLeft = (e: MouseEvent) => {
  // top-left corner resize 로직
  const newX = e.clientX;
  const newY = e.clientY;
  const newWidth = originalX + originalWidth - newX;
  const newHeight = originalY + originalHeight - newY;
  // Update bbox...
};

// 다른 7개 handles도 유사하게 구현
```

#### Task 1.2: Label(Category) 수정 기능 추가
**예상 시간:** 1-2시간

**구현 방법:**
1. InteractiveCanvas에 더블클릭 이벤트 추가
2. Category 선택 Modal/Dropdown 표시
3. 선택한 category로 annotation 업데이트

**코드 예시:**
```typescript
// InteractiveCanvas.tsx
const handleDoubleClick = (annotationId: number) => {
  setEditingAnnotation(annotationId);
  setShowCategoryPicker(true);
};

const updateCategory = (newCategoryId: number) => {
  mapStore.updateAnnotationCategory(editingAnnotation, newCategoryId);
};
```

#### Task 1.3: End-to-End 테스트 및 버그 수정
**예상 시간:** 2-4시간

**테스트 시나리오:**
1. 샘플 데이터 준비 (COCO format)
2. Docker compose로 전체 스택 실행
3. UI에서 전체 워크플로우 실행
4. 발견된 버그 리스트 작성
5. 우선순위별 버그 수정

### Phase 2: 사용성 개선 (중간 우선순위)

#### Task 2.1: 로딩 상태 및 에러 처리
**예상 시간:** 2-3시간

**구현 내용:**
1. React Query의 loading/error 상태 활용
2. Toast notification 추가 (react-hot-toast)
3. Progress bar (대량 파일 업로드 시)

#### Task 2.2: 키보드 단축키 확장
**예상 시간:** 1시간

**추가할 단축키:**
- `Space`: 이미지 팬 모드 토글
- `+/-`: 줌 인/아웃
- `Delete`: 선택한 annotation 삭제
- `Escape`: 선택 해제
- `?`: 단축키 도움말

### Phase 3: 고급 기능 (낮은 우선순위, Optional)

#### Task 3.1: PR Curve 시각화
**예상 시간:** 3-4시간
- Chart.js 또는 Recharts 사용
- Backend에서 PR curve 데이터 반환 (이미 구현됨)
- Frontend에서 interactive chart 표시

#### Task 3.2: Thumbnail 생성
**예상 시간:** 2-3시간
- Backend에서 이미지 업로드 시 thumbnail 생성
- PIL/Pillow로 리사이즈 (예: 200x200)
- Frontend에서 thumbnail 표시

---

## 4. 테스트 가이드

### 로컬 개발 환경 실행

```bash
# 1. Backend 실행
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# 2. Frontend 실행 (다른 터미널)
cd frontend
npm install
npm run dev

# 3. 브라우저에서 접속
# http://localhost:5173
```

### Docker Compose로 전체 스택 실행

```bash
# 환경 변수 설정
cp infra/env/backend.local.env backend/.env
cp infra/env/frontend.local.env frontend/.env

# 빌드 및 실행
docker compose -f infra/docker-compose.yml up --build

# Frontend: http://localhost:5173
# Backend API docs: http://127.0.0.1:8000/docs
```

### 테스트 데이터 준비

**Option 1: COCO validation 샘플 다운로드**
```bash
# COCO val2017 일부 다운로드
mkdir -p test_data/images
mkdir -p test_data/annotations

# 이미지 몇 개와 annotations 다운로드
# https://cocodataset.org/#download
```

**Option 2: 직접 생성**
```json
// gt_annotations.json
{
  "images": [
    {"id": 1, "file_name": "test_image.jpg", "width": 640, "height": 480}
  ],
  "annotations": [
    {"id": 1, "image_id": 1, "category_id": 1, "bbox": [100, 100, 50, 50]}
  ],
  "categories": [
    {"id": 1, "name": "person"}
  ]
}

// predictions.json
[
  {"image_id": 1, "category_id": 1, "bbox": [105, 105, 48, 48], "score": 0.95}
]
```

---

## 5. 주요 차이점 및 개선사항

### Capstone_Team_MAP 대비 개선된 점

1. **아키텍처**
   - ✅ 웹 기반 → 어디서나 접속 가능
   - ✅ FastAPI + React → 확장성 높음
   - ✅ RESTful API → 다른 도구와 통합 용이

2. **사용자 경험**
   - ✅ 현대적인 UI (Tailwind CSS)
   - ✅ Responsive 디자인
   - ✅ Undo/Redo 기능
   - ✅ 이미지 검색 기능

3. **개발 편의성**
   - ✅ TypeScript로 타입 안정성
   - ✅ React Query로 캐싱 및 상태 관리
   - ✅ Hot reload 지원

### 아직 부족한 점

1. **기능 완성도**
   - ⚠️ Resize handles 완전하지 않음
   - ❌ Label 수정 기능 없음
   - ❌ PR curve 시각화 없음

2. **테스트**
   - ❌ Unit tests 없음
   - ❌ Integration tests 없음
   - ⚠️ End-to-end 수동 테스트 필요

3. **문서화**
   - ⚠️ 사용자 가이드 보완 필요
   - ❌ API 문서 자동 생성 미설정

---

## 6. 결론 및 권장사항

### 현재 상태
- **전체 진행률:** 약 85% 완료
- **핵심 기능:** 대부분 구현됨
- **완성도:** 추가 작업 필요

### 권장 작업 순서
1. **1주차:** Phase 1 (핵심 기능 완성) - InteractiveCanvas resize, 테스트
2. **2주차:** Phase 2 (사용성 개선) - 로딩 상태, 에러 처리
3. **3주차 이후:** Phase 3 (고급 기능) - PR curve, Thumbnail (선택사항)

### 즉시 시작할 수 있는 작업
1. InteractiveCanvas resize 기능 완성 → 가장 중요
2. End-to-end 테스트 실행 → 버그 발견
3. 발견된 버그 수정 → 안정성 향상

### 장기 목표
- 완전한 annotation 도구로 발전
- MOTA와 MAP 모드 모두 production-ready
- 커뮤니티에 오픈소스로 공개

---

## 7. 참고 자료

### 관련 레포지토리
- **Capstone_Team_MAP:** https://github.com/Meosik/Capstone_Team_MAP
- **MOTA_Tool:** https://github.com/Meosik/MOTA_Tool

### 기술 문서
- **COCO Format:** https://cocodataset.org/#format-data
- **FastAPI:** https://fastapi.tiangolo.com/
- **React Query:** https://tanstack.com/query/latest
- **Zustand:** https://github.com/pmndrs/zustand

### 개발 도구
- **TypeScript:** https://www.typescriptlang.org/
- **Tailwind CSS:** https://tailwindcss.com/
- **Vite:** https://vitejs.dev/
