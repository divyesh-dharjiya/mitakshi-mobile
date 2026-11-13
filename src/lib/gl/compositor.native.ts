/**
 * Native rendering of the look: the same maths as the WebGL2 compositor (compositor.ts), as a
 * Skia runtime shader. WebGL reads blurred copies from mip levels; Skia shaders cannot, so the
 * blurred copies (fine detail, mid detail, local brightness, background blur) are prepared once
 * per image, at reduced size since they are blurry anyway.
 *
 * The on-screen view (Canvas.native.tsx) draws the shader live: the look is a Reanimated shared value
 * (`lookSV`) that the shader reads on the UI thread, so dragging a slider never waits for JavaScript
 * or rebuilds anything. Only a new image, mask or background blur size re-renders the view. Pan, zoom and
 * the before/after split run on the UI thread as well.
 */
import { makeMutable } from 'react-native-reanimated';
import { BlendMode, ImageFormat, Skia, type SkImage, type SkShader, TileMode, FilterMode, MipmapMode } from '@shopify/react-native-skia';
import { RGBA, asPic, makeSurface, snapshot } from '@/lib/native/pic';
import { BG, type Look, NEUTRAL } from './look';

export { NEUTRAL, type Look, type ToneKey } from './look';

const SKSL = `
uniform shader uImg;
uniform shader uFine;
uniform shader uMid;
uniform shader uLocal;
uniform shader uBgImg;
uniform shader uMask;
uniform float2 uSize;
uniform float uFineS;
uniform float uMidS;
uniform float uLocalS;
uniform float uBgS;
uniform float2 uMaskSize;
uniform float uHasMask;
uniform float uExposure;
uniform float uContrast;
uniform float uHighlights;
uniform float uShadows;
uniform float uFade;
uniform float uWarm;
uniform float uTint;
uniform float uVibrance;
uniform float uSat;
uniform float uSharpen;
uniform float uDetail;
uniform float uDenoise;
uniform float uVig;
uniform float uGrain;
uniform float uBg;
uniform float3 uBgColor;

const float3 LUMA = float3(0.2126, 0.7152, 0.0722);

float hash(float2 p) {
  float3 p3 = fract(float3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float3 tone(float3 c, float localL) {
  c *= exp2(uExposure);
  float ll = clamp(localL * exp2(uExposure), 0.0, 1.0);
  c *= exp2(uShadows * 1.4 * (1.0 - ll) * (1.0 - ll) + uHighlights * 0.8 * ll * ll);
  float k = uContrast >= 0.0 ? uContrast * 1.6 : uContrast * 0.9;
  float3 dc = clamp(c, 0.0, 1.5) - 0.5;
  c = 0.5 + dc * (1.0 + k) / (1.0 + k * abs(2.0 * dc));
  float L = dot(c, LUMA);
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = mix(float3(L), c, max(0.0, (1.0 + uSat) * (1.0 + uVibrance * (1.0 - clamp(sat * 1.6, 0.0, 1.0)))));
  c *= float3(1.0 + uWarm * 0.16 + uTint * 0.04, 1.0 + uWarm * 0.03 - uTint * 0.09, 1.0 - uWarm * 0.2 + uTint * 0.04);
  c = mix(c, float3(0.1) + c * 0.82, uFade);
  return c;
}

half4 main(float2 xy) {
  float2 uv = xy / uSize;
  float3 c = uImg.eval(xy).rgb;

  if (uDenoise > 0.0) {
    float sigma = 0.015 + 0.09 * uDenoise;
    float3 acc = c;
    float wsum = 1.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        if (i != 0 || j != 0) {
          float3 n = uImg.eval(xy + float2(float(i), float(j)) * 1.5).rgb;
          float3 d = n - c;
          float w = exp(-dot(d, d) / (2.0 * sigma * sigma));
          acc += n * w;
          wsum += w;
        }
      }
    }
    c = mix(c, acc / wsum, min(1.0, uDenoise * 1.5));
  }
  float3 fine = uFine.eval(xy * uFineS).rgb;
  c += (c - fine) * uSharpen * 2.0;
  float3 mid = uMid.eval(xy * uMidS).rgb;
  float midW = 1.0 - pow(abs(2.0 * dot(c, LUMA) - 1.0), 2.0);
  c += (c - mid) * uDetail * 0.8 * midW;

  float localL = dot(uLocal.eval(xy * uLocalS).rgb, LUMA);
  c = tone(c, localL);

  float alpha = 1.0;
  if (uHasMask > 0.5 && uBg > 0.5) {
    float a = uMask.eval(uv * uMaskSize).r;
    float3 bg = c;
    if (uBg < 1.5) bg = tone(uBgImg.eval(xy * uBgS).rgb, localL);
    else if (uBg < 2.5) bg = uBgColor;
    else if (uBg < 3.5) bg = float3(dot(c, LUMA));
    if (uBg > 3.5) alpha = a;
    else c = mix(bg, c, a);
  }

  float2 d = (uv - 0.5) * 2.0;
  float v = smoothstep(0.45, 1.35, length(d));
  c *= 1.0 - uVig * 0.75 * v;
  c += (hash(xy + fract(uGrain * 13.1)) - 0.5) * uGrain * 0.16;
  c = clamp(c, 0.0, 1.0);
  return half4(half3(c * alpha), half(alpha));
}
`;

