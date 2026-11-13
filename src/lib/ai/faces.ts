import type * as ORT from 'onnxruntime-web';
import { type Affine, type Raw, fromCHW, invertAffine, resizeRaw, toCHW, warpAffine } from './image';

type Ort = typeof ORT;

export interface Face {
  box: [number, number, number, number]; // x, y, w, h in source pixels
  kps: [number, number][]; // eyes (image-left, image-right), nose, mouth corners
  score: number;
}

// ── Detection (YuNet 2023mar: 12 outputs = cls/obj/bbox/kps at strides 8, 16, 32) ─────────────
const DET = 640;
const STRIDES = [8, 16, 32];

function iou(a: Face['box'], b: Face['box']) {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]), y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a[2] * a[3] + b[2] * b[3] - inter);
}

export async function detectFaces(ort: Ort, session: ORT.InferenceSession, img: Raw, minScore = 0.6): Promise<Face[]> {
  // Letterbox into 640² (top-left aligned) so coordinates map back with one scale.
  const s = DET / Math.max(img.width, img.height);
  const rw = Math.max(1, Math.round(img.width * s));
  const rh = Math.max(1, Math.round(img.height * s));
  const small = await resizeRaw(img, rw, rh);
  const input = new Float32Array(3 * DET * DET);
  const n = DET * DET;
  for (let y = 0; y < rh; y++)
    for (let x = 0; x < rw; x++) {
      const i = (y * rw + x) * 4, o = y * DET + x;
      input[o] = small.data[i + 2]; // YuNet expects BGR, 0..255
      input[n + o] = small.data[i + 1];
      input[2 * n + o] = small.data[i];
    }
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, DET, DET]) });
  const o = session.outputNames.map((k) => out[k].data as Float32Array);

  const faces: Face[] = [];
  STRIDES.forEach((stride, si) => {
    const cls = o[si], obj = o[3 + si], bbox = o[6 + si], kps = o[9 + si];
    const cols = DET / stride;
    for (let i = 0; i < cls.length; i++) {
      const score = Math.sqrt(Math.min(1, Math.max(0, cls[i])) * Math.min(1, Math.max(0, obj[i])));
      if (score < minScore) continue;
      const r = Math.floor(i / cols), c = i % cols;
      const cx = (c + bbox[i * 4]) * stride, cy = (r + bbox[i * 4 + 1]) * stride;
      const w = Math.exp(bbox[i * 4 + 2]) * stride, h = Math.exp(bbox[i * 4 + 3]) * stride;
      const pts: [number, number][] = [];
      for (let k = 0; k < 5; k++) pts.push([((c + kps[i * 10 + 2 * k]) * stride) / s, ((r + kps[i * 10 + 2 * k + 1]) * stride) / s]);
      faces.push({ box: [(cx - w / 2) / s, (cy - h / 2) / s, w / s, h / s], kps: pts, score });
    }
  });
  faces.sort((a, b) => b.score - a.score);
  const keep: Face[] = [];
  for (const f of faces) if (keep.every((k) => iou(k.box, f.box) < 0.3)) keep.push(f);
  return keep.sort((a, b) => a.box[0] - b.box[0]); // left-to-right reads naturally in the UI
}

// ── Alignment to the FFHQ template the restorer was trained on ───────────────────────────────────────
const FFHQ_UNIT: [number, number][] = [
  [0.37691676, 0.46864664],
  [0.62285697, 0.46912813],
  [0.50123859, 0.61331904],
  [0.39308822, 0.725411],
  [0.61150205, 0.72490465],
];
/** The restorer works on square face crops of one fixed size: 256 (GPEN-BFR-256) or 512 (GPEN-BFR-512). */
export type CropSize = 256 | 512;

/** Least-squares similarity transform (rotation + uniform scale + translation) src → dst. */
function similarity(src: [number, number][], dst: [number, number][]): Affine {
  const n = src.length;
  let sx = 0, sy = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { sx += src[i][0]; sy += src[i][1]; dx += dst[i][0]; dy += dst[i][1]; }
  sx /= n; sy /= n; dx /= n; dy /= n;
  let num1 = 0, num2 = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const px = src[i][0] - sx, py = src[i][1] - sy, qx = dst[i][0] - dx, qy = dst[i][1] - dy;
    num1 += px * qx + py * qy;
    num2 += px * qy - py * qx;
    den += px * px + py * py;
  }
  const a = num1 / den, b = num2 / den;
  return [a, -b, dx - (a * sx - b * sy), b, a, dy - (b * sx + a * sy)];
}

export const alignMatrix = (f: Face, size: CropSize): Affine => similarity(f.kps, FFHQ_UNIT.map(([x, y]) => [x * size, y * size] as [number, number]));

