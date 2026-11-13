import { type GeoOp, geoMatrix } from './geo';
/** Decoding, resizing and saving images. Everything here runs in the browser only. */

/** Longest side of a decoded photo (keeps memory sane for 24 MP+ camera files). */
export const MAX_ORIGINAL = 4096;
/** Longest side of the on-screen preview. */
export const PREVIEW = 2048;
const MAX_PIXELS = 24e6;

/** Decode any image file (or URL), honouring EXIF orientation. Falls back to <img> for formats the fast path rejects. */
export async function decode(src: Blob | string, maxLong = MAX_ORIGINAL): Promise<ImageBitmap> {
  const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      bmp = await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return fit(bmp, maxLong);
}

/** Downscale to fit `maxLong` and the pixel budget. Closes the input unless `close` is false. */
export async function fit(bmp: ImageBitmap, maxLong: number, close = true): Promise<ImageBitmap> {
  const s = Math.min(1, maxLong / Math.max(bmp.width, bmp.height), Math.sqrt(MAX_PIXELS / (bmp.width * bmp.height)));
  if (s >= 1) return close ? bmp : createImageBitmap(bmp);
  const out = await createImageBitmap(bmp, {
    resizeWidth: Math.round(bmp.width * s),
    resizeHeight: Math.round(bmp.height * s),
    resizeQuality: 'high',
  });
  if (close) bmp.close();
  return out;
}

/** A rotated, flipped and/or cropped copy of a photo (the input stays open). */
export function transform(bmp: ImageBitmap, op: GeoOp): Promise<ImageBitmap> {
  const { m, w, h } = geoMatrix(op, bmp.width, bmp.height);
  const crop = op.crop ?? { x: 0, y: 0, w, h };
  const canvas = new OffscreenCanvas(crop.w, crop.h);
  const g = canvas.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, -crop.x, -crop.y);
  g.transform(m[0], m[3], m[1], m[4], m[2], m[5]);
  g.drawImage(bmp, 0, 0);
  return createImageBitmap(canvas);
}

/** An independent copy, safe to transfer to the AI worker. */
export const copy = (bmp: ImageBitmap) => createImageBitmap(bmp);

/** Trigger a browser download for a blob. The object URL is released after a while. */
export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 15_000);
}

/** Yield so the UI can paint (timer fallback, because rAF pauses in hidden tabs). */
export const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
    setTimeout(resolve, 40);
  });

/** RGBA pixels of a copy scaled to fit `maxSide` (for quick image statistics). */
export function readSmall(bmp: ImageBitmap, maxSide: number): { width: number; height: number; data: Uint8ClampedArray } {
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const width = Math.max(8, Math.round(bmp.width * s));
  const height = Math.max(8, Math.round(bmp.height * s));
  const g = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, width, height);
  return { width, height, data: g.getImageData(0, 0, width, height).data };
}
