# Changes Summary - MAP Mode UI Updates

## 요청사항 (Requirements)
1. MAP 모드에서도 TopBar를 사용해서 이미지 폴더, 어노테이션 입력 받기
2. MAP 모드에서 이미지 폴더 업로드 시 404 에러 수정

## 구현된 변경사항 (Implemented Changes)

### 1. API URL 수정 (404 에러 해결)
**문제**: 상대 경로 사용으로 인한 API 호출 실패
**해결**: `API_BASE` 상수 사용하여 절대 경로로 수정

**수정된 파일**:
- `frontend/src/store/mapStore.ts`
  - `openMapFolder`: `/images/folder` → `${API_BASE}/images/folder`
  - `openMapGT`: `/annotations` → `${API_BASE}/annotations`
  - `openMapPred`: `/annotations` → `${API_BASE}/annotations`

- `frontend/src/hooks/mapApi.ts`
  - `useMapImages`: `/images/${folderId}` → `${API_BASE}/images/${folderId}`
  - `useImageAnnotations`: `/tracks?...` → `${API_BASE}/tracks?...`
  - `useMapMetrics`: `/map/calculate?...` → `${API_BASE}/map/calculate?...`
  - `useUpdateAnnotation`: `/annotations/${id}` → `${API_BASE}/annotations/${id}`

### 2. TopBar에서 업로드 관리 (UI 통합)
**변경 전**: 
- 이미지 폴더 업로드: MapImageSidebar의 버튼
- GT/Predictions 업로드: MapControlPanel의 버튼

**변경 후**:
- 모든 업로드 버튼: TopBar에서 통합 관리
- TopBar의 모드별 버튼 라벨 개선

**수정된 파일**:
- `frontend/src/components/TopBar.tsx`
  - MAP 모드 핸들러에서 context 상태 업데이트
  - `setFolderId`, `setGtId`, `setPredId` 연결
  - 버튼 라벨: "이미지/COCO 업로드", "GT 어노테이션", "Pred 어노테이션"

- `frontend/src/components/map/MapContext.tsx`
  - `folderId`, `gtId`, `predId` 상태 추가
  - Context에서 중앙 관리

- `frontend/src/components/map/MapPage.tsx`
  - Context에서 상태 가져오기 (로컬 state 제거)

- `frontend/src/components/map/MapImageSidebar.tsx`
  - "Upload Folder" 버튼 제거
  - TopBar 사용 안내 메시지 추가

- `frontend/src/components/map/MapControlPanel.tsx`
  - "Upload GT", "Upload Predictions", "Export" 버튼 제거
  - TopBar 사용 안내 메시지 추가

## 결과 (Results)

### ✅ 해결된 문제
1. **404 에러 수정**: API_BASE를 사용하여 모든 API 호출이 정상 작동
2. **UI 통합**: TopBar를 통한 일관된 사용자 경험
3. **상태 관리 개선**: MapContext를 통한 중앙 집중식 상태 관리

### 📊 변경 통계
- 수정된 파일: 7개
- 추가된 기능: MapContext에 3개 상태 추가
- 제거된 중복 버튼: 4개

### 🎯 사용자 흐름
**이전**:
1. 사이드바에서 "Upload Folder" 클릭
2. 우측 패널에서 "Upload GT" 클릭
3. 우측 패널에서 "Upload Predictions" 클릭

**현재**:
1. TopBar에서 "이미지/COCO 업로드" 클릭
2. TopBar에서 "GT 어노테이션" 클릭
3. TopBar에서 "Pred 어노테이션" 클릭
4. TopBar에서 "내보내기" 클릭

### 🔄 MOTA 모드 호환성
- MOTA 모드는 변경되지 않음
- TopBar의 모드별 분기 유지
- 각 모드는 독립적으로 작동

## 테스트 방법 (Testing)

```bash
# 1. 전체 스택 실행
docker compose -f infra/docker-compose.yml up --build

# 2. 브라우저 접속
open http://localhost:5173

# 3. MAP 모드 선택

# 4. TopBar에서 테스트
- "이미지/COCO 업로드" 클릭 → 폴더 선택 → 성공 메시지
- "GT 어노테이션" 클릭 → JSON 파일 선택 → 성공 메시지
- "Pred 어노테이션" 클릭 → JSON 파일 선택 → 성공 메시지
- mAP 계산 확인
- "내보내기" 클릭 → 파일 다운로드
```

## 스크린샷 (Screenshots)

### TopBar - MAP 모드
```
[모드 선택: MAP] [이미지/COCO 업로드] [GT 어노테이션] [Pred 어노테이션] ... [내보내기]
```

### 사이드바 - 업로드 안내
```
Images
TopBar에서 이미지 폴더를 업로드하세요
```

### 컨트롤 패널 - 업로드 안내
```
💡 TopBar에서 이미지 폴더, GT, Predictions를 업로드하고 내보내기를 할 수 있습니다.

[Confidence Threshold 슬라이더]
[IoU Threshold 슬라이더]
[Metrics 표시]
```

## 추가 개선사항 (Future Improvements)
- [ ] 업로드 진행 상태 표시 (progress bar)
- [ ] 파일 검증 강화 (COCO format validation)
- [ ] 드래그 앤 드롭 지원
- [ ] 최근 업로드 기록 표시
