import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import Runs from './pages/Runs'
import Player from './pages/Player'
import Annotator from './pages/Annotator'

export default function App(){
  const [tab,setTab] = useState<'dashboard'|'runs'|'player'|'annotator'>('dashboard')
  return (
    <div style={{fontFamily:'sans-serif', padding:16}}>
      <h1>Tracker Eval (Local)</h1>
      <nav style={{display:'flex', gap:8, marginBottom:12}}>
        <button onClick={()=>setTab('dashboard')}>Dashboard</button>
        <button onClick={()=>setTab('runs')}>Runs</button>
        <button onClick={()=>setTab('player')}>Player</button>
        <button onClick={()=>setTab('annotator')}>Annotator</button>
      </nav>
      {tab==='dashboard' && <Dashboard/>}
      {tab==='runs' && <Runs/>}
      {tab==='player' && <Player/>}
      {tab==='annotator' && <Annotator/>}
    </div>
  )
}