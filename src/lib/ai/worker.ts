/// <reference lib="webworker" />
/**
 * All AI inference runs here, off the main thread. ONNX Runtime uses WebGPU when present and
 * falls back to multi-threaded WASM. The last enhance result stays in memory so per-face strength
 * changes only re-run the cheap paste-back.
 */
import * as ort from 'onnxruntime-web/webgpu';
import { type Face, alignMatrix, detectFaces, pasteFaces, restoreFace } from './faces';
import { type Affine, type Raw, bitmapToRaw, cloneRaw, isGrayscale, rawToBitmap, resizeRaw } from './image';
import { cachedModels, clearModels, loadModel } from './models';
import type { EnhanceOptions, FaceInfo, Req, Res } from './protocol';
import { MODELS, type ModelKey, RESTORER_SIZE } from './registry';
import { colorize, matte, superResolve, upscaleCrop } from './tasks';

// Self-hosted WASM engine: copied to /ort/ for builds (tools/copy-ort.mjs). Vite's dev server can't
// serve module imports from /public, so dev reads the same files from node_modules.
const assetBase = (process.env.NEXT_PUBLIC_ASSET_BASE ?? '').replace(/\/$/, '');
ort.env.wasm.wasmPaths = `${assetBase}/ort/`; // copied into public/ort by tools/copy-ort.mjs
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
ort.env.logLevel = 'error';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: Res, transfer: Transferable[] = []) => scope.postMessage(m, transfer);
const dev = (message: string) => process.env.NODE_ENV !== 'production' && post({ type: 'log', id: 0, message });

/** Super-resolution output budget (keeps memory sane on laptops and phones). */
const MAX_SR_PIXELS = 16_000_000;
/** Faces smaller than this carry too little information to restore credibly. */
const MIN_FACE_PX = 32;
/** Restoring a face costs seconds: the biggest ones in a crowd are the ones people look at. */
const MAX_FACES = 8;
/** Rough relative cost of each step (a restored face = 1), for one overall progress bar. */
const COST = { detect: 0.15, load: 0.3, face: 0.5, tile: 0.35, colorize: 0.8, finish: 0.3 };

// ── Backend ─────────────────────────────────────────────────────────────────────────────────
type GPUish = { requestAdapter(): Promise<{ info?: { vendor?: string } } | null> };
let backendP: Promise<'webgpu' | 'wasm'> | null = null;
function backend() {
  backendP ??= (async () => {
    try {
      const adapter = await (navigator as Navigator & { gpu?: GPUish }).gpu?.requestAdapter();
      if (adapter) {
        return 'webgpu' as const;
      }
    } catch {
      /* fall through */
    }
    return 'wasm' as const;
  })();
  return backendP;
}

// ── GPU watchdog: when the OS resets a GPU mid-job, fail the job so the client can retry safely ──
let currentJob = 0;
let watching = false;
async function watchDevice() {
  if (watching) return;
  watching = true;
  try {
    type Lost = { reason: string; message: string };
    const device = (await Promise.resolve(ort.env.webgpu.device)) as { lost: Promise<Lost> } | undefined;
    device?.lost.then((i: Lost) => {
      dev(`GPU device lost: ${i.reason} ${i.message}`);
      post({ type: 'error', id: currentJob, message: 'The GPU was reset by the system', gpuLost: true });
    });
  } catch {
    watching = false;
  }
}

// ── Sessions (small LRU for the big models) ──────────────────────────────────────────────────
const SMALL: ModelKey[] = ['detector', 'sr', 'matte'];
const MAX_BIG = 2;
const sessions = new Map<string, Promise<ort.InferenceSession>>();

function evict() {
  const big = [...sessions.keys()].filter((k) => !SMALL.includes(k.split(':')[0] as ModelKey));
  while (big.length > MAX_BIG) {
    const victim = big.shift()!;
    const p = sessions.get(victim)!;
    sessions.delete(victim);
    p.then((s) => s.release()).catch(() => {});
  }
}

