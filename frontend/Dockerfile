FROM node:20-slim

WORKDIR /app

# 의존성 정보만 먼저 복사
COPY package.json package-lock.json* ./

# 나머지 코드 복사 (실제 코드는 볼륨으로 덮어씌워지지만,
# 빌드 단계에서는 이게 있어야 npm 동작 등 테스트 가능)
COPY . .

ENV HOST=0.0.0.0
ENV PORT=5173
EXPOSE 5173

# 컨테이너 시작할 때:
# 1) node_modules 없으면 npm install 실행 (리눅스용으로 설치됨)
# 2) 그 다음 vite dev 서버 실행
CMD ["sh", "-c", "if [ ! -d node_modules ]; then npm install --legacy-peer-deps || npm install; fi; npm run dev -- --host 0.0.0.0 --port 5173"]
