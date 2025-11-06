
import AppLayout from './AppLayout'
import OverlayCanvas from '../components/OverlayCanvas'

export default function Studio(){
  return (
    <AppLayout>
      <div className="w-full h-full">
        <OverlayCanvas />
      </div>
    </AppLayout>
  )
}