const effect = Skia.RuntimeEffect.Make(SKSL);
if (!effect) throw new Error('Could not compile the photo shader');
/** The compiled look shader, for the on-screen view. */
export const LOOK_EFFECT = effect;

/** A blurred copy stored at reduced size; sample it at `xy * scale`. */
interface Blurred {
  image: SkImage;
  scale: number;
}

/**
 * Blur with a Gaussian of `sigma` image pixels. Large blurs run on a smaller copy (cheaper and
 * visually identical), so the cost stays flat whatever the image or blur size.
 */
function blurred(src: SkImage, sigma: number): Blurred {
  const k = Math.max(1, sigma / 3);
  const w = Math.max(1, Math.round(src.width() / k));
  const h = Math.max(1, Math.round(src.height() / k));
  const surface = makeSurface(w, h);
  const paint = Skia.Paint();
  const s = sigma / k;
  if (s > 0.05) paint.setImageFilter(Skia.ImageFilter.MakeBlur(s, s, TileMode.Clamp, null));
  surface.getCanvas().drawImageRectOptions(src, Skia.XYWHRect(0, 0, src.width(), src.height()), Skia.XYWHRect(0, 0, w, h), FilterMode.Linear, MipmapMode.Linear, paint);
  return { image: snapshot(surface), scale: w / src.width() };
}

/** Blur sizes equivalent to the mip levels the WebGL shader reads (in image pixels). */
const SIGMA_FINE = 0.75;
const SIGMA_MID = 3;
const SIGMA_LOCAL = 12;
const bgSigma = (w: number, h: number, amount: number) => Math.max(1, Math.min(w, h) * (0.004 + 0.03 * amount) * 0.5);

/** Everything the shader needs for one image (preview or full-resolution export). */
class Layers {
  fine: Blurred;
  mid: Blurred;
  local: Blurred;
  private bg: Blurred | null = null;
  private bgAmount = -1;

  constructor(readonly img: SkImage) {
    this.fine = blurred(img, SIGMA_FINE);
    this.mid = blurred(img, SIGMA_MID);
    this.local = blurred(img, SIGMA_LOCAL);
  }

  /** The background blur depends on the slider, so it is (re)made on demand. */
  background(amount: number): Blurred {
    if (!this.bg || Math.abs(amount - this.bgAmount) > 0.01) {
      this.bg?.image.dispose();
      this.bg = blurred(this.img, bgSigma(this.img.width(), this.img.height(), amount));
      this.bgAmount = amount;
    }
    return this.bg;
  }

  dispose() {
    for (const b of [this.fine, this.mid, this.local, this.bg]) b?.image.dispose();
  }
}

const sampler = (img: SkImage) => img.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None);