// ── Restoration (GPEN-BFR-256: RGB in [-1, 1], 256²) ────────────────────────────────────────────
/**
 * Restore one face. The restorer sees a 256² crop, but the face in the photo is often larger, so a 256² result
 * pasted back would look softer than the rest of the picture. Two fixes:
 *  - the result keeps the photo's own colour and light (only the restorer's texture is taken), so the face does
 *    not shift in tone or look like a mask;
 *  - `detail` (the upscaler) rebuilds the restored crop at 4× size, so skin, eyes and hair stay crisp when the
 *    face covers many more pixels than 256².
 */
export async function restoreFace(ort: Ort, session: ORT.InferenceSession, img: Raw, m: Affine, size: CropSize, detail?: (crop: Raw) => Promise<Raw>, outScale = 1) {
  const aligned = warpAffine(img, m, size, size);
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', toCHW(aligned, 2 / 255, -1), [1, 3, size, size]) });
  const t = out[session.outputNames[0]];
  const base = fromCHW(t.data as Float32Array, size, size, 127.5, 127.5);
  t.dispose?.();
  matchTone(base, aligned);
  const ratio = sharpness(aligned) / Math.max(1e-3, sharpness(base));
  const auto = autoStrength(ratio);
  if (auto < 0.999) mixInto(base, aligned, auto);
  // A photo that already has real texture gets some of it back on top of the restored face (pores, hair, fabric
  // edges), so the face does not look airbrushed. A blurry or damaged photo has none to give, so it gets none.
  addDetail(base, aligned, Math.min(0.6, ratio) * 0.7);
  // Source pixels per crop pixel, times the output scale: the 4× detail step only pays off when the face is
  // drawn much larger than the restorer's 256² crop.
  const zoom = outScale / Math.hypot(m[0], m[3]);
  return { aligned, restored: base, large: detail && size === 256 && zoom > 1.3 ? await detail(base) : base, auto };
}

/** Mean absolute Laplacian of the luma (a sharpness score) over the middle of a crop. */
function sharpness(r: Raw): number {
  const w = r.width, d = r.data;
  const lum = (x: number, y: number) => 0.299 * d[(y * w + x) * 4] + 0.587 * d[(y * w + x) * 4 + 1] + 0.114 * d[(y * w + x) * 4 + 2];
  let acc = 0, n = 0;
  const edge = Math.round(w / 8);
  for (let y = edge; y < r.height - edge; y += 2)
    for (let x = edge; x < w - edge; x += 2) {
      acc += Math.abs(4 * lum(x, y) - lum(x - 1, y) - lum(x + 1, y) - lum(x, y - 1) - lum(x, y + 1));
      n++;
    }
  return acc / Math.max(1, n);
}

/**
 * How much of the restoration to keep for this face. A blurry, damaged face (the original is far less sharp than
 * the result) gets all of it; a face that is already crisp keeps most of its own detail, because the restorer
 * smooths skin and would make a good photo look painted.
 */
function autoStrength(ratio: number): number {
  return Math.min(1, Math.max(0.3, (0.9 - ratio) / 0.5));
}

/** dst += k × (the fine detail of ref), where fine detail = ref minus its slight blur. */
function addDetail(dst: Raw, ref: Raw, k: number) {
  if (k < 0.02) return;
  const blur = boxBlur(ref, 2);
  const d = dst.data, r = ref.data;
  for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
    d[i] += (r[i] - blur[j]) * k;
    d[i + 1] += (r[i + 1] - blur[j + 1]) * k;
    d[i + 2] += (r[i + 2] - blur[j + 2]) * k;
  }
}

/** dst = ref + (dst - ref) * k, per pixel. */
function mixInto(dst: Raw, ref: Raw, k: number) {
  const d = dst.data, r = ref.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = r[i] + (d[i] - r[i]) * k;
    d[i + 1] = r[i + 1] + (d[i + 1] - r[i + 1]) * k;
    d[i + 2] = r[i + 2] + (d[i + 2] - r[i + 2]) * k;
  }
}

/** Box blur of the RGB channels (running sums, edges clamped). */
function boxBlur(src: Raw, radius: number): Float32Array {
  const { width: w, height: h, data: d } = src;
  const tmp = new Float32Array(w * h * 3), out = new Float32Array(w * h * 3);
  const win = radius * 2 + 1;
  for (let y = 0; y < h; y++)
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) acc += d[(y * w + Math.min(w - 1, Math.max(0, k))) * 4 + c];
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 3 + c] = acc / win;
        acc += d[(y * w + Math.min(w - 1, x + radius + 1)) * 4 + c] - d[(y * w + Math.max(0, x - radius)) * 4 + c];
      }
    }
  for (let x = 0; x < w; x++)
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) acc += tmp[(Math.min(h - 1, Math.max(0, k)) * w + x) * 3 + c];
      for (let y = 0; y < h; y++) {
        out[(y * w + x) * 3 + c] = acc / win;
        acc += tmp[(Math.min(h - 1, y + radius + 1) * w + x) * 3 + c] - tmp[(Math.max(0, y - radius) * w + x) * 3 + c];
      }
    }
  return out;
}