function session(key: ModelKey, job: number, cpu = false) {
  const id = cpu ? `${key}:cpu` : key;
  const hit = sessions.get(id);
  if (hit) {
    sessions.delete(id);
    sessions.set(id, hit); // most recently used
    return hit;
  }
  const def = MODELS[key];
  const p = (async () => {
    const { model } = await loadModel(key, (loaded, total) => {
      if (def.large) post({ type: 'progress', id: job, stage: `Downloading ${def.label}`, value: loaded / total, bytes: [loaded, total] });
    });
    post({ type: 'progress', id: job, stage: `Starting ${def.label.toLowerCase()}…`, value: 1 });
    const be = cpu ? 'wasm' : await backend();
    try {
      const t = performance.now();
      const s = await ort.InferenceSession.create(model, {
        executionProviders: be === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'],
        graphOptimizationLevel: be === 'webgpu' ? 'basic' : 'all',
        logSeverityLevel: 3,
      });
      dev(`session ${id}: ${Math.round(performance.now() - t)} ms`);
      if (be === 'webgpu') watchDevice();
      return s;
    } catch (e) {
      if (be !== 'webgpu') throw e;
      return ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all', logSeverityLevel: 3 });
    }
  })();
  p.catch(() => sessions.delete(id));
  sessions.set(id, p);
  evict();
  return p;
}

let cancelled = false;
const checkpoint = () => {
  if (cancelled) throw new DOMException('Cancelled', 'AbortError');
};
const progress = (job: number, stage: string, value: number) => post({ type: 'progress', id: job, stage, value });

// ── Enhance ──────────────────────────────────────────────────────────────────────────────────
let last: { base: Raw; faces: { restored: Raw; matrix: Affine; size: 256 | 512 }[]; scale: number } | null = null;

async function detect(img: Raw, job: number) {
  const det = await session('detector', job);
  return (await detectFaces(ort, det, img)).filter((f) => Math.min(f.box[2], f.box[3]) >= MIN_FACE_PX);
}

function compose(strengths: number[]): Raw {
  if (!last) throw new Error('Nothing to compose');
  const out = cloneRaw(last.base);
  pasteFaces(out, last.faces.map((f, i) => ({ ...f, strength: strengths[i] ?? 1 })), last.scale);
  return out;
}

