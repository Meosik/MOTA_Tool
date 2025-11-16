// 박스 데이터 API 요청 및 파싱을 Worker에서 수행
// 메인 스레드의 네트워크/파싱 블로킹 제거

interface TracksCacheMsg {
  type: 'fetchTracks';
  id: string;
  annId: string;
  f0: number;
  f1: number;
  apiBase: string;
}

interface TracksCacheResult {
  type: 'tracksCached';
  id: string;
  data: {
    tracks: Array<{
      id: string | number;
      frames: Array<{
        f: number;
        bbox: [number, number, number, number];
        conf?: number;
      }>;
    }>;
  };
}

// Worker에서 fetch + 파싱 수행
self.onmessage = async (event: MessageEvent<TracksCacheMsg>) => {
  const { type, id, annId, f0, f1, apiBase } = event.data;
  
  if (type === 'fetchTracks') {
    try {
      const url = `${apiBase}/tracks?annotation_id=${annId}&f0=${f0}&f1=${f1}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`API error: ${resp.status}`);
      }
      const data = await resp.json();
      
      // 파싱 완료 후 메인 스레드로 전송
      self.postMessage({
        type: 'tracksCached',
        id,
        data,
      });
    } catch (err) {
      self.postMessage({
        type: 'error',
        id,
        error: String(err),
      });
    }
  }
};

export {};
