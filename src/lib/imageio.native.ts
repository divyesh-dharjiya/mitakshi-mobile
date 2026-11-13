/** Decoding and resizing photos in the native app (Skia). Mirrors imageio.ts (browser). */
import { Skia, type SkImage } from '@shopify/react-native-skia';
import * as Device from 'expo-device';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { type GeoOp, geoMatrix } from './geo';
import { NativePic, SAMPLING, asBitmap, asPic, makeSurface, readRGBA, scaleImage, snapshot } from './native/pic';

/** Longest side of a decoded photo. */
export const MAX_ORIGINAL = 4096;
/** Longest side of the on-screen preview. */
export const PREVIEW = 2048;
/**
 * Pixel budget of the working photo, by the phone's memory. Every step holds several full-size copies
 * (the photo, undo steps, the AI's buffers), and Android ends apps that grow too big, so a phone with
 * 4 GB works at 8 MP (plenty for a screen and for sharing) and one with 8 GB or more at 16 MP.
 */
const gb = (Device.totalMemory ?? 4e9) / 1e9;
const MAX_PIXELS = gb >= 7 ? 16e6 : gb >= 5 ? 12e6 : gb >= 3.5 ? 8e6 : 6e6;

/** EXIF orientation (1–8) of a JPEG, or 1 when absent. */
function jpegOrientation(b: Uint8Array): number {
  if (b[0] !== 0xff || b[1] !== 0xd8) return 1;
  let i = 2;
  while (i + 4 < b.length && b[i] === 0xff) {
    const marker = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    // APP1 "Exif\0\0"
    if (marker === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
      const t = i + 10;
      const le = b[t] === 0x49;
      const u16 = (o: number) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
      const u32 = (o: number) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
      const ifd = t + u32(t + 4);
      const n = u16(ifd);
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12;
        if (u16(e) === 0x0112) {
          const v = u16(e + 8);
          return v >= 1 && v <= 8 ? v : 1;
        }
      }
      return 1;
    }
    if (marker === 0xda) break; // image data starts: no more metadata
    i += 2 + len;
  }
  return 1;
}

/** Destination = M · source for each EXIF orientation, for a W × H source. */
function orientMatrix(o: number, W: number, H: number): number[] {
  switch (o) {
    case 2: return [-1, 0, W, 0, 1, 0];
    case 3: return [-1, 0, W, 0, -1, H];
    case 4: return [1, 0, 0, 0, -1, H];
    case 5: return [0, 1, 0, 1, 0, 0];
    case 6: return [0, -1, H, 1, 0, 0];
    case 7: return [0, -1, H, -1, 0, W];
    case 8: return [0, 1, 0, -1, 0, W];
    default: return [1, 0, 0, 0, 1, 0];
  }
}

async function decodeBytes(uri: string): Promise<{ image: SkImage; orientation: number }> {
  const bytes = await new File(uri).bytes();
  const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
  if (image) return { image, orientation: jpegOrientation(bytes) };
  // Formats Skia can't read here (e.g. HEIC): let the OS decoder convert to JPEG (it bakes in the rotation).
  const ref = await ImageManipulator.manipulate(uri).renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 1 });
  const again = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(await new File(out.uri).bytes()));
  new File(out.uri).delete();
  if (!again) throw new Error('unsupported image format');
  return { image: again, orientation: 1 };
}

/** Decode a photo file (URI), upright and fitted to `maxLong` and the pixel budget. */
export async function decode(src: Blob | string, maxLong = MAX_ORIGINAL): Promise<ImageBitmap> {
  if (typeof src !== 'string') throw new Error('Expected a file URI');
  const { image, orientation } = await decodeBytes(src);
  const W = image.width();
  const H = image.height();
  const swap = orientation >= 5;
  const s = Math.min(1, maxLong / Math.max(W, H), Math.sqrt(MAX_PIXELS / (W * H)));
  // Always draw once: it applies the rotation and scale, and turns Skia's lazily-decoded image
  // into plain pixels (otherwise every read would decode the file again).
  const ow = Math.max(1, Math.round((swap ? H : W) * s));
  const oh = Math.max(1, Math.round((swap ? W : H) * s));
  const surface = makeSurface(ow, oh);
  const canvas = surface.getCanvas();
  const [a, b, c, d, e, f] = orientMatrix(orientation, W, H);
  canvas.scale(ow / (swap ? H : W), oh / (swap ? W : H));
  canvas.concat(Skia.Matrix([a, b, c, d, e, f, 0, 0, 1]));
  canvas.drawImageRectOptions(image, Skia.XYWHRect(0, 0, W, H), Skia.XYWHRect(0, 0, W, H), SAMPLING.filter, SAMPLING.mipmap, Skia.Paint());
  image.dispose();
  return asBitmap(NativePic.of(snapshot(surface)));
}

/** Downscale to fit `maxLong` and the pixel budget. Closes the input unless `close` is false. */
export async function fit(bmp: ImageBitmap, maxLong: number, close = true): Promise<ImageBitmap> {
  const pic = asPic(bmp);
  const s = Math.min(1, maxLong / Math.max(pic.width, pic.height), Math.sqrt(MAX_PIXELS / (pic.width * pic.height)));
  if (s >= 1) return close ? bmp : asBitmap(pic.copy());
  const out = NativePic.of(scaleImage(pic.image, Math.round(pic.width * s), Math.round(pic.height * s)));
  if (close) pic.close();
  return asBitmap(out);
}

/** A rotated, flipped and/or cropped copy of a photo (the input stays open). */
export function transform(bmp: ImageBitmap, op: GeoOp): ImageBitmap {
  const pic = asPic(bmp);
  const { m, w, h } = geoMatrix(op, pic.width, pic.height);
  const crop = op.crop ?? { x: 0, y: 0, w, h };
  const surface = makeSurface(crop.w, crop.h);
  const canvas = surface.getCanvas();
  canvas.translate(-crop.x, -crop.y);
  canvas.concat(Skia.Matrix([m[0], m[1], m[2], m[3], m[4], m[5], 0, 0, 1]));
  canvas.drawImageRectOptions(pic.image, Skia.XYWHRect(0, 0, pic.width, pic.height), Skia.XYWHRect(0, 0, pic.width, pic.height), SAMPLING.filter, SAMPLING.mipmap, Skia.Paint());
  return asBitmap(NativePic.of(snapshot(surface)));
}

/** An independent handle, safe to hand to the AI engine (which closes it when done). */
export const copy = async (bmp: ImageBitmap): Promise<ImageBitmap> => asBitmap(asPic(bmp).copy());

/** Yield so the UI can update between heavy steps. */
export const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 16));

/** RGBA pixels of a copy scaled to fit `maxSide` (for quick image statistics). */
export function readSmall(bmp: ImageBitmap, maxSide: number): { width: number; height: number; data: Uint8ClampedArray } {
  const pic = asPic(bmp);
  const s = Math.min(1, maxSide / Math.max(pic.width, pic.height));
  const width = Math.max(8, Math.round(pic.width * s));
  const height = Math.max(8, Math.round(pic.height * s));
  const small = scaleImage(pic.image, width, height);
  const px = readRGBA(small);
  small.dispose();
  return { width, height, data: new Uint8ClampedArray(px.buffer, px.byteOffset, px.byteLength) };
}

/** Not used natively (exports go through the share sheet / gallery); kept for API parity. */
export function saveBlob(): never {
  throw new Error('saveBlob is browser-only');
}