async function enhance(job: number, bitmap: ImageBitmap, o: EnhanceOptions, keep: boolean) {
  let img = bitmapToRaw(bitmap);

  // One overall progress value: every step adds its share of `total` as it finishes.
  const tiles = (w: number, h: number) => Math.ceil(w / 224) * Math.ceil(h / 224);
  let done = 0;
  let total = COST.finish + (o.faces ? COST.detect + COST.load + 2 * COST.face : 0) + (o.colorize ? COST.load + COST.colorize : 0) + (o.scale > 1 ? COST.load + tiles(img.width, img.height) * COST.tile : 0);
  let shown = 0;
  const report = (stage: string, extra = 0) => {
    shown = Math.max(shown, Math.min(0.99, (done + extra) / total));
    progress(job, stage, shown);
  };

  if (o.colorize) {
    report('Colorizing');
    const s = await session('colorizer', job, !!o.safe);
    done += COST.load;
    checkpoint();
    img = await colorize(ort, s, img);
    done += COST.colorize;
  }

  let faces: Face[] = [];
  const restored: { restored: Raw; large: Raw; matrix: Affine; aligned: Raw }[] = [];
  if (o.faces) {
    report('Finding faces');
    faces = await detect(img, job);
    done += COST.detect;
    if (faces.length > MAX_FACES) {
      const area = (f: Face) => f.box[2] * f.box[3];
      faces = [...faces].sort((a, b) => area(b) - area(a)).slice(0, MAX_FACES).sort((a, b) => a.box[0] - b.box[0]);
    }
    total += faces.length ? (faces.length - 2) * COST.face : -(COST.load + 2 * COST.face);
    if (faces.length) {
      const s = await session('restorer', job, !!o.safe);
      done += COST.load;
      // Faces drawn much larger than the restorer's 256² crop get a 4× detail pass (the bundled upscaler, one tile each).
      const big = RESTORER_SIZE === 256 && faces.some((f) => o.scale / Math.hypot(alignMatrix(f, 256)[0], alignMatrix(f, 256)[3]) > 1.3);
      const sr = big ? await session('sr', job, !!o.safe) : null;
      for (const [i, f] of faces.entries()) {
        checkpoint();
        report(faces.length > 1 ? `Restoring face ${i + 1} of ${faces.length}` : 'Restoring the face');
        const m = alignMatrix(f, RESTORER_SIZE);
        restored.push({ ...(await restoreFace(ort, s, img, m, RESTORER_SIZE, sr ? (crop) => upscaleCrop(ort, sr, crop) : undefined, o.scale)), matrix: m });
        done += COST.face;
      }
    }
  }

  let base = img;
  if (o.scale > 1) {
    report(`Upscaling ${o.scale}×`);
    const s = await session('sr', job, !!o.safe);
    done += COST.load;
    const k = Math.min(1, Math.sqrt(MAX_SR_PIXELS / (img.width * img.height * o.scale * o.scale)));
    const src = k < 1 ? await resizeRaw(img, Math.round(img.width * k), Math.round(img.height * k)) : img;
    total += (tiles(src.width, src.height) - tiles(img.width, img.height)) * COST.tile;
    let tilesDone = 0;
    base = await superResolve(ort, s, src, o.scale as 2 | 4, { checkpoint, onProgress: () => report(`Upscaling ${o.scale}×`, ++tilesDone * COST.tile) });
    done += tilesDone * COST.tile;
  } else base = cloneRaw(img);

  checkpoint();
  report('Finishing…');
  const state = { base, faces: restored.map(({ large, matrix }) => ({ restored: large, matrix, size: RESTORER_SIZE })), scale: base.width / img.width };
  if (keep) last = state;
  const out = cloneRaw(base);
  pasteFaces(out, state.faces.map((f) => ({ ...f, strength: 1 })), state.scale);
  const result = await rawToBitmap(out);

  const infos: FaceInfo[] = [];
  const transfer: Transferable[] = [result];
  if (keep)
    for (const [i, r] of restored.entries()) {
      const before = await rawToBitmap(await resizeRaw(r.aligned, 128, 128));
      const after = await rawToBitmap(await resizeRaw(r.restored, 128, 128));
      infos.push({ box: faces[i].box, score: faces[i].score, before, after });
      transfer.push(before, after);
    }
  post({ type: 'enhanced', id: job, bitmap: result, faces: infos, width: base.width, height: base.height }, transfer);
}

// ── Messages ─────────────────────────────────────────────────────────────────────────────────
scope.onmessage = async (e: MessageEvent<Req>) => {
  const m = e.data;
  if (m.type === 'cancel') return void (cancelled = true);
  currentJob = m.id;
  try {
    switch (m.type) {
      case 'init': {
        const [be, cached] = await Promise.all([backend(), cachedModels()]);
        post({ type: 'ready', id: m.id, backend: be, cached });
        break;
      }
      case 'scan': {
        const img = bitmapToRaw(m.bitmap);
        m.bitmap.close();
        post({ type: 'scanned', id: m.id, faces: (await detect(img, m.id)).length, grayscale: isGrayscale(img) });
        break;
      }
      case 'enhance':
        cancelled = false;
        try {
          await enhance(m.id, m.bitmap, m.options, m.keep !== false);
        } finally {
          m.bitmap.close();
        }
        break;
      case 'composite': {
        const bitmap = await rawToBitmap(compose(m.strengths));
        post({ type: 'composited', id: m.id, bitmap }, [bitmap]);
        break;
      }
      case 'matte': {
        const img = bitmapToRaw(m.bitmap);
        m.bitmap.close();
        const s = await session('matte', m.id);
        const r = await matte(ort, s, img);
        post({ type: 'matted', id: m.id, ...r }, [r.alpha.buffer]);
        break;
      }
      case 'clear-models':
        for (const [, p] of sessions) p.then((s) => s.release()).catch(() => {});
        sessions.clear();
        await clearModels();
        post({ type: 'cleared', id: m.id });
        break;
    }
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    const message = aborted ? 'Cancelled' : (err as Error)?.message ?? String(err);
    const gpuLost = /device (is )?lost|DEVICE_HUNG|DEVICE_REMOVED/i.test(message);
    post({ type: 'error', id: m.id, message, aborted, gpuLost });
  }
};
