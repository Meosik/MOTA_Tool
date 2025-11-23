import React from 'react';
import useFrameStore from '../store/frameStore';

export default function ExportModal(){
  const { exportActive, exportProgress, exportTotal, exportMessage, cancelExport } = useFrameStore(s=>({
    exportActive: s.exportActive,
    exportProgress: s.exportProgress,
    exportTotal: s.exportTotal,
    exportMessage: s.exportMessage,
    cancelExport: s.cancelExport,
  }));
  if (!exportActive) return null;
  const pct = exportTotal>0 ? Math.min(100, Math.round((exportProgress / exportTotal)*100)) : 0;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div className="w-[420px] bg-white rounded shadow-lg p-5 space-y-4">
        <div className="text-lg font-semibold">내보내기 진행 중</div>
        <div className="text-sm text-gray-700 break-words">{exportMessage}</div>
        <div className="h-3 w-full rounded bg-gray-200 overflow-hidden">
          <div className="h-full bg-brand-600" style={{ width: pct + '%' }} />
        </div>
        <div className="text-xs text-gray-600">{pct}% ({exportProgress}/{exportTotal})</div>
        <div className="flex justify-end gap-2">
          <button
            onClick={cancelExport}
            className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50"
          >취소</button>
        </div>
      </div>
    </div>
  );
}