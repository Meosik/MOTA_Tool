
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// alias 제거: 기본 node_modules 해석 사용

export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5173 },
  optimizeDeps: { include: ['munkres-js'] }
})
