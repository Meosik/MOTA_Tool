
import TopBar from '../components/TopBar'
import LeftNav from '../components/LeftNav'
import RightPanel from '../components/RightPanel'
import Timeline from '../components/Timeline'

export default function AppLayout({children}:{children: React.ReactNode}){
  return (
    <div className="h-screen w-screen flex flex-col">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 border-r bg-white overflow-y-auto">
          <LeftNav/>
        </aside>
        <main className="flex-1 grid grid-rows-[1fr_auto]">
          <div className="overflow-hidden bg-neutral-50">
            {children}
          </div>
          <div><Timeline/></div>
        </main>
        <aside className="w-80 border-l bg-white overflow-y-auto">
          <RightPanel/>
        </aside>
      </div>
    </div>
  )
}
