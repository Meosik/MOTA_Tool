import { useMode } from '../context/ModeContext'
import AppLayout from './AppLayout'
import MapMainPage from './map/MapMainPage' // 경로는 프로젝트 구조에 맞게!

export default function Studio() {
  const { mode } = useMode();
  if (mode === "MAP") {
    return <MapMainPage />
  }
  // 기본: 기존 MOTA 모드
  return <AppLayout />
}