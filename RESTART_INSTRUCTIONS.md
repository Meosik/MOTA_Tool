# Docker 컨테이너 재시작 방법 (Container Restart Instructions)

## 🚨 중요: 환경 변수 변경 후 반드시 컨테이너 완전 재시작 필요

STARLETTE_MAX_FIELDS 환경 변수 변경을 적용하려면 **반드시** 아래 단계를 정확히 따라야 합니다.

## ❌ 작동하지 않는 방법

```bash
# 이것들은 환경 변수를 갱신하지 않습니다!
docker compose restart backend
docker compose restart
docker restart <container_id>
```

**왜 안되나요?**
- `restart` 명령어는 컨테이너를 중지했다가 다시 시작하지만, 환경 변수는 컨테이너 **생성 시점**에 설정됩니다
- 기존 컨테이너를 재사용하므로 새로운 환경 변수가 적용되지 않습니다

## ✅ 올바른 방법

### 방법 1: Down → Up (권장)

```bash
# 1. 현재 디렉토리 확인
cd /path/to/MOTA_Tool

# 2. 모든 컨테이너 중지 및 제거
docker compose -f infra/docker-compose.yml down

# 3. 이미지 재빌드 및 컨테이너 재생성
docker compose -f infra/docker-compose.yml up --build

# 백그라운드로 실행하려면:
docker compose -f infra/docker-compose.yml up --build -d
```

### 방법 2: 강제 재생성

```bash
# 기존 컨테이너를 강제로 재생성
docker compose -f infra/docker-compose.yml up --build --force-recreate
```

### 방법 3: 완전 초기화 (문제 해결용)

```bash
# 1. 모든 것 제거 (컨테이너, 볼륨 포함)
docker compose -f infra/docker-compose.yml down -v

# 2. 이미지도 제거
docker compose -f infra/docker-compose.yml down --rmi all

# 3. 완전히 새로 시작
docker compose -f infra/docker-compose.yml up --build
```

## 🔍 환경 변수 확인 방법

컨테이너를 재시작한 후, 환경 변수가 올바르게 설정되었는지 확인:

### 1. 컨테이너 환경 변수 확인

```bash
# 방법 A: printenv 사용
docker compose -f infra/docker-compose.yml exec backend printenv | grep STARLETTE

# 방법 B: env 사용
docker compose -f infra/docker-compose.yml exec backend env | grep STARLETTE

# 방법 C: Python에서 확인
docker compose -f infra/docker-compose.yml exec backend \
  python -c "import os; print('STARLETTE_MAX_FIELDS:', os.environ.get('STARLETTE_MAX_FIELDS', 'NOT SET'))"
```

**예상 출력**:
```
STARLETTE_MAX_FIELDS=10000
```

### 2. Starlette 모듈에서 확인

```bash
docker compose -f infra/docker-compose.yml exec backend \
  python -c "import starlette.formparsers; print('MAX_FIELDS:', starlette.formparsers.MAX_FIELDS)"
```

**예상 출력**:
```
MAX_FIELDS: 10000
```

만약 `1000`이 출력되면, 컨테이너가 제대로 재시작되지 않은 것입니다!

### 3. 컨테이너 재생성 확인

```bash
# 컨테이너 생성 시간 확인
docker compose -f infra/docker-compose.yml ps

# 또는
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.CreatedAt}}"
```

컨테이너의 "Created" 시간이 환경 변수 변경 **이후**여야 합니다.

## 📋 완전 재시작 체크리스트

```bash
# 1. 현재 디렉토리
cd /path/to/MOTA_Tool

# 2. 컨테이너 중지 및 제거
docker compose -f infra/docker-compose.yml down
# ✅ 출력: Removing mota_tool_backend_1, mota_tool_frontend_1...

# 3. 재빌드 및 시작
docker compose -f infra/docker-compose.yml up --build
# ✅ 출력: Building backend...

# 4. 환경 변수 확인 (새 터미널)
docker compose -f infra/docker-compose.yml exec backend printenv | grep STARLETTE
# ✅ 출력: STARLETTE_MAX_FIELDS=10000

# 5. Starlette 설정 확인
docker compose -f infra/docker-compose.yml exec backend \
  python -c "import starlette.formparsers; print(starlette.formparsers.MAX_FIELDS)"
# ✅ 출력: 10000

# 6. 브라우저 캐시 삭제
# - 개발자 도구(F12) → Application → Clear Storage → Clear site data
# - 또는 시크릿 모드(Ctrl+Shift+N)에서 테스트

# 7. 이미지 폴더 업로드 테스트
# - MAP 모드 선택
# - TopBar에서 "이미지/COCO 업로드" 클릭
# - 1000개 이상 이미지 폴더 선택
# ✅ 예상: 업로드 성공!
```

