// Image Bitmap 디코딩을 별도 Worker에서 수행
// 메인 스레드를 블로킹하지 않음

interface DecodeMessage {
  type: 'decode';
  id: string;
  url: string;
  blob: Blob;
}

interface DecodeResult {
  type: 'decoded';
  id: string;
  bitmap: ImageBitmap;
}

// ImageBitmap 객체를 OffscreenCanvas를 통해 전송 가능하게 변환
async function decodeImage(id: string, blob: Blob): Promise<ImageBitmap> {
  try {
    // Blob을 직접 createImageBitmap (가장 효율적)
    const bitmap = await createImageBitmap(blob);
    return bitmap;
  } catch (err) {
    // fallback: Image 엘리먼트로 디코드
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image decode failed'));
        img.src = url;
      });
      
      const bitmap = await createImageBitmap(img);
      URL.revokeObjectURL(url);
      return bitmap;
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
  }
}

// Worker 메시지 핸들러
self.onmessage = async (event: MessageEvent<DecodeMessage>) => {
  const { type, id, blob } = event.data;
  
  if (type === 'decode') {
    try {
      const bitmap = await decodeImage(id, blob);
      
      // OffscreenCanvas를 통해 ImageBitmap을 transferable로 변환
      try {
        // OffscreenCanvas 생성 및 ImageBitmap 그리기
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close(); // 원본은 정리
          
          // OffscreenCanvas를 bitmap으로 변환하여 전송
          const convertedBitmap = await createImageBitmap(canvas);
          (self as any).postMessage(
            { type: 'decoded', id, bitmap: convertedBitmap },
            [convertedBitmap]
          );
        } else {
          // OffscreenCanvas 그리기 실패시 원본 전송 (위험)
          (self as any).postMessage(
            { type: 'decoded', id, bitmap },
            [bitmap]
          );
        }
      } catch (convertErr) {
        // 변환 실패시 원본 bitmap 전송
        console.warn('Bitmap conversion failed, sending original:', convertErr);
        (self as any).postMessage(
          { type: 'decoded', id, bitmap },
          [bitmap]
        );
      }
    } catch (err) {
      self.postMessage({ type: 'error', id, error: String(err) });
    }
  }
};

export {};
