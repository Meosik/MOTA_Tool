// 공통 Box/Annotation 타입 정의 (MAP/MOTA 모두 사용)

export type Box = {
  id: number | string;
  x: number;
  y: number;
  w: number;
  h: number;
  conf?: number;
  category?: string;
};

export type Annotation = {
  id: number | string;
  bbox: [number, number, number, number];
  conf?: number;
  category?: string;
  type?: 'gt' | 'pred';
};
