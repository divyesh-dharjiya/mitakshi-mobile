/**
 * Model files for the native engine. The face detector and the upscaler (used by every Enhance)
 * ship inside the app and are copied to app storage on first use (ONNX Runtime needs real file
 * paths).
 * Every other engine downloads once from Hugging Face into app storage, with progress and a size
 * check that rejects partial files, so the app itself stays small.
 */
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { MODELS, type ModelKey } from './registry';

/* eslint-disable @typescript-eslint/no-require-imports */
const BUNDLED: Partial<Record<ModelKey, { name: string; module: number }[]>> = {
  detector: [{ name: 'yunet.onnx', module: require('../../../public/models/yunet.onnx') }],
  sr: [{ name: 'esrgan_x4v3_rgba.onnx', module: require('../../../public/models/esrgan_x4v3_rgba.onnx') }],
};
/* eslint-enable @typescript-eslint/no-require-imports */

/** Bump when the bundled model files change, so devices copy the new ones. */
const BUNDLE_VERSION = '4';

const dir = () => {
  const d = new Directory(Paths.document, 'models');
  if (!d.exists) d.create({ intermediates: true });
  return d;
};
const fileOf = (url: string) => url.split('/').pop()!.split('?')[0];
/** ONNX Runtime wants a plain filesystem path, not a file:// URI. */
const toPath = (uri: string) => decodeURIComponent(uri.replace(/^file:\/\//, ''));

/** Thrown for network problems, which retrying on the CPU would not fix. */
export class DownloadError extends Error {
  name = 'DownloadError';
}

function storedLarge(key: ModelKey): File | null {
  const def = MODELS[key];
  if (!def.large || BUNDLED[key]) return null;
  for (const src of [{ url: def.url, bytes: def.large.bytes }, ...(def.fallbacks ?? [])]) {
    const f = new File(dir(), fileOf(src.url));
    if (f.exists && f.size === src.bytes) return f;
  }
  return null;
}

/** Large engines available offline: built into the app, or downloaded earlier. */
export async function cachedModels(): Promise<ModelKey[]> {
  return (Object.keys(MODELS) as ModelKey[]).filter((k) => MODELS[k].large && (BUNDLED[k] || storedLarge(k)));
}

/** Delete the downloaded engines (the bundled ones stay, they ship with the app). */
export async function clearModels() {
  for (const k of Object.keys(MODELS) as ModelKey[]) {
    const def = MODELS[k];
    if (BUNDLED[k] || !def.large) continue;
    for (const src of [def, ...(def.fallbacks ?? [])]) {
      const f = new File(dir(), fileOf(src.url));
      if (f.exists) f.delete();
    }
  }
}

async function copyBundled(key: ModelKey): Promise<string> {
  const files = BUNDLED[key]!;
  const d = dir();
  const marker = new File(d, `${key}.v${BUNDLE_VERSION}`);
  const targets = files.map((f) => new File(d, f.name));
  if (!marker.exists || targets.some((t) => !t.exists)) {
    for (const [i, f] of files.entries()) {
      const asset = await Asset.fromModule(f.module).downloadAsync();
      if (!asset.localUri) throw new Error(`Could not unpack ${f.name}`);
      if (targets[i].exists) targets[i].delete();
      // Move (not copy) out of the cache: no second copy of the model on the device.
      await new File(asset.localUri).move(targets[i]);
    }
    await marker.write(BUNDLE_VERSION);
  }
  return toPath(targets[0].uri);
}

async function download(key: ModelKey, onBytes: (loaded: number, total: number) => void): Promise<string> {
  const def = MODELS[key];
  // The main address first; the same file from another host when it is unreachable or the wrong size.
  const sources = [{ url: def.url, bytes: def.large!.bytes }, ...(def.fallbacks ?? [])];
  let failure = '';
  for (const src of sources) {
    const target = new File(dir(), fileOf(src.url));
    if (target.exists) target.delete();
    try {
      await File.downloadFileAsync(src.url, target, {
        idempotent: true,
        onProgress: ({ bytesWritten, totalBytes }) => onBytes(bytesWritten, totalBytes > 0 ? totalBytes : src.bytes),
      });
    } catch (e) {
      failure = (e as Error).message;
      continue;
    }
    const done = new File(dir(), fileOf(src.url));
    if (done.exists && done.size === src.bytes) return toPath(done.uri);
    if (done.exists) done.delete();
    failure = 'incomplete download';
  }
  throw new DownloadError(`Could not download the ${def.label.toLowerCase()}. Check your internet connection and try again. (${failure})`);
}

/** A local path to the model, downloading or unpacking it first when needed. */
export async function modelPath(key: ModelKey, onBytes: (loaded: number, total: number) => void): Promise<string> {
  if (BUNDLED[key]) return copyBundled(key);
  const hit = storedLarge(key);
  if (hit) return toPath(hit.uri);
  return download(key, onBytes);
}
