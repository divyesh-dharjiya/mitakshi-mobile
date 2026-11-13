import type { EnhanceOptions } from '@/lib/ai/protocol';
import { getAI } from '@/lib/ai/client';
import { BRAND } from '@/lib/brand';
import { fmtSize } from '@/lib/format';
import { copy, decode, saveBlob } from '@/lib/imageio';
import { makeZip } from '@/lib/zip';
import { toast } from '@/lib/toast';
import { withRecovery } from './engine';
import { type BatchItem, useEditor } from './store';

/** Batch mode: enhance many photos in one go, then download each result or everything as a ZIP. */

let seq = 0;
let stop = false;

const baseOf = (name: string) => name.replace(/\.[^.]+$/, '') || 'photo';
const SUFFIX = BRAND.fileSuffix;
const isImage = (f: File) => f.type.startsWith('image/') || !f.type;

export function openBatch() {
  useEditor.setState({ batchOpen: true });
}

/** Close the dialog. Closing during a run stops it after the current photo. */
export function closeBatch() {
  if (useEditor.getState().batchRunning) {
    stop = true;
    getAI().cancel();
  }
  useEditor.setState({ batchOpen: false });
}

export function addBatchFiles(files: File[]) {
  const added: BatchItem[] = files.filter(isImage).map((file) => ({
    id: ++seq,
    source: file,
    name: file.name,
    url: URL.createObjectURL(file),
    status: 'queued',
    stage: 'Waiting',
    progress: 0,
    detail: '',
  }));
  useEditor.setState((s) => ({ batchItems: [...s.batchItems, ...added] }));
}

export function removeBatchItem(id: number) {
  const s = useEditor.getState();
  const it = s.batchItems.find((i) => i.id === id);
  if (!it || s.batchRunning) return;
  URL.revokeObjectURL(it.url);
  if (it.resultUrl) URL.revokeObjectURL(it.resultUrl);
  useEditor.setState({ batchItems: s.batchItems.filter((i) => i.id !== id) });
}

export function clearBatch() {
  const s = useEditor.getState();
  if (s.batchRunning) return;
  for (const it of s.batchItems) {
    URL.revokeObjectURL(it.url);
    if (it.resultUrl) URL.revokeObjectURL(it.resultUrl);
  }
  useEditor.setState({ batchItems: [] });
}

function patch(id: number, p: Partial<BatchItem>) {
  useEditor.setState((s) => ({ batchItems: s.batchItems.map((it) => (it.id === id ? { ...it, ...p } : it)) }));
}

/** Enhance every photo that isn't done yet, one after another, with the dialog's settings. */
export async function runBatch() {
  const start = useEditor.getState();
  if (start.batchRunning) return;
  stop = false;
  useEditor.setState({ batchRunning: true });
  const { batchScale, batchFaces, batchColor } = start;

  for (const id of useEditor.getState().batchItems.map((i) => i.id)) {
    if (stop) break;
    const it = useEditor.getState().batchItems.find((i) => i.id === id);
    if (!it || it.status === 'done') continue;

    patch(id, { status: 'working', stage: 'Enhancing…', progress: 0.05, detail: '' });
    let bmp: ImageBitmap | null = null;
    try {
      bmp = await decode(it.source);
      const source = bmp;
      const grayscale = batchColor ? (await getAI().scan(await copy(source))).grayscale : false;
      // One engine per photo: colour for a black & white print, faces for everything else.
      const opts: EnhanceOptions = { scale: batchScale, faces: batchFaces && !grayscale, colorize: grayscale };
      const r = await withRecovery((safe) =>
        copy(source).then((img) =>
          getAI().enhance(img, { ...opts, safe }, (stage, v) => patch(id, { stage, progress: v }), false),
        ),
      );
      bmp.close();
      bmp = null;

      const canvas = new OffscreenCanvas(r.width, r.height);
      canvas.getContext('2d')!.drawImage(r.bitmap, 0, 0);
      r.bitmap.close();
      const result = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
      const previous = useEditor.getState().batchItems.find((i) => i.id === id)?.resultUrl;
      if (previous) URL.revokeObjectURL(previous);
      patch(id, {
        status: 'done',
        stage: '',
        progress: 1,
        result,
        resultUrl: URL.createObjectURL(result),
        detail: `Done · ${fmtSize(r.width, r.height)}`,
      });
    } catch (e) {
      console.error(e);
      bmp?.close();
      patch(id, {
        status: 'error',
        stage: '',
        progress: 0,
        detail: (e as Error).name === 'AbortError' ? 'Stopped' : 'Failed. Try again',
      });
    }
  }

  useEditor.setState({ batchRunning: false });
  if (!stop) toast('Batch finished. Download everything as a ZIP.', 'ok');
}

export function downloadBatchItem(it: BatchItem) {
  if (it.result) saveBlob(it.result, `${baseOf(it.name)}-${SUFFIX}.jpg`);
}

/** Download every finished photo in one ZIP (duplicate names get a number). */
export async function downloadBatchZip() {
  const used = new Set<string>();
  const files = useEditor
    .getState()
    .batchItems.flatMap((i) => {
      if (!i.result) return [];
      const base = baseOf(i.name);
      let name = `${base}-${SUFFIX}.jpg`;
      for (let n = 2; used.has(name); n++) name = `${base}-${SUFFIX}-${n}.jpg`;
      used.add(name);
      return [{ name, blob: i.result }];
    });
  if (!files.length) return;
  saveBlob(await makeZip(files), `${SUFFIX}-${files.length}-photos.zip`);
}