function maskImage(m: { width: number; height: number; alpha: Uint8Array }): SkImage {
  const rgba = new Uint8Array(m.width * m.height * 4);
  // Opaque grey: the shader reads the matte from the red channel (alpha would get premultiplied).
  for (let i = 0, j = 0; i < m.alpha.length; i++, j += 4) {
    rgba[j] = rgba[j + 1] = rgba[j + 2] = m.alpha[i];
    rgba[j + 3] = 255;
  }
  const img = Skia.Image.MakeImage({ width: m.width, height: m.height, ...RGBA }, Skia.Data.fromBytes(rgba), m.width * 4);
  if (!img) throw new Error('Could not create the subject mask');
  return img;
}

/** The look shader for one image. */
function makeLookShader(layers: Layers, mask: SkImage | null, l: Look): SkShader {
  const img = layers.img;
  const w = img.width();
  const h = img.height();
  const bg = l.bg === 'blur' ? layers.background(l.bgBlur) : layers.local;
  const m = mask ?? img;
  const uniforms = [
    w, h,
    layers.fine.scale, layers.mid.scale, layers.local.scale, bg.scale,
    m.width(), m.height(),
    mask ? 1 : 0,
    l.exposure, l.contrast, l.highlights, l.shadows, l.fade,
    l.warmth, l.tint, l.vibrance, l.saturation,
    l.sharpen, l.detail, l.denoise, l.vignette, l.grain,
    BG[l.bg],
    ...l.bgColor,
  ];
  return effect!.makeShaderWithChildren(uniforms, [sampler(img), sampler(layers.fine.image), sampler(layers.mid.image), sampler(layers.local.image), sampler(bg.image), sampler(m)]);
}

type Listener = () => void;

/** What the on-screen shader samples, and the numbers that depend on those images. Changes only with the images. */
export interface LiveInputs {
  version: number;
  w: number;
  h: number;
  img: SkImage;
  fine: SkImage;
  mid: SkImage;
  local: SkImage;
  bg: SkImage;
  mask: SkImage;
  fineS: number;
  midS: number;
  localS: number;
  bgS: number;
  maskW: number;
  maskH: number;
  hasMask: boolean;
}

export class Compositor {
  /** Largest image side this renderer handles (exports render on the CPU when the GPU can't). */
  readonly maxTextureSize = 8192;
  /** The look as the on-screen shader reads it: written from JS, read on the UI thread. */
  readonly lookSV = makeMutable<Look>({ ...NEUTRAL });
  private orig: SkImage | null = null;
  private layers: Layers | null = null;
  private mask: SkImage | null = null;
  private look: Look = { ...NEUTRAL };
  private listeners = new Set<Listener>();
  private version = 0;
  private cache: LiveInputs | null = null;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  get original() {
    return this.orig;
  }

  get size() {
    return this.layers ? { w: this.layers.img.width(), h: this.layers.img.height() } : null;
  }

  /** The untouched photo, shown on the left of the compare split. */
  setOriginal(img: ImageBitmap) {
    this.orig = asPic(img).image;
  }

  /** The current edited preview. */
  setImage(img: ImageBitmap) {
    // The screen may still draw the old images for a frame or two: release them a little later.
    const old = this.layers;
    this.layers = new Layers(asPic(img).image);
    if (old) setTimeout(() => old.dispose(), 1500);
  }

  /** Subject matte (1 byte per pixel, 255 = subject) or null. */
  setMask(m: { width: number; height: number; alpha: Uint8Array } | null) {
    const old = this.mask;
    this.mask = m ? maskImage(m) : null;
    if (old) setTimeout(() => old.dispose(), 1500);
  }

  get hasMask() {
    return !!this.mask;
  }

  /** Change the look. Reaches the screen through the shared value, with no re-render. */
  setLook(l: Look) {
    const prev = this.look;
    this.look = l;
    this.lookSV.value = l;
    // The background layer is a blurred copy of the photo: a new mode or blur size needs a new image.
    if (l.bg !== prev.bg || (l.bg === 'blur' && Math.abs(l.bgBlur - prev.bgBlur) > 0.01)) this.bump();
  }

