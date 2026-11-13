import type { ModelKey } from './registry';

export interface EnhanceOptions {
  /** Output size multiplier (1 = keep size). */
  scale: 1 | 2 | 4;
  faces: boolean;
  colorize: boolean;
  /** Retry mode after a GPU reset: heavy work runs on the CPU. */
  safe?: boolean;
}

export interface FaceInfo {
  box: [number, number, number, number];
  score: number;
  before: ImageBitmap;
  after: ImageBitmap;
}

export type Req =
  | { type: 'init'; id: number }
  | { type: 'scan'; id: number; bitmap: ImageBitmap }
  | { type: 'enhance'; id: number; bitmap: ImageBitmap; options: EnhanceOptions; keep?: boolean }
  | { type: 'composite'; id: number; strengths: number[] }
  | { type: 'matte'; id: number; bitmap: ImageBitmap }
  | { type: 'clear-models'; id: number }
  | { type: 'cancel'; id: number };

export type Res =
  | { type: 'ready'; id: number; backend: 'webgpu' | 'wasm' | 'native'; cached: ModelKey[] }
  | { type: 'scanned'; id: number; faces: number; grayscale: boolean }
  | { type: 'progress'; id: number; stage: string; value: number; bytes?: [number, number] }
  | { type: 'enhanced'; id: number; bitmap: ImageBitmap; faces: FaceInfo[]; width: number; height: number }
  | { type: 'composited'; id: number; bitmap: ImageBitmap }
  | { type: 'matted'; id: number; width: number; height: number; alpha: Uint8Array }
  | { type: 'cleared'; id: number }
  | { type: 'log'; id: number; message: string }
  | { type: 'error'; id: number; message: string; aborted?: boolean; gpuLost?: boolean };
