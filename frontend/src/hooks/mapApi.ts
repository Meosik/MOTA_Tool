import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Get image list from folder
export function useMapImages(folderId: string | null | undefined) {
  return useQuery({
    queryKey: ['map-images', folderId],
    queryFn: async () => {
      if (!folderId) return [];
      const res = await fetch(`/images/${folderId}`);
      if (!res.ok) throw new Error('Failed to fetch images');
      return res.json();
    },
    enabled: !!folderId
  });
}

// Get annotations for an image
export function useImageAnnotations(annotationId: string | null | undefined) {
  return useQuery({
    queryKey: ['map-image-annotations', annotationId],
    queryFn: async () => {
      if (!annotationId) return { gt: [], pred: [], imageInfo: {} };
      const res = await fetch(`/tracks?annotation_id=${annotationId}`);
      if (!res.ok) throw new Error('Failed to fetch annotations');
      return res.json();
    },
    enabled: !!annotationId
  });
}

// Get mAP metrics
export function useMapMetrics(gtId: string, predId: string, conf: number, iou: number) {
  return useQuery({ 
    queryKey: ['map-metrics', gtId, predId, conf, iou], 
    queryFn: async () => {
      if (!gtId || !predId) return null;
      const params = new URLSearchParams({
        gt_id: gtId,
        pred_id: predId,
        conf: String(conf),
        iou: String(iou)
      });
      const res = await fetch(`/map/calculate?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to calculate mAP');
      return res.json();
    },
    enabled: !!gtId && !!predId
  });
}

// Update annotation
export function useUpdateAnnotation() {
  const qc = useQueryClient();
  return useMutation<any, Error, any, unknown>({
    mutationFn: async (vars: any) => {
      const { annotationId, data } = vars;
      const res = await fetch(`/annotations/${annotationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to update annotation');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['map-image-annotations'] });
      qc.invalidateQueries({ queryKey: ['map-metrics'] });
    }
  });
}