import type * as ORT from 'onnxruntime-web';
import { type Raw, cropRaw, makeRaw, resizeRaw, toCHW } from './image';

type Ort = typeof ORT;

export interface Hooks {
  checkpoint?: () => void;
  onProgress?: (fraction: number) => void;
  /** Lets a single-threaded host (React Native) breathe between tiles so progress can paint. */
  pause?: () => Promise<void>;
}

// ── Super-resolution: Real-ESRGAN General v3 as RGBA bytes in, RGBA bytes out (tools/build-sr.mjs) ─────
/** Must equal TILE in tools/build-sr.mjs: the model takes exactly this size. */
export const SR_TILE = 256;
const SR_PAD = 16;

/**
 * Tiled 4× super-resolution. The model takes and returns RGBA bytes (the scaling and rounding run
 * inside ONNX Runtime) and can average its own 4× result down to 2×, so JavaScript only copies rows.
 * Memory stays bounded whatever the photo size.
 */
export async function superResolve(ort: Ort, s: ORT.InferenceSession, img: Raw, outScale: 2 | 4, hooks: Hooks = {}): Promise<Raw> {
  const key = outScale === 4 ? 'x4' : 'x2';
  const step = SR_TILE - 2 * SR_PAD;
  const out = makeRaw(img.width * outScale, img.height * outScale);
  const cols = Math.ceil(img.width / step), rows = Math.ceil(img.height / step);
  const ow = SR_TILE * outScale;
  const lead = SR_PAD * outScale;
  let done = 0;
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      hooks.checkpoint?.();
      const x = tx * step, y = ty * step;
      const w = Math.min(step, img.width - x), h = Math.min(step, img.height - y);
      const region = cropRaw(img, x - SR_PAD, y - SR_PAD, SR_TILE, SR_TILE);
      const bytes = new Uint8Array(region.data.buffer, region.data.byteOffset, region.data.byteLength);
      const res = await s.run({ [s.inputNames[0]]: new ort.Tensor('uint8', bytes, [1, SR_TILE, SR_TILE, 4]) }, [key]);
      const t = res[key];
      const data = t.data as Uint8Array;
      const rowLen = w * outScale * 4;
      for (let r = 0; r < h * outScale; r++) {
        const from = ((lead + r) * ow + lead) * 4;
        out.data.set(data.subarray(from, from + rowLen), ((y * outScale + r) * out.width + x * outScale) * 4);
      }
      t.dispose?.();
      hooks.onProgress?.(++done / (cols * rows));
      await hooks.pause?.();
    }
  }
  return out;
}

/** The face detail step: one 4× pass over a 256² restored face crop (the SR model takes exactly one tile). */
export async function upscaleCrop(ort: Ort, s: ORT.InferenceSession, crop: Raw): Promise<Raw> {
  const bytes = new Uint8Array(crop.data.buffer.slice(crop.data.byteOffset, crop.data.byteOffset + crop.data.byteLength));
  for (let i = 3; i < bytes.length; i += 4) bytes[i] = 255;
  const res = await s.run({ [s.inputNames[0]]: new ort.Tensor('uint8', bytes, [1, SR_TILE, SR_TILE, 4]) }, ['x4']);
  const t = res.x4;
  const out = { width: SR_TILE * 4, height: SR_TILE * 4, data: new Uint8ClampedArray(t.data as Uint8Array) };
  t.dispose?.();
  return out;
}

// ── Background matte: MODNet, RGB normalised to [-1, 1], output alpha 0..1 ─────────────────────
export async function matte(ort: Ort, s: ORT.InferenceSession, img: Raw): Promise<{ width: number; height: number; alpha: Uint8Array }> {
  // MODNet works best around 512 on the short side; dimensions must be multiples of 32.
  const k = 512 / Math.min(img.width, img.height);
  const w = Math.max(32, Math.round((img.width * k) / 32) * 32);
  const h = Math.max(32, Math.round((img.height * k) / 32) * 32);
  const small = await resizeRaw(img, w, h);
  const res = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', toCHW(small, 2 / 255, -1), [1, 3, h, w]) });
  const d = res[s.outputNames[0]].data as Float32Array;
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = Math.max(0, Math.min(255, d[i] * 255));
  return { width: w, height: h, alpha };
}
