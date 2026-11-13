import { MODELS, type ModelKey } from './registry';

/**
 * Small models are self-hosted and cached by the browser / service worker. Large models stream
 * into the Origin Private File System so they download exactly once; a size check rejects partial
 * files. (The Cache API refuses single entries of a few hundred MB in Chrome; OPFS is built for it.)
 */
const DIR = 'mitakshi-models-v1';
/** Folder of an early build, which held 600 MB of engines this app no longer uses. */
const OLD_DIR = 'reviva-models-v1';
const fileOf = (url: string) => url.split('/').pop()!.split('?')[0];

async function dir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await (await navigator.storage.getDirectory()).getDirectoryHandle(DIR, { create: true });
  } catch {
    return null; // OPFS unavailable (private mode / old browser): download each session
  }
}

/** Every place a model can come from: the main address, then its fallbacks. */
const sourcesOf = (key: ModelKey) => [{ url: MODELS[key].url, bytes: MODELS[key].large?.bytes }, ...(MODELS[key].fallbacks ?? [])];

async function stored(key: ModelKey): Promise<File | null> {
  if (!MODELS[key].large) return null;
  const d = await dir();
  for (const src of sourcesOf(key)) {
    try {
      const f = await (await d?.getFileHandle(fileOf(src.url)))?.getFile();
      if (f && f.size === src.bytes) return f;
    } catch {
      /* not stored under this name */
    }
  }
  return null;
}

export async function cachedModels(): Promise<ModelKey[]> {
  const out: ModelKey[] = [];
  for (const k of Object.keys(MODELS) as ModelKey[]) if (await stored(k)) out.push(k);
  return out;
}

export async function clearModels() {
  for (const name of [DIR, OLD_DIR]) {
    try {
      await (await navigator.storage.getDirectory()).removeEntry(name, { recursive: true });
    } catch {
      /* nothing stored */
    }
  }
}

async function download(url: string, expected: number | undefined, persist: boolean, onBytes: (loaded: number, total: number) => void) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${fileOf(url)}`);
  const total = Number(res.headers.get('content-length')) || expected || 0;
  let writable: FileSystemWritableFileStream | null = null;
  if (persist) {
    try {
      const d = await dir();
      writable = d ? await (await d.getFileHandle(fileOf(url), { create: true })).createWritable() : null;
    } catch {
      writable = null; // quota / unsupported: still usable this session
    }
  }
  const chunks: Uint8Array[] = [];
  const reader = res.body.getReader();
  let loaded = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      if (writable) await writable.write(value).catch(() => ((writable = null), undefined));
      onBytes(loaded, total || loaded);
    }
    await writable?.close();
  } catch (e) {
    await writable?.abort().catch(() => {});
    throw e;
  }
  const buf = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) (buf.set(c, o), (o += c.byteLength));
  return buf;
}

export interface LoadedModel {
  model: Uint8Array;
}

export async function loadModel(key: ModelKey, onBytes: (loaded: number, total: number) => void): Promise<LoadedModel> {
  const hit = await stored(key);
  if (hit) {
    const model = new Uint8Array(await hit.arrayBuffer());
    onBytes(model.byteLength, model.byteLength);
    return { model };
  }
  let failure: unknown;
  for (const src of sourcesOf(key)) {
    try {
      return { model: await download(src.url, src.bytes, !!MODELS[key].large, onBytes) };
    } catch (e) {
      failure = e; // try the next address
    }
  }
  throw failure instanceof Error ? failure : new Error('Download failed');
}
