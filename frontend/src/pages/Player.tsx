import { useEffect, useRef, useState } from 'react'
import OverlayCanvas from '../components/OverlayCanvas'

export default function Player(){
  const [file,setFile] = useState<File|undefined>()
  const vRef = useRef<HTMLVideoElement>(null)
  return <div>
    <h2>Player (Local Video + Overlay)</h2>
    <input type="file" accept="video/*" onChange={e=>setFile(e.target.files?.[0])}/>
    <div style={{position:'relative', width:'80%', maxWidth:960}}>
      <video ref={vRef} controls style={{width:'100%'}} src={file?URL.createObjectURL(file):undefined}></video>
      <OverlayCanvas videoRef={vRef}/>
    </div>
  </div>
}