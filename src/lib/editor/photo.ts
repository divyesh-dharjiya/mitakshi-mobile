import { getAI } from '@/lib/ai/client';
import { debug } from '@/lib/debug';
import { NEUTRAL } from '@/lib/gl/look';
import { baseName } from '@/lib/format';
import { copy, decode, fit, MAX_ORIGINAL, PREVIEW } from '@/lib/imageio';
import { toast } from '@/lib/toast';
import { ensureMatte } from './background';
import { endBusy, isBusy, startBusy } from './busy';
import { markCached } from './engine';
import { rt } from './runtime';
import { type PhotoSource, useEditor } from './store';

/** Working images that were cropped, rotated or flipped (so before/after must be off while one is showing). */
const geomSet = new WeakSet<object>();

/** Earlier working images for Undo. Kept out of React state; only the depth is shared. */
const history: ImageBitmap[] = [];
const MAX_HISTORY = 3;

const syncDepth = () => useEditor.setState({ historyDepth: history.length });

/**
 * Make `bmp` the working image. With `remember`, the previous image goes on the Undo stack.
 * Also refreshes the preview and the background matte. `geometric` marks a crop, rotation or flip.
 */
export async function setWork(bmp: ImageBitmap, remember = true, geometric?: boolean) {
  const s = useEditor.getState();
  const prev = s.work;
  const maxTexture = rt.comp?.maxTextureSize ?? 4096;
  const fitted = await fit(bmp, Math.min(MAX_ORIGINAL * 2, maxTexture, 16384));

  if (prev && remember) {
    history.push(prev);
    while (history.length > MAX_HISTORY) {
      const old = history.shift()!;
      if (old !== s.original) old.close();
    }
  } else if (prev && prev !== s.original && !history.includes(prev)) {
    prev.close();
  }
  syncDepth();

  // Cropped, rotated or flipped photos no longer line up with the untouched original; AI results inherit the flag.
  const geom = geometric ?? (prev ? geomSet.has(prev) : false);
  if (geom) geomSet.add(fitted);
  const preview = await fit(fitted, PREVIEW, false);
  s.preview?.close();
  useEditor.setState({ work: fitted, preview, mask: null, geom });

  debug('setWork', { work: [fitted.width, fitted.height], preview: [preview.width, preview.height] });
  rt.comp?.setImage(preview);
  rt.comp?.setMask(null);
  rt.viewer?.setImageSize(preview.width, preview.height, true);

  // The background matte belongs to the picture it was computed on, so recompute it when needed.
  if (useEditor.getState().look.bg !== 'none') void ensureMatte();
}

let scanning: Promise<void> = Promise.resolve();

/** Resolves when the scan of the photo that was opened last has finished. */
export const scanDone = () => scanning;

/** Quick scan that picks sensible defaults for this photo (faces, black & white, output size). */
export async function scanPhoto() {
  const original = useEditor.getState().original;
  if (!original) return;
  try {
    // The 2048 px preview is plenty to find faces and judge the photo, and far lighter than the full photo.
    const r = await getAI().scan(await copy(useEditor.getState().origPreview ?? original));
    if (useEditor.getState().original !== original) return;
    const mp = (original.width * original.height) / 1e6;
    markCached(['detector']);
    useEditor.setState((s) => ({
      scan: { faces: r.faces, grayscale: r.grayscale },
      // Upscaling cost grows with the photo's pixels, so it is automatic only where it is quick and useful: small
      // photos get 4×, mid-size ones 2×, and anything above 1.5 MP (most phone photos) keeps its size.
      opts: { ...s.opts, faces: r.faces > 0 && !r.grayscale, colorize: r.grayscale, scale: mp > 1.5 ? 1 : mp < 0.25 ? 4 : 2 },
    }));
  } catch (e) {
    console.warn('scan failed', e);
  }
}

/** Open a photo file as the new project. */
export async function loadPhoto(file: PhotoSource, name = 'photo') {
  if (isBusy()) return toast('Please wait for the current task to finish.');
  if (typeof file !== 'string' && file.type && !file.type.startsWith('image/')) return toast('That file is not an image.', 'error');
  startBusy('Opening photo…', name);
  try {
    const original = await decode(file);
    const s = useEditor.getState();
    for (const b of new Set([s.original, s.work, s.preview, s.origPreview, ...history])) b?.close();
    history.length = 0;
    const origPreview = await fit(original, PREVIEW, false);

    useEditor.setState({
      original,
      origPreview,
      work: null,
      preview: null,
      name: baseName(name),
      faces: null,
      scan: null,
      look: { ...NEUTRAL },
      activeFilter: 'none',
      mask: null,
      bgNotice: null,
    });
    syncDepth();

    rt.comp?.setOriginal(origPreview);
    await setWork(await copy(original), false);
    rt.viewer?.fit();
    scanning = scanPhoto();
  } catch (e) {
    console.error(e);
    toast(`Could not open this image: ${(e as Error).message || 'unsupported file'}`, 'error', 6000);
  } finally {
    endBusy();
  }
}

/** Close the photo and go back to the home screen. */
export function closePhoto() {
  if (isBusy()) return;
  const s = useEditor.getState();
  const bitmaps = new Set([s.original, s.work, s.preview, s.origPreview, ...history]);
  history.length = 0;
  useEditor.setState({ original: null, origPreview: null, work: null, preview: null, faces: null, scan: null, mask: null, bgNotice: null, compare: false, tab: 'enhance' });
  syncDepth();
  // Free the pictures once the editor has unmounted, so no last frame draws a released image.
  setTimeout(() => {
    for (const b of bitmaps) b?.close();
  }, 500);
}

/** Step back to the previous working image. */
export async function undo() {
  const prev = history.pop();
  if (!prev || isBusy()) return syncDepth();
  const cur = useEditor.getState().work;
  useEditor.setState({ work: null, faces: null });
  syncDepth();
  if (cur && cur !== useEditor.getState().original) cur.close();
  await setWork(prev, false, geomSet.has(prev));
}

/** Go back to the untouched photo (this can itself be undone). */
export async function revert() {
  const { original, busy } = useEditor.getState();
  if (!original || busy) return;
  useEditor.setState({ faces: null });
  await setWork(await copy(original), true, false);
}
