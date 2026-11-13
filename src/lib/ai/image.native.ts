/** Pixel helpers for the native AI engine: the shared core plus Skia-based conversion and resizing. */
import { NativePic, asBitmap, asPic, imageFromRGBA, readRGBA, scaleImage } from '@/lib/native/pic';
import { type Raw } from './image-core';

export * from './image-core';

const toRaw = (px: Uint8Array, width: number, height: number): Raw => ({ width, height, data: new Uint8ClampedArray(px.buffer, px.byteOffset, px.byteLength) });

/** Pixels of a photo, optionally resized on the way. */
export function bitmapToRaw(bmp: ImageBitmap, width = bmp.width, height = bmp.height): Raw {
  const pic = asPic(bmp);
  if (width === pic.width && height === pic.height) return toRaw(readRGBA(pic.image), width, height);
  const small = scaleImage(pic.image, width, height);
  const px = readRGBA(small);
  small.dispose();
  return toRaw(px, width, height);
}

export const rawToBitmap = async (r: Raw): Promise<ImageBitmap> => asBitmap(NativePic.of(imageFromRGBA(r.data, r.width, r.height)));

/** High-quality resize (mipmapped Skia sampling). */
export async function resizeRaw(r: Raw, width: number, height: number): Promise<Raw> {
  const src = imageFromRGBA(r.data, r.width, r.height);
  const out = scaleImage(src, width, height);
  src.dispose();
  const px = readRGBA(out);
  out.dispose();
  return toRaw(px, width, height);
}
