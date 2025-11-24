import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  expandedOffsetPx: number; // boundary x when expanded (panel width)
  topOffsetPx?: number; // optional vertical center override
}

// 반원 모양 경계 토글 버튼 (좌측 전용)
// 마우스가 경계 근처(펼쳐진 상태: boundary-24px ~ boundary+8px, 접힌 상태: 0~20px)에 오면 표시
export default function CollapseBoundaryToggle({ collapsed, onToggle, expandedOffsetPx, topOffsetPx }: Props){
  const [visible, setVisible] = useState(false);
  useEffect(()=>{
    function onMove(e: MouseEvent){
      const x = e.clientX;
      if (collapsed){
        setVisible(x < 20);
      } else {
        setVisible(x > expandedOffsetPx - 24 && x < expandedOffsetPx + 8);
      }
    }
    window.addEventListener('mousemove', onMove);
    return ()=> window.removeEventListener('mousemove', onMove);
  }, [collapsed, expandedOffsetPx]);

  if (!visible) return null;

  // 버튼이 항상 패널 경계에 딱 붙도록 left 계산
  // 펼쳐진 상태: 패널 width - 버튼 width/2 (버튼이 패널 위에 겹침)
  // 접힌 상태: 화면 왼쪽 끝
  const btnWidth = 40;
  const btnHeight = 80;
  const left = collapsed ? 0 : expandedOffsetPx - btnWidth / 2;
  const Icon = collapsed ? ChevronRight : ChevronLeft;
  return (
    <button
      onClick={onToggle}
      className={`fixed z-[100] group shadow-md transition-opacity duration-200 flex items-center justify-center text-white ${collapsed ? 'rounded-r-full' : 'rounded-r-full'} bg-gray-800/80 hover:bg-gray-900`}
      style={{
        top: topOffsetPx != null ? topOffsetPx : '50%',
        transform: topOffsetPx != null ? 'translateY(0)' : 'translateY(-50%)',
        left,
        width: btnWidth,
        height: btnHeight,
        borderTopLeftRadius: btnHeight/2,
        borderBottomLeftRadius: btnHeight/2,
        borderTopRightRadius: btnHeight/2,
        borderBottomRightRadius: btnHeight/2,
        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        cursor: 'pointer',
      }}
      aria-label={collapsed ? 'Image/Navigation Expand' : 'Image/Navigation Collapse'}
    >
      <Icon className="w-6 h-6" />
    </button>
  );
}