  /** The split is drawn by the view on the UI thread. */
  setSplit(_uv: number) {}

  /** Images, mask or background changed: let the view pick up the new inputs. */
  render() {
    if (!this.layers || !this.orig) return;
    this.bump();
  }

  private bump() {
    this.version++;
    this.cache = null;
    for (const fn of this.listeners) fn();
  }

  /** Stable between changes, as React's external-store contract needs. */
  get live(): LiveInputs | null {
    if (!this.layers) return null;
    if (this.cache) return this.cache;
    const L = this.layers;
    const bg = this.look.bg === 'blur' ? L.background(this.look.bgBlur) : L.local;
    const m = this.mask ?? L.img;
    return (this.cache = {
      version: this.version,
      w: L.img.width(),
      h: L.img.height(),
      img: L.img,
      fine: L.fine.image,
      mid: L.mid.image,
      local: L.local.image,
      bg: bg.image,
      mask: m,
      fineS: L.fine.scale,
      midS: L.mid.scale,
      localS: L.local.scale,
      bgS: bg.scale,
      maskW: m.width(),
      maskH: m.height(),
      hasMask: !!this.mask,
    });
  }

  destroy() {
    this.layers?.dispose();
    this.mask?.dispose();
    this.layers = null;
    this.mask = null;
    this.cache = null;
    this.listeners.clear();
  }
}

/** Full-resolution render of `work` with every adjustment, encoded as JPEG / PNG / WebP. */
export function renderToBytes(
  work: ImageBitmap,
  mask: { width: number; height: number; alpha: Uint8Array } | null,
  look: Look,
  type: string,
  quality = 0.92,
): Uint8Array {
  const img = asPic(work).image;
  const w = img.width();
  const h = img.height();
  const layers = new Layers(img);
  const m = mask ? maskImage(mask) : null;
  try {
    const surface = makeSurface(w, h);
    const canvas = surface.getCanvas();
    canvas.clear(Skia.Color('transparent'));
    const paint = Skia.Paint();
    paint.setBlendMode(BlendMode.Src);
    paint.setShader(makeLookShader(layers, m, look));
    canvas.drawRect(Skia.XYWHRect(0, 0, w, h), paint);
    const out = snapshot(surface);
    const fmt = type === 'image/png' ? ImageFormat.PNG : type === 'image/webp' ? ImageFormat.WEBP : ImageFormat.JPEG;
    const bytes = out.encodeToBytes(fmt, Math.round(quality * 100));
    out.dispose();
    if (!bytes?.length) throw new Error('Could not encode the image');
    return bytes;
  } finally {
    layers.dispose();
    m?.dispose();
  }
}

/**
 * Small square previews of one photo with each look applied, as JPEG data URIs (for the Looks strip).
 * The photo is cropped to its centre and scaled to `size`; every look is drawn with the same shader as the
 * full-size picture, so the thumbnails show what tapping a look will really do.
 */
export function renderLookThumbs(src: ImageBitmap, looks: Look[], size: number): string[] {
  const img = asPic(src).image;
  const side = Math.min(img.width(), img.height());
  const crop = makeSurface(size, size);
  crop
    .getCanvas()
    .drawImageRectOptions(
      img,
      Skia.XYWHRect((img.width() - side) / 2, (img.height() - side) / 2, side, side),
      Skia.XYWHRect(0, 0, size, size),
      FilterMode.Linear,
      MipmapMode.Linear,
      Skia.Paint(),
    );
  const small = snapshot(crop);
  const layers = new Layers(small);
  try {
    return looks.map((look) => {
      const surface = makeSurface(size, size);
      const paint = Skia.Paint();
      paint.setShader(makeLookShader(layers, null, look));
      surface.getCanvas().drawRect(Skia.XYWHRect(0, 0, size, size), paint);
      const out = snapshot(surface);
      const uri = `data:image/jpeg;base64,${out.encodeToBase64(ImageFormat.JPEG, 82)}`;
      out.dispose();
      return uri;
    });
  } finally {
    layers.dispose();
    small.dispose();
  }
}
