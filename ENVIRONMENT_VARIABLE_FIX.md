# 환경 변수 설정 수정 (Environment Variable Fix)

## 문제 (Problem)

이전 커밋에서 `backend/app/main.py`에 `STARLETTE_MAX_FIELDS=10000`를 설정했지만, 여전히 1000개 파일 제한 에러가 발생:
```
Error: 업로드 실패: 400 - {"detail":"Too many files. Maximum number of files is 1000."}
```

## 원인 (Root Cause)

### Python 코드에서 환경 변수 설정의 한계
```python
# backend/app/main.py
import os
os.environ['STARLETTE_MAX_FIELDS'] = '10000'
```

**문제점**:
1. **모듈 import 순서**: Starlette의 multipart 모듈이 다른 곳에서 먼저 import되면 환경 변수가 이미 읽혀진 상태
2. **Docker 환경**: 컨테이너가 시작할 때 이미 Python 런타임이 초기화되어 일부 모듈이 로드됨
3. **uvicorn worker**: uvicorn이 여러 worker를 사용하는 경우 각 worker가 독립적으로 초기화됨

### Starlette의 환경 변수 읽기 시점
```python
# starlette/formparsers.py (Starlette 내부)
MAX_FIELDS = int(os.environ.get("STARLETTE_MAX_FIELDS", "1000"))
```

이 코드는 모듈 레벨에서 실행되므로, 모듈이 처음 import될 때 환경 변수를 읽습니다.

## 해결 방법 (Solution)

### 1. Docker Compose 환경 변수 설정 (권장)

**파일**: `infra/docker-compose.yml`

```yaml
services:
  backend:
    build:
      context: ../backend
      dockerfile: Dockerfile
    env_file:
      - ./env/backend.local.env
    environment:
      - STARLETTE_MAX_FIELDS=10000  # ← 추가
    volumes:
      - ../backend/app:/app/app
```

**장점**:
- Python 프로세스 시작 전에 환경 변수 설정
- Docker 컨테이너 레벨에서 보장
- 모든 worker와 모듈에서 일관되게 적용

### 2. 환경 파일 설정 (추가 보장)

**파일**: `infra/env/backend.local.env`

```bash
HOST=127.0.0.1
PORT=8000
DATA_ROOT=/app/appdata
CORS_ORIGINS=http://localhost:5173
MODE=local
STARLETTE_MAX_FIELDS=10000  # ← 추가
```

**장점**:
- 버전 관리에 포함됨
- 다른 개발자도 동일한 설정 사용
- 환경별 설정 관리 용이

### 3. Python 코드 설정 (보조)

**파일**: `backend/app/main.py` (이미 적용됨)

```python
import os
os.environ['STARLETTE_MAX_FIELDS'] = '10000'
```

**역할**:
- Fallback 메커니즘
- 로컬 개발 환경에서 Docker 없이 실행 시 적용

## 검증 방법 (Verification)

### 1. 환경 변수 확인

Docker 컨테이너 내부에서 확인:
```bash
# 컨테이너에 접속
docker compose -f infra/docker-compose.yml exec backend bash

# 환경 변수 확인
echo $STARLETTE_MAX_FIELDS
# 출력: 10000

# Python에서 확인
python -c "import os; print(os.environ.get('STARLETTE_MAX_FIELDS'))"
# 출력: 10000
```

### 2. Starlette 설정 확인

```bash
# 컨테이너에서 Python 실행
docker compose -f infra/docker-compose.yml exec backend python

# Python shell에서
>>> from starlette.formparsers import MultiPartParser
>>> import starlette.formparsers
>>> starlette.formparsers.MAX_FIELDS
10000
```

### 3. 실제 업로드 테스트

```bash
# 1. 컨테이너 재시작 (중요!)
docker compose -f infra/docker-compose.yml down
docker compose -f infra/docker-compose.yml up --build

# 2. 브라우저에서 MAP 모드
# 3. 1000개 이상 이미지 폴더 업로드
# 4. 성공 확인
```

## 변경 파일 (Changed Files)

### 1. Docker 설정
- ✅ `infra/docker-compose.yml`
  - `environment` 섹션에 `STARLETTE_MAX_FIELDS=10000` 추가

### 2. 환경 파일
- ✅ `infra/env/backend.local.env`
  - `STARLETTE_MAX_FIELDS=10000` 추가

### 3. Python 코드 (이미 적용됨)
- ✅ `backend/app/main.py`
  - 환경 변수 설정 코드 유지 (fallback용)

## Before/After 비교

