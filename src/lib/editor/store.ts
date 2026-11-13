import { create } from 'zustand';
import type { EnhanceOptions, FaceInfo } from '@/lib/ai/protocol';
import type { ModelKey } from '@/lib/ai/registry';
import { type Look, NEUTRAL } from '@/lib/gl/look';

/**
 * The single source of truth for everything the UI shows. Image bitmaps are stored here too
 * (they are cheap references), while GPU contexts and DOM handles live in `runtime.ts`.
 */

export type Tab = 'enhance' | 'edit' | 'crop' | 'background';
export type ExportFormat = 'image/jpeg' | 'image/png' | 'image/webp';
/** webgpu / wasm in the browser; native = ONNX Runtime on the phone. */
export type BackendKind = 'webgpu' | 'wasm' | 'native';

/** A photo to open: a Blob in the browser, a file URI in the native app. */
export type PhotoSource = Blob | string;
export type BatchStatus = 'queued' | 'working' | 'done' | 'error';

export interface Notice {
  tone: 'info' | 'ok' | 'warn';
  text: string;
}

export interface Scan {
  faces: number;
  grayscale: boolean;
}

export interface Mask {
  width: number;
  height: number;
  alpha: Uint8Array;
}

export interface FaceState {
  faces: FaceInfo[];
  strengths: number[];
  enabled: boolean[];
}

export interface Busy {
  title: string;
  sub: string;
  progress: number;
  /** When the task began (for the time-left estimate). */
  startedAt: number;
  cancel?: () => void;
}

export interface BatchItem {
  id: number;
  source: PhotoSource;
  name: string;
  /** Object URL of the original photo, used as the thumbnail until a result exists. */
  url: string;
  resultUrl?: string;
  result?: Blob;
  status: BatchStatus;
  stage: string;
  progress: number;
  detail: string;
}

export interface EditorState {
  name: string;
  original: ImageBitmap | null;
  origPreview: ImageBitmap | null;
  /** Full-resolution working image (AI results land here). */
  work: ImageBitmap | null;
  /** Screen-sized copy of `work` that the GPU renders. */
  preview: ImageBitmap | null;
  historyDepth: number;
  scan: Scan | null;
  opts: EnhanceOptions;
  faces: FaceState | null;
  fidelity: number;
  look: Look;
  activeFilter: string;
  mask: Mask | null;
  bgNotice: Notice | null;
  backend: BackendKind | null;
  cached: ModelKey[];
  busy: Busy | null;
  tab: Tab;
  compare: boolean;
  zoom: number;
  /** The photo was cropped, rotated or flipped, so the untouched original no longer lines up for before/after. */
  geom: boolean;
  exFormat: ExportFormat;
  exQuality: number;
  batchOpen: boolean;
  batchScale: 1 | 2 | 4;
  batchFaces: boolean;
  batchColor: boolean;
  batchItems: BatchItem[];
  batchRunning: boolean;
  dragging: boolean;
  /** The Save sheet (format, quality, share) is open. */
  saveOpen: boolean;
  /** The Settings sheet (stored engines, privacy) is open. */
  settingsOpen: boolean;
}

export const useEditor = create<EditorState>()(() => ({
  name: 'photo',
  original: null,
  origPreview: null,
  work: null,
  preview: null,
  historyDepth: 0,
  scan: null,
  opts: { scale: 2, faces: true, colorize: false },
  faces: null,
  fidelity: 0.75,
  look: { ...NEUTRAL },
  activeFilter: 'none',
  mask: null,
  bgNotice: null,
  backend: null,
  cached: [],
  busy: null,
  tab: 'enhance',
  compare: false,
  zoom: 100,
  geom: false,
  exFormat: 'image/jpeg',
  exQuality: 0.92,
  batchOpen: false,
  batchScale: 2,
  batchFaces: true,
  batchColor: false,
  batchItems: [],
  batchRunning: false,
  dragging: false,
  saveOpen: false,
  settingsOpen: false,
}));
