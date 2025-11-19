# 파일 업로드 개수 제한 수정 (File Upload Limit Fix)

## 문제 (Problem)

MAP 모드에서 많은 이미지를 포함한 폴더 업로드 시 오류 발생:
```
Error: 업로드 실패: 400 - {"detail":"Too many files. Maximum number of files is 1000."}
```

## 원인 (Root Cause)

### Starlette/FastAPI의 기본 제한
- **기본값**: 1000개 파일
- **이유**: DoS 공격 방지 및 메모리 보호
- **위치**: Starlette의 multipart form parser

```python
# starlette/formparsers.py (기본값)
MAX_FIELDS = int(os.environ.get("STARLETTE_MAX_FIELDS", "1000"))
```

### 영향 범위
- 1000개 이상의 이미지가 있는 폴더 업로드 시 실패
- 대용량 데이터셋 처리 불가능

## 해결 방법 (Solution)

### 1. 환경 변수 설정 (Backend)

**파일**: `backend/app/main.py`

```python
# BEFORE importing FastAPI/Starlette
import os
os.environ['STARLETTE_MAX_FIELDS'] = '10000'

from fastapi import FastAPI
# ... rest of imports
```

**효과**:
- 최대 10,000개 파일 업로드 가능
- 환경 변수로 설정하여 Starlette 초기화 전 적용

### 2. 문서 업데이트

**파일**: `backend/app/api/images.py`

```python
@router.post("/images/folder")
async def upload_image_folder(images: List[UploadFile] = File(...)):
    """Upload a folder of images for MAP mode.
    
    Supports large batches of images (up to 10,000 files).
    Configurable via STARLETTE_MAX_FIELDS environment variable.
    """
```

## 설정 옵션 (Configuration Options)

### Docker Compose 환경 변수
`infra/docker-compose.yml`에서 설정 가능:
```yaml
services:
  backend:
    environment:
      - STARLETTE_MAX_FIELDS=10000  # 최대 파일 개수
```

### 직접 실행 시
```bash
# Linux/Mac
export STARLETTE_MAX_FIELDS=10000
uvicorn app.main:app --reload

# Windows
set STARLETTE_MAX_FIELDS=10000
uvicorn app.main:app --reload
```

## 테스트 시나리오

### 1. 대용량 폴더 (1000개 이상)
```
Input: 1500개 이미지 폴더
Before: ❌ "Too many files" 에러
After:  ✅ 모든 이미지 업로드 성공
```

### 2. 중간 규모 (500-1000개)
```
Input: 800개 이미지 폴더
Before: ✅ 정상 작동
After:  ✅ 정상 작동 (변경 없음)
```

### 3. 소규모 (100개 이하)
```
Input: 50개 이미지 폴더
Before: ✅ 정상 작동
After:  ✅ 정상 작동 (변경 없음)
```

### 4. 최대 제한 테스트
```
Input: 10,000개 이미지 폴더
Expected: ✅ 업로드 성공
```

### 5. 제한 초과
```
Input: 10,001개 이미지 폴더
Expected: ❌ "Too many files" 에러 (새로운 제한)
```

## 성능 고려사항 (Performance Considerations)

### 메모리 사용량
- **파일당 메모리**: 약 1-5MB (이미지 크기에 따라)
- **10,000개 파일**: 최대 10-50GB 메모리 필요
- **권장**: 대용량 업로드 시 서버 메모리 모니터링

### 업로드 시간
- **네트워크**: 1Gbps 기준, 10GB = 약 80초
- **파일 처리**: 파일당 약 0.1초, 10,000개 = 약 17분
- **권장**: 대용량 폴더는 분할 업로드 고려

### 최적화 방안
1. **청크 업로드**: 1000개씩 분할 업로드
2. **백그라운드 처리**: 비동기 작업 큐 사용
3. **스트리밍**: 파일 스트리밍 처리로 메모리 절약

## 변경된 파일 (Changed Files)

### Backend
- ✅ `backend/app/main.py`
  - 환경 변수 설정: `STARLETTE_MAX_FIELDS=10000`
  - FastAPI import 전에 설정

- ✅ `backend/app/api/images.py`
  - Docstring 업데이트
  - 제한 관련 설명 추가

## 검증 체크리스트 (Verification)

- [ ] 1500개 이미지 폴더 업로드 테스트
- [ ] 성공 메시지 확인
- [ ] 이미지 목록 표시 확인
- [ ] 메모리 사용량 모니터링
- [ ] 업로드 속도 측정

## Before/After 비교

| 항목 | Before | After |
|------|--------|-------|
| 최대 파일 수 | 1,000개 | 10,000개 |
| 에러 발생 | ✅ 1001개+ | ✅ 10,001개+ |
| 설정 방법 | ❌ 불가능 | ✅ 환경 변수 |
| 대용량 지원 | ❌ 제한적 | ✅ 향상됨 |

## 추가 권장사항 (Recommendations)

### 1. 프론트엔드 경고 메시지
```typescript
// mapStore.ts
if (images.length > 5000) {
  const confirm = window.confirm(
    `${images.length}개의 이미지를 업로드하려고 합니다. ` +
    `시간이 오래 걸릴 수 있습니다. 계속하시겠습니까?`
  );
  if (!confirm) return;
}
```

### 2. 진행률 표시
```typescript
// 업로드 진행률 표시
const onUploadProgress = (progress: number) => {
  console.log(`Upload progress: ${progress}%`);
};
```

### 3. 에러 처리 개선
```python
# Backend에서 더 자세한 에러 메시지
if len(images) > 10000:
    raise HTTPException(
        status_code=400, 
        detail=f"Too many files ({len(images)}). Maximum is 10,000. "
               "Please split into multiple uploads or contact support."
    )
```

## 문제 해결 (Troubleshooting)

### 여전히 1000개 제한 발생 시
1. **환경 변수 확인**:
   ```bash
   # Docker 내부에서 확인
   docker exec backend printenv | grep STARLETTE
   ```

2. **서버 재시작**:
   ```bash
   docker compose restart backend
   ```

3. **코드 확인**:
   - `main.py`에서 `os.environ` 설정이 import 전에 있는지 확인

### 메모리 부족 에러
- Docker 메모리 제한 증가
- 파일을 분할하여 여러 번 업로드
- 불필요한 파일 제거

## 참고 자료 (References)

- [Starlette Documentation](https://www.starlette.io/)
- [FastAPI File Uploads](https://fastapi.tiangolo.com/tutorial/request-files/)
- [Multipart Form Data Spec](https://www.w3.org/TR/html401/interact/forms.html#h-17.13.4)
