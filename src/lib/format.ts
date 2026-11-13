/** Human-readable formatting helpers shared by the UI. */

export const fmtMB = (bytes: number) => `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;

export const fmtSize = (w: number, h: number) => `${w.toLocaleString()} × ${h.toLocaleString()}`;

export const fmtMP = (w: number, h: number) => `${((w * h) / 1e6).toFixed(1)} MP`;

/** "holiday.final.jpg" → "holiday.final" (falls back to "photo"). */
export const baseName = (name: string) => name.replace(/\.[^.]+$/, '') || 'photo';

export const clamp = (v: number, lo: number, hi: number) => {
  'worklet'; // also called from UI-thread gesture code
  return Math.min(hi, Math.max(lo, v));
};
