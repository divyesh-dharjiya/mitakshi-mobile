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

// ── Colorization: DDColor predicts only the chroma (CIELAB a, b); the photo keeps its own luminance ──────
/** DDColor (tiny) takes a 256² image. */
export const COLOR_SIZE = 256;
/** DDColor's colours are on the cautious side: a little extra chroma looks closer to a real photo. */
const CHROMA_GAIN = 1.1;
/** Chroma above this is eased back: the model's strongest guesses (a blue collar, an orange face) are the ones that look wrong. */
const CHROMA_SOFT = 45;

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const LIN = new Float32Array(256).map((_, i) => lin(i / 255));
// Lookup tables: cbrt() and pow() per pixel are slow on mobile JS engines.
const LUT_N = 4096;
const FY = new Float32Array(LUT_N + 1).map((_, i) => {
  const t = i / LUT_N;
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
});
const GAM = new Uint8ClampedArray(LUT_N + 1).map((_, i) => Math.round(gam(i / LUT_N) * 255));
const fInv = (t: number) => (t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787);
const lutY = (y: number) => FY[(Math.min(1, Math.max(0, y)) * LUT_N + 0.5) | 0];
const toByte = (v: number) => (v <= 0 ? 0 : v >= 1 ? 255 : GAM[(v * LUT_N + 0.5) | 0]);

export async function colorize(ort: Ort, s: ORT.InferenceSession, img: Raw): Promise<Raw> {
  const S = COLOR_SIZE;
  const n = S * S;
  const small = await resizeRaw(img, S, S);
  // The model's input is the photo as a grey picture: its luminance only, a = b = 0.
  const input = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const Y = 0.2126 * LIN[small.data[i * 4]] + 0.7152 * LIN[small.data[i * 4 + 1]] + 0.0722 * LIN[small.data[i * 4 + 2]];
    const g = toByte(Y) / 255;
    input[i] = input[n + i] = input[2 * n + i] = g;
  }
  const res = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, S, S]) });
  const raw = res[s.outputNames[0]].data as Float32Array; // [a plane, b plane], CIELAB units
  // A light 3×3 blur of the colour planes removes isolated blobs; the photo's own luminance keeps every edge sharp.
  const ab = new Float32Array(raw.length);
  for (let pl = 0; pl < 2; pl++)
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        let acc = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const yy = y + dy, xx = x + dx;
            if (yy < 0 || xx < 0 || yy >= S || xx >= S) continue;
            acc += raw[pl * n + yy * S + xx];
            cnt++;
          }
        ab[pl * n + y * S + x] = acc / cnt;
      }

  // Full-resolution luminance from the original + bilinearly upsampled chroma.
  const W = img.width, H = img.height;
  const out = makeRaw(W, H);
  const d = img.data, o = out.data;
  const xa = new Int32Array(W), xb = new Int32Array(W), xw = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const fx = Math.min(Math.max(((x + 0.5) * S) / W - 0.5, 0), S - 1);
    xa[x] = fx | 0;
    xb[x] = Math.min((fx | 0) + 1, S - 1);
    xw[x] = fx - (fx | 0);
  }
  const k = CHROMA_GAIN;
  for (let y = 0; y < H; y++) {
    const fy = Math.min(Math.max(((y + 0.5) * S) / H - 0.5, 0), S - 1);
    const y0 = (fy | 0) * S, y1 = Math.min((fy | 0) + 1, S - 1) * S, wy = fy - (fy | 0);
    let i = y * W * 4;
    for (let x = 0; x < W; x++, i += 4) {
      const wx = xw[x], p = y0 + xa[x], q = y0 + xb[x], r = y1 + xa[x], t = y1 + xb[x];
      const a = k * ((ab[p] * (1 - wx) + ab[q] * wx) * (1 - wy) + (ab[r] * (1 - wx) + ab[t] * wx) * wy);
      const b = k * ((ab[n + p] * (1 - wx) + ab[n + q] * wx) * (1 - wy) + (ab[n + r] * (1 - wx) + ab[n + t] * wx) * wy);
      let ca = a, cb = b;
      const mag = Math.hypot(a, b);
      if (mag > CHROMA_SOFT) {
        const k2 = (CHROMA_SOFT + (mag - CHROMA_SOFT) * 0.45) / mag;
        ca = a * k2;
        cb = b * k2;
      }
      const Y = 0.2126 * LIN[d[i]] + 0.7152 * LIN[d[i + 1]] + 0.0722 * LIN[d[i + 2]];
      const fyv = lutY(Y);
      const X = fInv(fyv + ca / 500) * 0.95047, Z = fInv(fyv - cb / 200) * 1.08883;
      o[i] = toByte(3.2406 * X - 1.5372 * Y - 0.4986 * Z);
      o[i + 1] = toByte(-0.9689 * X + 1.8758 * Y + 0.0415 * Z);
      o[i + 2] = toByte(0.0557 * X - 0.204 * Y + 1.057 * Z);
      o[i + 3] = 255;
    }
  }
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
