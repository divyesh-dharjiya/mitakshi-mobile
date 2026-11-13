import type { ToneKey } from '@/lib/gl/look';
import { readSmall } from '@/lib/imageio';

/** Adjustment slider definitions and one-tap filter presets. Pure data plus the auto-fix analysis. */

export type ToneGroup = 'Light' | 'Colour' | 'Detail';
export type ToneValues = Partial<Record<ToneKey, number>>;

export interface ToneDef {
  key: ToneKey;
  label: string;
  min: number;
  max: number;
  group: ToneGroup;
}

export const TONE: ToneDef[] = [
  { key: 'exposure', label: 'Brightness', min: -1, max: 1, group: 'Light' },
  { key: 'contrast', label: 'Contrast', min: -0.6, max: 0.6, group: 'Light' },
  { key: 'highlights', label: 'Highlights', min: -1, max: 1, group: 'Light' },
  { key: 'shadows', label: 'Shadows', min: -1, max: 1, group: 'Light' },
  { key: 'fade', label: 'Fade', min: 0, max: 1, group: 'Light' },
  { key: 'warmth', label: 'Warmth', min: -1, max: 1, group: 'Colour' },
  { key: 'tint', label: 'Tint', min: -1, max: 1, group: 'Colour' },
  { key: 'vibrance', label: 'Vibrance', min: -1, max: 1, group: 'Colour' },
  { key: 'saturation', label: 'Saturation', min: -1, max: 1, group: 'Colour' },
  { key: 'sharpen', label: 'Sharpen', min: 0, max: 1, group: 'Detail' },
  { key: 'detail', label: 'Clarity', min: -1, max: 1.5, group: 'Detail' },
  { key: 'denoise', label: 'Denoise', min: 0, max: 1, group: 'Detail' },
  { key: 'vignette', label: 'Vignette', min: 0, max: 1, group: 'Detail' },
  { key: 'grain', label: 'Film grain', min: 0, max: 1, group: 'Detail' },
];

export const TONE_GROUPS: ToneGroup[] = ['Light', 'Colour', 'Detail'];

/** Every tone slider back at zero. */
export const TONE_ZERO = Object.fromEntries(TONE.map((t) => [t.key, 0])) as Record<ToneKey, number>;

export interface FilterDef {
  id: string;
  name: string;
  /** Gradient stops used as the tile's colour preview. */
  colors: readonly [string, string, ...string[]];
  values: ToneValues | 'auto';
}

export const FILTERS: FilterDef[] = [
  { id: 'none', name: 'Original', colors: ['#8aa0b8', '#d9c7a8'], values: {} },
  { id: 'auto', name: 'Auto', colors: ['#86d6ff', '#2b86f5'], values: 'auto' },
  { id: 'vivid', name: 'Vivid', colors: ['#ff4d6d', '#ffd60a', '#2ec4b6'], values: { contrast: 0.18, vibrance: 0.45, saturation: 0.08, detail: 0.35, sharpen: 0.2 } },
  { id: 'vintage', name: 'Vintage', colors: ['#c89f6a', '#7a5c3e'], values: { fade: 0.4, warmth: 0.55, tint: 0.1, saturation: -0.35, contrast: -0.05, exposure: 0.08, highlights: -0.15, vignette: 0.35, grain: 0.3 } },
  { id: 'film', name: 'Film', colors: ['#d8b98a', '#5f7f8c'], values: { fade: 0.2, contrast: 0.15, warmth: 0.15, tint: -0.05, saturation: -0.12, shadows: 0.15, vignette: 0.25, grain: 0.3 } },
  { id: 'warm', name: 'Warm', colors: ['#ffb36b', '#ff7b54'], values: { warmth: 0.5, vibrance: 0.15, exposure: 0.05 } },
  { id: 'cool', name: 'Cool', colors: ['#7fb2ff', '#a0e9ff'], values: { warmth: -0.45, tint: -0.05, vibrance: 0.1 } },
  { id: 'matte', name: 'Matte', colors: ['#a9a9b3', '#6e6e7a'], values: { fade: 0.5, contrast: -0.15, saturation: -0.15, highlights: -0.15 } },
  { id: 'drama', name: 'Drama', colors: ['#1d2b53', '#7e2553'], values: { contrast: 0.35, detail: 0.7, shadows: 0.35, highlights: -0.45, saturation: -0.15, vignette: 0.4 } },
  { id: 'bw', name: 'B&W', colors: ['#111', '#eee'], values: { saturation: -1, contrast: 0.22, detail: 0.3, grain: 0.15 } },
  { id: 'noir', name: 'Noir', colors: ['#000', '#555'], values: { saturation: -1, contrast: 0.45, shadows: -0.2, highlights: -0.2, vignette: 0.55, grain: 0.3 } },
  { id: 'fresh', name: 'Fresh', colors: ['#b8f2c9', '#7fd1ff'], values: { exposure: 0.15, shadows: 0.25, vibrance: 0.3, tint: -0.08, warmth: -0.08 } },
];

