import { useMode } from '../context/ModeContext'
import AppLayout from './AppLayout'
import MapPage from '../components/map/MapPage'
import TopBar from '../components/TopBar'
import { MapProvider } from '../components/map/MapContext'

export default function Studio() {
  const { mode } = useMode();

  if (mode === 'MAP') {
    return (
      <MapProvider>
        <div className="w-screen h-screen flex flex-col bg-white">
          <TopBar />
          <div className="flex-1 min-h-0 min-w-0">
            <MapPage />
          </div>
        </div>
      </MapProvider>
    );
  }
  // MOTA 모드
  return (
    <div className="w-screen h-screen flex flex-col bg-white">
      <TopBar />
      <div className="flex-1 min-h-0 min-w-0">
        <AppLayout />
      </div>
    </div>
  );
}