## 🐛 여전히 안되는 경우

### 1. 컨테이너 로그 확인

```bash
# 백엔드 로그 실시간 확인
docker compose -f infra/docker-compose.yml logs backend -f

# 특정 에러 검색
docker compose -f infra/docker-compose.yml logs backend | grep -i "starlette\|max_fields\|too many"
```

### 2. 컨테이너 상태 확인

```bash
# 실행 중인 컨테이너 확인
docker compose -f infra/docker-compose.yml ps

# 컨테이너 inspect
docker inspect <container_name> | grep -A 10 "Env"
```

### 3. docker-compose.yml 검증

```bash
# YAML 문법 검증
docker compose -f infra/docker-compose.yml config

# 환경 변수 섹션 확인
docker compose -f infra/docker-compose.yml config | grep -A 5 "environment"
```

**예상 출력**:
```yaml
environment:
  STARLETTE_MAX_FIELDS: "10000"
```

### 4. 캐시된 이미지 제거

```bash
# 오래된 이미지 제거
docker image prune -f

# 특정 이미지 제거 후 재빌드
docker rmi infra-backend
docker compose -f infra/docker-compose.yml build --no-cache backend
docker compose -f infra/docker-compose.yml up backend
```

### 5. 브라우저 문제 확인

```bash
# 1. 브라우저 캐시 완전 삭제
# - Chrome: Ctrl+Shift+Delete → "All time" → Clear data
# - Firefox: Ctrl+Shift+Delete → "Everything" → Clear now

# 2. 하드 리로드
# - Chrome/Firefox: Ctrl+Shift+R

# 3. 시크릿/프라이빗 모드로 테스트
# - Chrome: Ctrl+Shift+N
# - Firefox: Ctrl+Shift+P
```

## 🎯 MOTA vs MAP 모드 차이점

### MOTA 모드 (4800개 파일 가능)
```typescript
// 파일을 서버에 업로드하지 않고 브라우저 메모리에 저장
const frames = images.map((f, idx) => ({ i: idx+1, file: f }));
// ✅ 서버 제한 없음, 브라우저 메모리만 사용
```

### MAP 모드 (이전: 1000개 제한, 현재: 10000개)
```typescript
// 모든 파일을 서버로 업로드
const form = new FormData();
images.forEach(file => form.append('images', file, filename));
await fetch('/images/folder', { method: 'POST', body: form });
// ⚠️ 서버 Starlette 제한 적용됨
```

**왜 MAP 모드는 업로드가 필요한가요?**
- COCO 형식 annotations와 이미지 매칭 필요
- mAP 계산을 서버에서 수행
- 이미지 메타데이터 저장 필요

## 📞 추가 도움이 필요한 경우

### 진단 스크립트 실행

아래 스크립트를 복사하여 실행:

```bash
#!/bin/bash
echo "=== MOTA_Tool Container Diagnostics ==="
echo ""
echo "1. Docker Compose 버전:"
docker compose version
echo ""
echo "2. 컨테이너 상태:"
docker compose -f infra/docker-compose.yml ps
echo ""
echo "3. Backend 환경 변수:"
docker compose -f infra/docker-compose.yml exec backend printenv | grep STARLETTE
echo ""
echo "4. Starlette MAX_FIELDS:"
docker compose -f infra/docker-compose.yml exec backend \
  python -c "import starlette.formparsers; print('MAX_FIELDS:', starlette.formparsers.MAX_FIELDS)"
echo ""
echo "5. 컨테이너 생성 시간:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.CreatedAt}}" | grep backend
echo ""
echo "=== 완료 ==="
```

저장 후 실행:
```bash
chmod +x diagnose.sh
./diagnose.sh
```

### 결과 해석

- `STARLETTE_MAX_FIELDS=10000` ✅ 환경 변수 설정됨
- `MAX_FIELDS: 10000` ✅ Starlette에서 인식됨
- `MAX_FIELDS: 1000` ❌ 컨테이너 재시작 필요!

## 요약

1. **docker compose down** (컨테이너 제거)
2. **docker compose up --build** (재생성 및 시작)
3. **환경 변수 확인** (10000인지 확인)
4. **브라우저 캐시 삭제**
5. **테스트**

이 순서를 정확히 따르면 반드시 작동합니다!
