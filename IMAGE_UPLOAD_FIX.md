# MAP Mode 이미지 폴더 업로드 400 에러 수정

## 문제 (Problem)

MAP 모드에서 이미지 폴더 업로드 시 400 Bad Request 에러 발생:
```
folder:1  Failed to load resource: the server responded with a status of 400 (Bad Request)
INFO:     172.19.0.1:60898 - "POST /images/folder HTTP/1.1" 400 Bad Request
```

MOTA 모드에서는 정상 작동하지만 MAP 모드에서만 실패.

## 원인 분석 (Root Cause)

### 1. Frontend 이슈
**파일 타입 감지 실패**:
- 폴더 선택 시 일부 파일의 `file.type`이 비어있을 수 있음
- 브라우저에 따라 `webkitdirectory`로 선택한 파일의 MIME type이 설정되지 않을 수 있음

**파일명 처리 문제**:
- `webkitRelativePath`에 전체 경로(예: `folder/subfolder/image.jpg`)가 포함됨
- 경로 구분자(`/`, `\`)가 포함된 파일명이 백엔드로 전송됨

### 2. Backend 이슈
**경로 구분자 처리 미흡**:
```python
dest = save_dir / img.filename  # img.filename에 '/'가 있으면 하위 디렉토리 생성 시도
```

**에러 처리 부재**:
- 빈 파일 리스트에 대한 검증 없음
- 파일 저장 실패 시 명확한 에러 메시지 없음

## 해결 방법 (Solution)

### Frontend 수정 (`mapStore.ts`)

#### 1. 강화된 이미지 파일 필터링
```typescript
// Before
const images = fileList.filter(f => f.type.startsWith('image/'));

// After
const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
const images = fileList.filter(f => {
  if (f.type && f.type.startsWith('image/')) return true;
  // fallback: check file extension
  const ext = f.name.toLowerCase().slice(f.name.lastIndexOf('.'));
  return imageExtensions.includes(ext);
});
```

**개선사항**:
- MIME type이 없어도 확장자로 이미지 파일 식별
- 더 많은 브라우저 환경에서 안정적으로 작동

#### 2. 파일명 정규화
```typescript
// Before
form.append('images', file, (file as any).webkitRelativePath || file.name);

// After
const filename = file.name;  // webkitRelativePath 대신 name 사용
form.append('images', file, filename);
```

**개선사항**:
- 경로 구분자 없는 순수 파일명만 전송
- 백엔드에서 경로 관련 오류 방지

#### 3. 에러 처리 강화
```typescript
// 빈 이미지 검증
if (images.length === 0) {
  alert('이미지 파일이 없습니다.');
  return;
}

// 상세한 에러 메시지
if (!res.ok) {
  const errorText = await res.text();
  throw new Error(`업로드 실패: ${res.status} - ${errorText}`);
}
```

### Backend 수정 (`images.py`)

#### 1. 파일명 안전 처리
```python
# Before
dest = save_dir / img.filename

# After
filename = img.filename or f"image_{idx}.jpg"
# Replace path separators to avoid directory issues
filename = filename.replace('\\', '_').replace('/', '_')
dest = save_dir / filename
```

**개선사항**:
- 경로 구분자를 언더스코어로 치환
- None 파일명 대응
- 파일 시스템 안전성 향상

#### 2. 빈 요청 검증
```python
if not images:
    raise HTTPException(status_code=400, detail="No images provided")
```

#### 3. 예외 처리 추가
```python
try:
    with dest.open("wb") as f:
        shutil.copyfileobj(img.file, f)
    image_list.append({...})
except Exception as e:
    raise HTTPException(status_code=500, detail=f"Failed to save image {filename}: {str(e)}")
```

## 테스트 시나리오

### 1. 정상 업로드
```
Input: 이미지 폴더 (10개 파일)
Expected: 
- ✅ 모든 이미지 업로드 성공
- ✅ folder_id 반환
- ✅ 이미지 목록 표시
```

### 2. 경로 구분자 포함 파일
```
Input: subfolder/image.jpg
Before: 400 Bad Request (경로 생성 실패)
After: ✅ subfolder_image.jpg로 저장
```

### 3. MIME type 없는 파일
```
Input: image.jpg (type = "")
Before: 필터링되어 업로드 안 됨
After: ✅ 확장자로 판단하여 업로드
```

### 4. 빈 폴더
```
Input: 빈 폴더
Before: 400 Bad Request
After: ✅ "이미지 파일이 없습니다" 메시지
```

## 변경 파일

### Frontend
- `frontend/src/store/mapStore.ts`
  - 강화된 파일 타입 검증
  - 파일명 정규화
  - 에러 처리 개선

### Backend  
- `backend/app/api/images.py`
  - 파일명 안전 처리
  - 빈 요청 검증
  - 예외 처리 추가

## 검증 체크리스트

- [x] Frontend 빌드 성공
- [x] 파일 타입 필터링 개선
- [x] 파일명 경로 구분자 처리
- [x] 에러 메시지 개선
- [x] 백엔드 예외 처리 추가

## Before/After 비교

### Before
```
❌ webkitRelativePath 전체 경로 전송
❌ MIME type 없으면 필터링 실패
❌ 경로 구분자로 인한 파일 저장 실패
❌ 불명확한 400 에러
```

### After
```
✅ 순수 파일명만 전송 (file.name)
✅ 확장자 fallback으로 안정적 필터링
✅ 경로 구분자를 언더스코어로 치환
✅ 상세한 에러 메시지와 검증
```

## 추가 개선사항

향후 고려사항:
- [ ] 파일 크기 제한 추가
- [ ] 업로드 진행률 표시
- [ ] 중복 파일명 처리 개선
- [ ] 이미지 포맷 검증 강화