/** Move the restored face's colour and brightness (its low frequencies) to match the original crop; keep its texture. */
function matchTone(restored: Raw, reference: Raw, amount = 0.9) {
  const rad = Math.round(restored.width / 8);
  const a = boxBlur(reference, rad), b = boxBlur(restored, rad);
  const d = restored.data;
  for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
    d[i] += (a[j] - b[j]) * amount;
    d[i + 1] += (a[j + 1] - b[j + 1]) * amount;
    d[i + 2] += (a[j + 2] - b[j + 2]) * amount;
  }
}

// ── Paste-back with a soft box mask ───────────────────────────────────────────────────────────
const MASKS = new Map<number, Float32Array>();
const maskFor = (CROP: number) => {
  const cached = MASKS.get(CROP);
  if (cached) return cached;
  const m = new Float32Array(CROP * CROP);
  const feather = CROP * 0.12, pad = CROP * 0.02;
  for (let y = 0; y < CROP; y++)
    for (let x = 0; x < CROP; x++) {
      const d = Math.min(x, y, CROP - 1 - x, CROP - 1 - y) - pad;
      const t = Math.min(1, Math.max(0, d / feather));
      m[y * CROP + x] = t * t * (3 - 2 * t);
    }
  MASKS.set(CROP, m);
  return m;
};

export interface PasteFace {
  restored: Raw; // square crop: `size`² or a multiple of it (the 4× detail version)
  size: CropSize; // the crop size `matrix` maps into
  matrix: Affine; // source image → crop
  strength: number; // 0 natural … 1 fully restored
}

/** Blend restored crops into `base` in place; `scale` = base size / size the matrices were computed on. */
export function pasteFaces(base: Raw, faces: PasteFace[], scale: number) {
  const W = base.width, H = base.height, d = base.data;
  for (const f of faces) {
    if (f.strength <= 0) continue;
    const CROP = f.size;
    const MASK = maskFor(CROP);
    const inv = invertAffine(f.matrix);
    const toOut: Affine = [inv[0] * scale, inv[1] * scale, inv[2] * scale, inv[3] * scale, inv[4] * scale, inv[5] * scale];
    const fromOut = invertAffine(toOut);
    const corners = [[0, 0], [CROP, 0], [0, CROP], [CROP, CROP]].map(([x, y]) => [toOut[0] * x + toOut[1] * y + toOut[2], toOut[3] * x + toOut[4] * y + toOut[5]]);
    const x0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0]))));
    const x1 = Math.min(W, Math.ceil(Math.max(...corners.map((c) => c[0]))));
    const y0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1]))));
    const y1 = Math.min(H, Math.ceil(Math.max(...corners.map((c) => c[1]))));
    const rd = f.restored.data;
    const RW = f.restored.width;
    const K = RW / CROP;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const cx = fromOut[0] * (x + 0.5) + fromOut[1] * (y + 0.5) + fromOut[2] - 0.5;
        const cy = fromOut[3] * (x + 0.5) + fromOut[4] * (y + 0.5) + fromOut[5] - 0.5;
        if (cx < 0 || cy < 0 || cx > CROP - 1 || cy > CROP - 1) continue;
        const ix = cx | 0, iy = cy | 0, fx = cx - ix, fy = cy - iy;
        const jx = Math.min(ix + 1, CROP - 1), jy = Math.min(iy + 1, CROP - 1);
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        const m = (MASK[iy * CROP + ix] * w00 + MASK[iy * CROP + jx] * w10 + MASK[jy * CROP + ix] * w01 + MASK[jy * CROP + jx] * w11) * f.strength;
        if (m <= 0.001) continue;
        // The restored pixels are sampled on their own (possibly finer) grid.
        const rx = Math.min(RW - 1.001, Math.max(0, (cx + 0.5) * K - 0.5)), ry = Math.min(RW - 1.001, Math.max(0, (cy + 0.5) * K - 0.5));
        const qx = rx | 0, qy = ry | 0, ux = rx - qx, uy = ry - qy;
        const a = (qy * RW + qx) * 4, b = a + 4, c = a + RW * 4, e = c + 4;
        const r00 = (1 - ux) * (1 - uy), r10 = ux * (1 - uy), r01 = (1 - ux) * uy, r11 = ux * uy;
        const o = (y * W + x) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const v = rd[a + ch] * r00 + rd[b + ch] * r10 + rd[c + ch] * r01 + rd[e + ch] * r11;
          d[o + ch] = d[o + ch] + (v - d[o + ch]) * m;
        }
      }
    }
  }
}
