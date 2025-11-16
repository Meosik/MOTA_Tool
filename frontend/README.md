
# Tracker Eval - Tailwind UI (Frontend Only)

Vite + React + Tailwind 기반의 로컬 웹앱 UI 스캐폴드입니다.
프로젝트의 요구(좌측 내비, 중앙 캔버스 오버레이, 우측 패널, 상단바, 하단 타임라인)에 맞는 기본 레이아웃과 컴포넌트를 포함합니다.

## 실행 방법
```bash
# 1) 의존성 설치
npm install

# 2) 개발 서버
npm run dev
# http://localhost:5173

# 3) 프로덕션 빌드
npm run build
npm run preview
```

## 포함 사항
- Vite + React + TypeScript
- Tailwind CSS (postcss/autoprefixer)
- 레이아웃 컴포넌트: TopBar, LeftNav, RightPanel, Timeline, OverlayCanvas
- zustand 스토어 (frameStore) - 폴더 선택 로직 스텁
- 캔버스 오버레이 스텁 (이미지/박스 렌더 함수 자리)

> 백엔드(FastAPI) 연동은 포함하지 않았습니다. 기존 API에 맞게 `src/lib/api.ts`와 각 컴포넌트의 TODO 부분을 연결하세요.
