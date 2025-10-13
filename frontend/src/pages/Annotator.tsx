import AnnotationTable from '../components/AnnotationTable'
import ControlsPanel from '../components/ControlsPanel'

export default function Annotator(){
  return <div style={{display:'grid', gap:12}}>
    <ControlsPanel/>
    <AnnotationTable/>
  </div>
}