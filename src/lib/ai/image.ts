/** Pixel helpers for the AI worker: the shared core plus browser-specific decode / encode / resize. */
import { type Raw } from './image-core';

export * from './image-core';

export function bitmapToRaw(bmp: ImageBitmap | OffscreenCanvas, width = bmp.width, height = bmp.height): Raw {
  const c = new OffscreenCanvas(width, height);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, width, height);
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}

export const rawToBitmap = (r: Raw) => createImageBitmap(new ImageData(r.data as Uint8ClampedArray<ArrayBuffer>, r.width, r.height));

/** High-quality resize via the browser's own resampler. */
export async function resizeRaw(r: Raw, width: number, height: number): Promise<Raw> {
  const bmp = await rawToBitmap(r);
  const out = bitmapToRaw(bmp, width, height);
  bmp.close();
  return out;
}