### Before (이전 수정)
```python
# main.py에서만 설정
import os
os.environ['STARLETTE_MAX_FIELDS'] = '10000'
```

**문제**:
- ❌ 모듈이 먼저 import되면 무시됨
- ❌ Docker 환경에서 일관성 없음
- ❌ 여전히 1000개 제한 발생

### After (현재 수정)
```yaml
# docker-compose.yml
environment:
  - STARLETTE_MAX_FIELDS=10000

# backend.local.env
STARLETTE_MAX_FIELDS=10000

# main.py (fallback)
os.environ['STARLETTE_MAX_FIELDS'] = '10000'
```

**효과**:
- ✅ Python 시작 전에 환경 변수 설정
- ✅ 모든 worker와 모듈에서 일관되게 적용
- ✅ 10,000개 파일 업로드 가능

## 트러블슈팅 (Troubleshooting)

### 여전히 1000개 제한이 발생하는 경우

#### 1. 컨테이너 완전 재시작
```bash
# 컨테이너 중지 및 제거
docker compose -f infra/docker-compose.yml down

# 이미지 재빌드 및 시작
docker compose -f infra/docker-compose.yml up --build

# 또는 강제 재생성
docker compose -f infra/docker-compose.yml up --build --force-recreate
```

#### 2. 환경 변수 확인
```bash
# 컨테이너 내부에서 확인
docker compose -f infra/docker-compose.yml exec backend printenv | grep STARLETTE

# 예상 출력:
# STARLETTE_MAX_FIELDS=10000
```

#### 3. 브라우저 캐시 삭제
- 브라우저의 개발자 도구 → Application/Storage → Clear site data
- 또는 시크릿 모드에서 테스트

#### 4. 로그 확인
```bash
# 백엔드 로그 확인
docker compose -f infra/docker-compose.yml logs backend | grep -i starlette

# 업로드 시도 시 로그
docker compose -f infra/docker-compose.yml logs backend -f
```

### 로컬 개발 환경 (Docker 없이)

```bash
# backend 디렉토리에서
cd backend

# 환경 변수 설정 후 실행
export STARLETTE_MAX_FIELDS=10000
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# 또는 inline으로
STARLETTE_MAX_FIELDS=10000 uvicorn app.main:app --reload
```

## 추가 설정 옵션 (Additional Options)

### 제한 더 늘리기

대용량 데이터셋(10,000개 이상)이 필요한 경우:

```yaml
# docker-compose.yml
environment:
  - STARLETTE_MAX_FIELDS=50000  # 50,000개까지
```

**주의사항**:
- 메모리 사용량 증가
- 업로드 시간 증가
- 서버 성능 고려 필요

### 다른 Starlette 제한

```yaml
environment:
  - STARLETTE_MAX_FIELDS=10000      # 최대 필드 수
  - STARLETTE_MAX_BODY_SIZE=104857600  # 최대 body 크기 (100MB)
```

## 테스트 시나리오

### 1. 컨테이너 재시작 후 테스트
```bash
# 1. 재시작
docker compose -f infra/docker-compose.yml restart backend

# 2. 환경 변수 확인
docker compose -f infra/docker-compose.yml exec backend \
  python -c "from starlette.formparsers import MultiPartParser; import starlette.formparsers; print(starlette.formparsers.MAX_FIELDS)"

# 예상 출력: 10000
```

### 2. 대용량 폴더 업로드
```
Input: 1,500개 이미지 폴더
Expected: ✅ 업로드 성공
```

### 3. 경계값 테스트
```
Input: 10,000개 이미지
Expected: ✅ 업로드 성공

Input: 10,001개 이미지
Expected: ❌ "Too many files. Maximum is 10000"
```

## 참고 사항 (Notes)

### 환경 변수 우선순위

1. **Docker Compose `environment`**: 최고 우선순위
2. **env_file**: 중간 우선순위
3. **Python 코드 `os.environ`**: 최하 우선순위 (이미 읽힌 값은 변경 불가)

### 왜 세 곳에 모두 설정하는가?

1. **docker-compose.yml**: Docker 환경에서 확실히 작동
2. **backend.local.env**: 버전 관리 및 팀 공유
3. **main.py**: 로컬 개발 환경 fallback

## 결론 (Conclusion)

환경 변수는 Python 프로세스가 시작되기 **전에** 설정되어야 합니다. Docker 환경에서는 docker-compose.yml이나 env 파일에 설정하는 것이 가장 확실한 방법입니다.

**핵심**: 컨테이너를 **완전히 재시작**해야 새로운 환경 변수가 적용됩니다!
