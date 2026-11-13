/** The non-destructive look: every adjustment and background setting the compositor renders. */

export interface Look {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  fade: number;
  warmth: number;
  tint: number;
  vibrance: number;
  saturation: number;
  sharpen: number;
  detail: number;
  denoise: number;
  vignette: number;
  grain: number;
  bg: 'none' | 'blur' | 'color' | 'mono' | 'transparent';
  bgBlur: number; // 0..1
  bgColor: [number, number, number];
}

/** The adjustable sliders (everything except background settings). */
export type ToneKey = Exclude<keyof Look, 'bg' | 'bgBlur' | 'bgColor'>;

export const NEUTRAL: Look = {
  exposure: 0, contrast: 0, highlights: 0, shadows: 0, fade: 0,
  warmth: 0, tint: 0, vibrance: 0, saturation: 0,
  sharpen: 0, detail: 0, denoise: 0, vignette: 0, grain: 0,
  bg: 'none', bgBlur: 0.6, bgColor: [1, 1, 1],
};
/** Shader ids for the background modes. */
export const BG = { none: 0, blur: 1, color: 2, mono: 3, transparent: 4 } as const;
