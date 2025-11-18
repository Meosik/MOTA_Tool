import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useMapImages(projectId: string) {
  return useQuery({ queryKey: ['map-images', projectId], queryFn: async () => {
    const res = await fetch(`/api/map/project/${projectId}/images`);
    if (!res.ok) throw new Error('이미지 목록 서버 오류');
    return res.json();
  },
  });
}

export function useImageAnnotations(imageId: number) {
  return useQuery({ queryKey: ['map-image-annotations', imageId], queryFn: async () => {
    const res = await fetch(`/api/map/image/${imageId}/annotations`);
    if (!res.ok) throw new Error('annotation 서버 오류');
    return res.json();
  },
  });
}

export function useMapMetrics(projectId: string, imageId: number, conf: number, iou: number) {
  return useQuery({ queryKey: ['map-metrics', projectId, imageId, conf, iou], queryFn: async () => {
    const res = await fetch('/api/map/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, image_id: imageId, confidence: conf, iou })
    });
    if (!res.ok) throw new Error('mAP 서버 오류');
    return res.json();
  },
  });
}

export function useUpdateAnnotation() {
  const qc = useQueryClient();
  return useMutation<any, Error, { annotationId: number; data: Record<string, unknown> }, unknown>(
    async (vars: { annotationId: number; data: Record<string, unknown> }) => {
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