/** Platform-independent pixel helpers shared by the AI engines. Images are RGBA8 `Raw` buffers. */

export interface Raw {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export const makeRaw = (width: number, height: number): Raw => ({ width, height, data: new Uint8ClampedArray(width * height * 4) });
export const cloneRaw = (r: Raw): Raw => ({ width: r.width, height: r.height, data: new Uint8ClampedArray(r.data) });

/** Crop with edge replication outside the image. Rows inside the image are copied in one go. */
export function cropRaw(src: Raw, x0: number, y0: number, w: number, h: number): Raw {
  const out = makeRaw(w, h);
  const sw = src.width;
  const lo = Math.max(0, -x0); // output columns left of the image
  const hi = Math.min(w, sw - x0); // first output column right of the image
  for (let y = 0; y < h; y++) {
    const sy = Math.min(Math.max(y0 + y, 0), src.height - 1);
    const row = sy * sw * 4;
    const o = y * w * 4;
    if (hi > lo) out.data.set(src.data.subarray(row + (x0 + lo) * 4, row + (x0 + hi) * 4), o + lo * 4);
    const left = Math.min(lo, w);
    for (let x = 0; x < left; x++) out.data.set(src.data.subarray(row, row + 4), o + x * 4);
    for (let x = Math.max(hi, left); x < w; x++) out.data.set(src.data.subarray(row + (sw - 1) * 4, row + sw * 4), o + x * 4);
  }
  return out;
}

/** 2×3 affine [a, b, c, d, e, f]: (x, y) → (a·x + b·y + c, d·x + e·y + f). */
export type Affine = [number, number, number, number, number, number];

export function invertAffine([a, b, c, d, e, f]: Affine): Affine {
  const det = a * e - b * d;
  const ia = e / det, ib = -b / det, id = -d / det, ie = a / det;
  return [ia, ib, -(ia * c + ib * f), id, ie, -(id * c + ie * f)];
}

/** Bilinear RGBA sample with edge clamping. */
export function sample(img: Raw, x: number, y: number, out: Float32Array) {
  const w = img.width, h = img.height, d = img.data;
  x = Math.min(Math.max(x, 0), w - 1);
  y = Math.min(Math.max(y, 0), h - 1);
  const x0 = x | 0, y0 = y | 0;
  const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
  const fx = x - x0, fy = y - y0;
  const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
  for (let c = 0; c < 4; c++) {
    const top = d[i00 + c] + (d[i10 + c] - d[i00 + c]) * fx;
    const bot = d[i01 + c] + (d[i11 + c] - d[i01 + c]) * fx;
    out[c] = top + (bot - top) * fy;
  }
}

/** Warp `src` into a new `w×h` image; `m` maps source → destination coordinates. */
export function warpAffine(src: Raw, m: Affine, w: number, h: number): Raw {
  const inv = invertAffine(m);
  const out = makeRaw(w, h);
  const px = new Float32Array(4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      sample(src, inv[0] * (x + 0.5) + inv[1] * (y + 0.5) + inv[2] - 0.5, inv[3] * (x + 0.5) + inv[4] * (y + 0.5) + inv[5] - 0.5, px);
      const o = (y * w + x) * 4;
      out.data[o] = px[0];
      out.data[o + 1] = px[1];
      out.data[o + 2] = px[2];
      out.data[o + 3] = 255;
    }
  }
  return out;
}

/** RGBA → planar float NCHW (RGB, or BGR), value = pixel·scale + bias. */
export function toCHW(img: Raw, scale: number, bias: number, bgr = false): Float32Array {
  const n = img.width * img.height;
  const out = new Float32Array(3 * n);
  const d = img.data;
  const [r, g, b] = bgr ? [2, 1, 0] : [0, 1, 2];
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    out[r * n + i] = d[j] * scale + bias;
    out[g * n + i] = d[j + 1] * scale + bias;
    out[b * n + i] = d[j + 2] * scale + bias;
  }
  return out;
}

/** Planar float NCHW (RGB) → RGBA, pixel = value·scale + bias (clamped by Uint8ClampedArray). */
export function fromCHW(t: ArrayLike<number>, w: number, h: number, scale: number, bias: number): Raw {
  const out = makeRaw(w, h);
  const n = w * h;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    out.data[j] = t[i] * scale + bias;
    out.data[j + 1] = t[n + i] * scale + bias;
    out.data[j + 2] = t[2 * n + i] * scale + bias;
    out.data[j + 3] = 255;
  }
  return out;
}
