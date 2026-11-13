import { BRAND } from '@/lib/brand';
import { Compositor } from '@/lib/gl/compositor';
import { fmtMB, fmtSize } from '@/lib/format';
import { nextFrame, saveBlob } from '@/lib/imageio';
import { toast } from '@/lib/toast';
import { endBusy, startBusy } from './busy';
import { useEditor } from './store';

/** Export: full-resolution rendering with every adjustment, plus share, copy and before/after images. */

/** Transparent backgrounds need PNG, so JPEG switches to PNG automatically when they apply. */
export function exportType(): string {
  const s = useEditor.getState();
  return s.look.bg === 'transparent' && s.mask && s.exFormat === 'image/jpeg' ? 'image/png' : s.exFormat;
}

/** Render the working image with every adjustment, at full resolution, into an encoded blob. */
export async function renderFull(type: string, quality?: number): Promise<Blob> {
  const s = useEditor.getState();
  const off = new OffscreenCanvas(2, 2);
  const comp = new Compositor(off, { preserveDrawingBuffer: true });
  try {
    comp.setOriginal(s.original!);
    comp.setImage(s.work!);
    comp.setMask(s.mask);
    comp.setLook(s.look);
    comp.setSplit(0);
    comp.render();
    return await off.convertToBlob({ type, quality: type === 'image/png' ? undefined : quality });
  } finally {
    comp.destroy();
  }
}

const fileName = (base: string, blob: Blob, suffix: string = BRAND.fileSuffix) => `${base}-${suffix}.${blob.type.split('/')[1].replace('jpeg', 'jpg')}`;

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
  exporting('Rendering…', async () => {
    const type = exportType();
    const blob = await renderFull(type, useEditor.getState().exQuality);
    const name = fileName(useEditor.getState().name, blob);
    saveBlob(blob, name);
    toast(`Saved ${name} (${fmtMB(blob.size)})${type !== useEditor.getState().exFormat ? ' · PNG keeps the transparent background' : ''}`, 'ok');
  });

export const shareImage = () =>
  exporting('Preparing…', async () => {
    const blob = await renderFull(exportType(), 0.92);
    const file = new File([blob], fileName(useEditor.getState().name, blob), { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: `Restored with ${BRAND.name}` }).catch(() => {});
    else toast('Sharing files is not supported here. Use Download instead.');
  });

export const copyImage = () =>
  exporting('Copying…', async () => {
    if (typeof ClipboardItem === 'undefined') throw new Error('not supported in this browser');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': await renderFull('image/png') })]);
    toast('Copied to clipboard.', 'ok');
  });

/** A labelled side-by-side picture: the photo on the left, the result on the right. */
export const downloadComparison = () =>
  exporting('Creating before / after…', async () => {
    const s = useEditor.getState();
    const after = await createImageBitmap(await renderFull('image/jpeg', 0.95));
    const before = s.original!;
    const H = Math.min(after.height, 1600);
    const aw = Math.round((after.width * H) / after.height);
    const bw = Math.round((before.width * H) / before.height);
    const gap = Math.round(H * 0.012);
    const c = new OffscreenCanvas(bw + aw + gap, H);
    const g = c.getContext('2d')!;
    g.fillStyle = '#0c0c0d';
    g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingQuality = 'high';
    g.drawImage(before, 0, 0, bw, H);
    g.drawImage(after, bw + gap, 0, aw, H);
    after.close();

    const fs = Math.round(H * 0.034);
    g.font = `700 ${fs}px system-ui, sans-serif`;
    const label = (text: string, x: number) => {
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.beginPath();
      g.roundRect(x, fs * 0.6, g.measureText(text).width + fs, fs * 1.6, fs * 0.4);
      g.fill();
      g.fillStyle = '#fff';
      g.fillText(text, x + fs / 2, fs * 1.85);
    };
    label('BEFORE', fs * 0.6);
    label(`AFTER · ${BRAND.name}`, bw + gap + fs * 0.6);

    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
    saveBlob(blob, `${s.name}-before-after.jpg`);
    toast('Saved before / after image.', 'ok');
  });
