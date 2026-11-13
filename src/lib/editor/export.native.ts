import { FilterMode, ImageFormat, MipmapMode, Skia, matchFont } from '@shopify/react-native-skia';
import * as Clipboard from 'expo-clipboard';
import { Directory, File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { BRAND } from '@/lib/brand';
import { renderToBytes } from '@/lib/gl/compositor.native';
import { fmtMB, fmtSize } from '@/lib/format';
import { nextFrame } from '@/lib/imageio';
import { asPic, makeSurface, snapshot } from '@/lib/native/pic';
import { toast } from '@/lib/toast';
import { endBusy, startBusy } from './busy';
import { useEditor } from './store';

/** Export (native): full-resolution rendering, saved to the gallery or handed to the share sheet. */

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Transparent backgrounds need PNG, so JPEG switches to PNG automatically when they apply. */
export function exportType(): string {
  const s = useEditor.getState();
  return s.look.bg === 'transparent' && s.mask && s.exFormat === 'image/jpeg' ? 'image/png' : s.exFormat;
}

/** Render the working image with every adjustment, at full resolution, as encoded bytes. */
export async function renderFull(type: string, quality?: number): Promise<Uint8Array> {
  const s = useEditor.getState();
  return renderToBytes(s.work!, s.mask, s.look, type, quality);
}

/** Write bytes to a fresh file in the app's cache (replacing an older export of the same name). */
async function writeTemp(name: string, bytes: Uint8Array): Promise<File> {
  const dir = new Directory(Paths.cache, 'exports');
  if (!dir.exists) dir.create({ intermediates: true });
  const f = new File(dir, name);
  if (f.exists) f.delete();
  f.create();
  await f.write(bytes);
  return f;
}

async function saveToGallery(file: File) {
  const perm = await requestPermissionsAsync(true);
  if (!perm.granted) throw new Error('allow access to Photos to save images');
  await Asset.create(file.uri);
}

/** Gallery-style name for a saved photo, e.g. Mitakshi_20261024_105400.jpg (the picker only gives numeric ids). */
function galleryName(type: string) {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${BRAND.name}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${EXT[type] ?? 'jpg'}`;
}

/** Shared wrapper: shows the busy overlay, lets it paint, and reports failures. */
async function exporting(title: string, fn: () => Promise<void>) {
  const s = useEditor.getState();
  if (!s.work || s.busy) return;
  startBusy(title, fmtSize(s.work.width, s.work.height));
  try {
    await nextFrame();
    await fn();
  } catch (e) {
    console.error(e);
    toast(`${title.replace('…', '')} failed: ${(e as Error).message}`, 'error', 7000);
  } finally {
    endBusy();
  }
}

export const downloadImage = () =>
  exporting('Saving…', async () => {
    const type = exportType();
    const bytes = await renderFull(type, useEditor.getState().exQuality);
    const name = galleryName(type);
    await saveToGallery(await writeTemp(name, bytes));
    toast(`Saved ${name} to your gallery (${fmtMB(bytes.length)})${type !== useEditor.getState().exFormat ? ' · PNG keeps the transparent background' : ''}`, 'ok');
  });

export const shareImage = () =>
  exporting('Preparing…', async () => {
    const type = exportType();
    const file = await writeTemp(galleryName(type), await renderFull(type, 0.92));
    if (!(await Sharing.isAvailableAsync())) throw new Error('sharing is not available on this device');
    await Sharing.shareAsync(file.uri, { mimeType: type, dialogTitle: `Restored with ${BRAND.name}` });
  });

export const copyImage = () =>
  exporting('Copying…', async () => {
    // PNG keeps transparency; JPEG keeps the clipboard payload small for big photos.
    const type = exportType() === 'image/png' ? 'image/png' : 'image/jpeg';
    const file = await writeTemp(`clipboard.${EXT[type]}`, await renderFull(type, 0.92));
    await Clipboard.setImageAsync(await file.base64());
    toast('Copied to clipboard.', 'ok');
  });

/** A labelled side-by-side picture: the photo on the left, the result on the right. */
export const downloadComparison = () =>
  exporting('Creating before / after…', async () => {
    const s = useEditor.getState();
    const afterImg = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(await renderFull('image/jpeg', 0.95)));
    if (!afterImg) throw new Error('could not render the result');
    const before = asPic(s.original!).image;
    const H = Math.min(afterImg.height(), 1600);
    const aw = Math.round((afterImg.width() * H) / afterImg.height());
    const bw = Math.round((before.width() * H) / before.height());
    const gap = Math.round(H * 0.012);
    const surface = makeSurface(bw + aw + gap, H);
    const g = surface.getCanvas();
    g.clear(Skia.Color('#0c0c0d'));
    const paint = Skia.Paint();
    g.drawImageRectOptions(before, Skia.XYWHRect(0, 0, before.width(), before.height()), Skia.XYWHRect(0, 0, bw, H), FilterMode.Linear, MipmapMode.Linear, paint);
    g.drawImageRectOptions(afterImg, Skia.XYWHRect(0, 0, afterImg.width(), afterImg.height()), Skia.XYWHRect(bw + gap, 0, aw, H), FilterMode.Linear, MipmapMode.Linear, paint);
    afterImg.dispose();

    const fs = Math.round(H * 0.034);
    const font = matchFont({ fontFamily: 'sans-serif', fontSize: fs, fontWeight: 'bold' });
    const label = (text: string, x: number) => {
      const w = font.measureText(text).width;
      const bg = Skia.Paint();
      bg.setColor(Skia.Color('rgba(0,0,0,0.6)'));
      g.drawRRect(Skia.RRectXY(Skia.XYWHRect(x, fs * 0.6, w + fs, fs * 1.6), fs * 0.4, fs * 0.4), bg);
      const fg = Skia.Paint();
      fg.setColor(Skia.Color('#ffffff'));
      g.drawText(text, x + fs / 2, fs * 1.85, fg, font);
    };
    label('BEFORE', fs * 0.6);
    label(`AFTER · ${BRAND.name}`, bw + gap + fs * 0.6);

    const out = snapshot(surface);
    const bytes = out.encodeToBytes(ImageFormat.JPEG, 92);
    out.dispose();
    await saveToGallery(await writeTemp(galleryName('image/jpeg').replace('.jpg', '_before_after.jpg'), bytes));
    toast('Saved the before / after image to your gallery.', 'ok');
  });
