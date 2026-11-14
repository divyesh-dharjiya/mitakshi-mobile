import { ImageFormat } from '@shopify/react-native-skia';
import { Directory, File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import type { EnhanceOptions } from '@/lib/ai/protocol';
import { getAI } from '@/lib/ai/client';
import { BRAND } from '@/lib/brand';
import { fmtSize } from '@/lib/format';
import { copy, decode } from '@/lib/imageio';
import { asPic } from '@/lib/native/pic';
import { makeZipBytes } from '@/lib/zip';
import { toast } from '@/lib/toast';
import { withRecovery } from './engine';
import { type BatchItem, useEditor } from './store';

/** Batch mode (native): enhance many photos in one go, then save each one or share them all as a ZIP. */

/** A photo chosen in the system picker. */
export interface PickedPhoto {
  uri: string;
  name: string;
}

let seq = 0;
let stop = false;

const baseOf = (name: string) => name.replace(/\.[^.]+$/, '') || 'photo';
const SUFFIX = BRAND.fileSuffix;

const outDir = () => {
  const d = new Directory(Paths.cache, 'batch');
  if (!d.exists) d.create({ intermediates: true });
  return d;
};

const removeFile = (uri?: string) => {
  if (!uri) return;
  const f = new File(uri);
  if (f.exists) f.delete();
};

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

export function addBatchFiles(files: PickedPhoto[]) {
  const added: BatchItem[] = files.map((f) => ({
    id: ++seq,
    source: f.uri,
    name: f.name,
    url: f.uri,
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
  removeFile(it.resultUrl);
  useEditor.setState({ batchItems: s.batchItems.filter((i) => i.id !== id) });
}

export function clearBatch() {
  const s = useEditor.getState();
  if (s.batchRunning) return;
  for (const it of s.batchItems) removeFile(it.resultUrl);
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
  const { batchScale, batchFaces } = start;

  for (const id of useEditor.getState().batchItems.map((i) => i.id)) {
    if (stop) break;
    const it = useEditor.getState().batchItems.find((i) => i.id === id);
    if (!it || it.status === 'done') continue;

    patch(id, { status: 'working', stage: 'Enhancing…', progress: 0.05, detail: '' });
    let bmp: ImageBitmap | null = null;
    try {
      bmp = await decode(it.source);
      const source = bmp;
      const opts: EnhanceOptions = { scale: batchScale, faces: batchFaces };
      const r = await withRecovery((safe) => copy(source).then((img) => getAI().enhance(img, { ...opts, safe }, (stage, v) => patch(id, { stage, progress: v }), false)));
      bmp.close();
      bmp = null;

      const pic = asPic(r.bitmap);
      const bytes = pic.image.encodeToBytes(ImageFormat.JPEG, 92);
      pic.close();
      removeFile(useEditor.getState().batchItems.find((i) => i.id === id)?.resultUrl);
      const out = new File(outDir(), `${id}-${baseOf(it.name)}-${SUFFIX}.jpg`);
      if (out.exists) out.delete();
      out.create();
      await out.write(bytes);
      patch(id, { status: 'done', stage: '', progress: 1, resultUrl: out.uri, detail: `Done · ${fmtSize(r.width, r.height)}` });
    } catch (e) {
      console.error(e);
      bmp?.close();
      patch(id, { status: 'error', stage: '', progress: 0, detail: (e as Error).name === 'AbortError' ? 'Stopped' : 'Failed. Try again' });
    }
  }

  useEditor.setState({ batchRunning: false });
  if (!stop) toast('Batch finished. Save the photos or share them as a ZIP.', 'ok');
}

/** Save one finished photo to the gallery. */
export async function downloadBatchItem(it: BatchItem) {
  if (!it.resultUrl) return;
  try {
    const perm = await requestPermissionsAsync(true);
    if (!perm.granted) throw new Error('allow access to Photos to save images');
    await Asset.create(it.resultUrl);
    toast(`Saved ${baseOf(it.name)} to your gallery.`, 'ok');
  } catch (e) {
    toast(`Could not save: ${(e as Error).message}`, 'error', 6000);
  }
}

/** Every finished photo in one ZIP, handed to the share sheet (duplicate names get a number). */
export async function downloadBatchZip() {
  const used = new Set<string>();
  const files: { name: string; data: Uint8Array }[] = [];
  for (const i of useEditor.getState().batchItems) {
    if (!i.resultUrl) continue;
    const base = baseOf(i.name);
    let name = `${base}-${SUFFIX}.jpg`;
    for (let n = 2; used.has(name); n++) name = `${base}-${SUFFIX}-${n}.jpg`;
    used.add(name);
    files.push({ name, data: await new File(i.resultUrl).bytes() });
  }
  if (!files.length) return;
  try {
    const zip = new File(outDir(), `${SUFFIX}-${files.length}-photos.zip`);
    if (zip.exists) zip.delete();
    zip.create();
    await zip.write(makeZipBytes(files));
    await Sharing.shareAsync(zip.uri, { mimeType: 'application/zip', dialogTitle: `${files.length} photos from ${BRAND.name}` });
  } catch (e) {
    toast(`Could not create the ZIP: ${(e as Error).message}`, 'error', 6000);
  }
}
