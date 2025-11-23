declare module 'munkres-js' {
  interface MunkresClassInstance {
    compute(cost: number[][], options?: any): [number, number][];
  }
  interface MunkresClassConstructor {
    new(): MunkresClassInstance;
  }
  interface ComputeFn {
    (cost: number[][], options?: any): [number, number][];
    Munkres: MunkresClassConstructor;
    version?: string;
  }
  const computeMunkres: ComputeFn;
  export default computeMunkres;
}
