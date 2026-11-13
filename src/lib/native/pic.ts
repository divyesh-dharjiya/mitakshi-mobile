import { AlphaType, ColorType, FilterMode, MipmapMode, Skia, type SkImage, type SkSurface } from '@shopify/react-native-skia';

/**
 * The native stand-in for the browser's ImageBitmap: a Skia image with the same `width`,
 * `height` and `close()` shape, so the shared editor code works unchanged. Copies share one
 * image and the pixels are released when the last copy is closed.
 *
 * Images are always CPU-backed (raster): textures made on the JS thread cannot be drawn by the
 * UI thread's GPU context, and raster images can be read back without a round trip.
 */
export class NativePic {
  readonly width: number;
  readonly height: number;
  private closed = false;

  private constructor(private readonly box: { image: SkImage; refs: number }) {
    this.width = box.image.width();
    this.height = box.image.height();
  }

  static of(image: SkImage): NativePic {
    // A raster image comes back as another reference to the same pixels, so this is cheap.
    const raster = image.makeNonTextureImage() ?? image;
    if (raster !== image) image.dispose();
    return new NativePic({ image: raster, refs: 1 });
  }

  get image(): SkImage {
    if (this.closed) throw new Error('Image already released');
    return this.box.image;
  }

  /** Another handle to the same pixels (cheap). */
  copy(): NativePic {
    this.box.refs++;
    return new NativePic(this.box);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (--this.box.refs === 0) this.box.image.dispose();
  }
}

/** The editor stores images typed as ImageBitmap; on native they are NativePic. */
export const asPic = (bmp: ImageBitmap | NativePic) => bmp as unknown as NativePic;
export const asBitmap = (pic: NativePic) => pic as unknown as ImageBitmap;

export const RGBA = { colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul } as const;
export const SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.Linear } as const;

/** A drawing surface: GPU when available (fast), CPU raster otherwise (always works, any size). */
export function makeSurface(width: number, height: number): SkSurface {
  const s = width * height <= 4096 * 4096 ? Skia.Surface.MakeOffscreen(width, height) : null;
  const surface = s ?? Skia.Surface.Make(width, height);
  if (!surface) throw new Error(`Not enough memory for a ${width} × ${height} image`);
  return surface;
}

/** Finish drawing on a surface and return its pixels as a raster image. */
export function snapshot(surface: SkSurface): SkImage {
  surface.flush();
  const img = surface.makeImageSnapshot();
  const raster = img.makeNonTextureImage() ?? img;
  if (raster !== img) img.dispose();
  surface.dispose();
  return raster;
}

/** Draw `image` scaled to `width × height` with smooth (mipmapped) filtering. */
export function scaleImage(image: SkImage, width: number, height: number): SkImage {
  const surface = makeSurface(width, height);
  const paint = Skia.Paint();
  surface
    .getCanvas()
    .drawImageRectOptions(image, Skia.XYWHRect(0, 0, image.width(), image.height()), Skia.XYWHRect(0, 0, width, height), SAMPLING.filter, SAMPLING.mipmap, paint);
  return snapshot(surface);
}

/** RGBA8 (unpremultiplied) pixels of an image. */
export function readRGBA(image: SkImage): Uint8Array {
  const w = image.width();
  const h = image.height();
  const px = image.readPixels(0, 0, { width: w, height: h, ...RGBA });
  if (!px || !(px instanceof Uint8Array)) throw new Error('Could not read the image pixels');
  return px;
}

/** A raster image from RGBA8 (unpremultiplied) pixels. */
export function imageFromRGBA(data: Uint8Array | Uint8ClampedArray, width: number, height: number): SkImage {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const img = Skia.Image.MakeImage({ width, height, ...RGBA }, Skia.Data.fromBytes(bytes), width * 4);
  if (!img) throw new Error('Could not create an image');
  return img;
}
