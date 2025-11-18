import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// projectId는 annotation_id로 대체 (gt/pred)
export function useMapImages(annotationId: string | null | undefined) {
  return useQuery({
    queryKey: ['map-images', annotationId],
    queryFn: async () => {
      if (!annotationId) return [];
      const res = await fetch(`/tracks?annotation_id=${annotationId}`);
      if (!res.ok) throw new Error('이미지 목록 서버 오류');
      return res.json();
    },
  });
}

// imageId는 annotation_id로 대체
export function useImageAnnotations(annotationId: string | null | undefined) {
  return useQuery({
    queryKey: ['map-image-annotations', annotationId],
    queryFn: async () => {
      if (!annotationId) return { gt: [], pred: [], imageInfo: {} };
      const res = await fetch(`/tracks?annotation_id=${annotationId}`);
      if (!res.ok) throw new Error('annotation 서버 오류');
      return res.json();
    },
  });
}

// mAP 등 metrics는 analysis/idsw_frames로 대체
export function useMapMetrics(gtId: string, predId: string, conf: number, iou: number) {
  return useQuery({ queryKey: ['map-metrics', gtId, predId, conf, iou], queryFn: async () => {
    const params = new URLSearchParams({
      gt_id: gtId,
      pred_id: predId,
      conf: String(conf),
      iou: String(iou)
    });
    const res = await fetch(`/analysis/idsw_frames?${params.toString()}`);
    if (!res.ok) throw new Error('mAP 서버 오류');
    return res.json();
  },
  });
}

export function useUpdateAnnotation() {
  const qc = useQueryClient();
  return useMutation<any, Error, any, unknown>(
    async (vars: any) => {
      const { annotationId, data } = vars;
      const res = await fetch(`/api/map/annotation/${annotationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('annotation 수정 실패');
      return res.json();
    },
    {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['map-image-annotations'] });
        qc.invalidateQueries({ queryKey: ['map-metrics'] });
      }
    }
  );
}