/**
 * One-tap "Auto": a light and colour fix worked out from the photo itself, and it only changes what the photo
 * needs. A dark photo is lifted (shadows first, so bright parts do not clip), a flat one gets contrast, a photo
 * with a clear colour cast is neutralised, and a washed-out one gets a little vibrance. A photo that is already
 * well exposed, balanced and colourful is left almost alone, and a photo that is deliberately dark, bright,
 * warm or black and white is not "corrected" into something else.
 *
 * Every proposal is then checked on a small copy of the photo with the same tone maths the screen uses: if the
 * result would clip more highlights or shadows, or move the average brightness further from the middle, the
 * strength is reduced until it is safe (or dropped to nothing). So Auto never makes a photo worse than it was.
 */
export function autoValues(preview: ImageBitmap): ToneValues {
  const { width: w, height: h, data: d } = readSmall(preview, 256);
  const n = w * h;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  // ── Measure ──
  const luma = new Float32Array(n);
  const hist = new Uint32Array(256);
  let sr = 0, sg = 0, sb = 0, neutral = 0, satSum = 0, satN = 0, dark = 0, bright = 0, clipHi = 0, clipLo = 0, sum = 0;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const R = d[i] / 255, G = d[i + 1] / 255, B = d[i + 2] / 255;
    const L = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    luma[p] = L;
    sum += L;
    hist[Math.min(255, (L * 255) | 0)]++;
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    if (mx > 0.1) {
      satSum += (mx - mn) / mx;
      satN++;
    }
    if (L < 0.12) dark++;
    if (L > 0.92) bright++;
    if (L > 0.985) clipHi++;
    if (L < 0.02) clipLo++;
    // Pale mid-tone pixels are the best clue to the colour of the light.
    if (L > 0.18 && L < 0.84 && mx - mn < 0.1) {
      sr += R;
      sg += G;
      sb += B;
      neutral++;
    }
  }
  const pct = (q: number) => {
    let acc = 0;
    for (let i = 0; i < 256; i++) if ((acc += hist[i]) >= n * q) return i / 255;
    return 1;
  };
  const lo = pct(0.01), hi = pct(0.99), med = pct(0.5);
  const mean = sum / n;
  const meanSat = satN ? satSum / satN : 0;
  const darkF = dark / n, brightF = bright / n, clipHiF = clipHi / n, clipLoF = clipLo / n, neutralF = neutral / n;

  // Sharpness: average luma edge strength (a soft or old photo scores low, a noisy or already crisp one high).
  let edge = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      edge += Math.abs(4 * luma[i] - luma[i - 1] - luma[i + 1] - luma[i - w] - luma[i + w]);
    }
  edge /= Math.max(1, (w - 2) * (h - 2));

  const grey = meanSat < 0.07; // black and white or sepia: never push colour into it

  // ── Propose ──
  let exposure = 0;
  if (med < 0.36) exposure = Math.min(0.9, Math.log2(0.46 / Math.max(med, 0.04)) * 0.7);
  else if (med > 0.68) exposure = -Math.min(0.45, Math.log2(med / 0.58) * 0.7);
  // Brightening must not blow the bright end out: leave the rest to the shadows slider.
  if (exposure > 0) exposure = Math.min(exposure, Math.max(0, Math.log2(0.97 / Math.max(hi, 0.05))) + 0.2);

  const range = hi - lo;
  const contrast = range < 0.8 ? clamp((0.8 - range) * 0.5, 0, 0.25) : 0;
  const shadows = darkF > 0.08 && med < 0.52 ? clamp(darkF * 2 + Math.max(0, 0.42 - med) * 0.5, 0, 0.5) : 0;
  const highlights = brightF > 0.1 && clipHiF < 0.04 ? -clamp((brightF - 0.06) * 1.8, 0, 0.3) : 0;

  let warmth = 0, tint = 0;
  if (!grey && neutralF > 0.08 && meanSat < 0.6) {
    const mr = sr / neutral, mg = sg / neutral, mb = sb / neutral;
    const conf = Math.min(1, neutralF / 0.2);
    warmth = clamp(((mb - mr) * 255) / 90, -0.15, 0.15) * conf;
    tint = clamp(((mg - (mr + mb) / 2) * 255) / 80, -0.15, 0.15) * conf;
    if (Math.abs(warmth) < 0.04) warmth = 0;
    if (Math.abs(tint) < 0.03) tint = 0;
  }
  const vibrance = !grey && meanSat < 0.38 ? clamp((0.38 - meanSat) * 0.9, 0.04, 0.3) : 0;
  const sharpen = edge < 0.05 ? 0.14 : edge < 0.09 ? 0.07 : 0;
  const detail = edge < 0.05 ? 0.18 : edge < 0.09 ? 0.1 : 0.04;

  // ── Check on a small copy, with the same tone maths as the screen ──
  const target = 0.47;
  const safe = (v: ToneValues) => {
    const e = Math.pow(2, v.exposure ?? 0), sh = v.shadows ?? 0, hl = v.highlights ?? 0, ct = v.contrast ?? 0, wm = v.warmth ?? 0, tn = v.tint ?? 0;
    const k = ct >= 0 ? ct * 1.6 : ct * 0.9;
    let cHi = 0, cLo = 0, m = 0;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      let r = (d[i] / 255) * e, g = (d[i + 1] / 255) * e, b = (d[i + 2] / 255) * e;
      const ll = clamp(luma[p] * e, 0, 1);
      const gain = Math.pow(2, sh * 1.4 * (1 - ll) * (1 - ll) + hl * 0.8 * ll * ll);
      r *= gain; g *= gain; b *= gain;
      const curve = (x: number) => {
        const t = clamp(x, 0, 1.5) - 0.5;
        return 0.5 + (t * (1 + k)) / (1 + k * Math.abs(2 * t));
      };
      r = curve(r) * (1 + wm * 0.16 + tn * 0.04);
      g = curve(g) * (1 + wm * 0.03 - tn * 0.09);
      b = curve(b) * (1 - wm * 0.2 + tn * 0.04);
      const L = clamp(0.2126 * r + 0.7152 * g + 0.0722 * b, 0, 1);
      m += L;
      if (L > 0.985) cHi++;
      if (L < 0.02) cLo++;
    }
    m /= n;
    return cHi / n <= clipHiF + 0.015 && cLo / n <= clipLoF + 0.015 && Math.abs(m - target) <= Math.abs(mean - target) + 0.01;
  };

  const base: ToneValues = { exposure, contrast, shadows, highlights, warmth, tint, vibrance };
  let scale = 1;
  let tone: ToneValues = base;
  for (let tries = 0; tries < 4 && !safe(tone); tries++) {
    scale *= 0.65;
    tone = Object.fromEntries(Object.entries(base).map(([key, v]) => [key, (v ?? 0) * scale])) as ToneValues;
  }
  if (!safe(tone)) tone = { vibrance: base.vibrance };
  return { ...tone, detail, sharpen };
}
