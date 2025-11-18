FROM node:20-slim

WORKDIR /app

# 의존성 먼저 설치
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps || npm install

# 나머지 코드 복사
COPY . .

ENV HOST=0.0.0.0
ENV PORT=5173
EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

