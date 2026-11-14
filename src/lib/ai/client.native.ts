/**
 * The native AI engine: the same jobs and the same promise-based API as the browser's worker
 * client (client.ts), running ONNX Runtime on the phone. Inference runs on ONNX Runtime's own
 * native threads; the JS-side pixel work yields between tiles and faces so progress keeps painting.
 *
 * Execution: XNNPACK (optimised ARM kernels) first, plain CPU as the safe-mode fallback.
 */
import * as ortRN from 'onnxruntime-react-native';
import type * as ORT from 'onnxruntime-web';
import { asPic } from '@/lib/native/pic';
import { type Face, alignMatrix, detectFaces, pasteFaces, restoreFace } from './faces';
import { type Affine, type Raw, bitmapToRaw, cloneRaw, rawToBitmap, resizeRaw } from './image';
import { DownloadError, cachedModels, modelPath } from './models.native';
import type { EnhanceOptions, FaceInfo, Res } from './protocol';
import { MODELS, type ModelKey, RESTORER_SIZE } from './registry';
import { debug } from '@/lib/debug';
import { matte, superResolve, upscaleCrop } from './tasks';

// The shared pipeline is typed against onnxruntime-web; both packages implement onnxruntime-common.
const ort = ortRN as unknown as typeof ORT;
type Session = ORT.InferenceSession;
type Progress = (stage: string, value: number, bytes?: [number, number]) => void;
type Result<T extends Res['type']> = Extract<Res, { type: T }>;

/** The accelerated path failed; `withRecovery` retries in safe (CPU) mode. */
export class GPULostError extends Error {
  name = 'GPULostError';
}

/** Super-resolution output budget (same as the browser). */
const MAX_SR_PIXELS = 16_000_000;
/** Faces smaller than this carry too little information to restore credibly. */
const MIN_FACE_PX = 32;
/** Restoring a face costs seconds on a phone: the biggest ones in a crowd are the ones people look at. */
const MAX_FACES = 8;
/** Rough relative cost of each step (a restored face = 1), used for one overall progress bar and a time estimate. */
const COST = { detect: 0.15, load: 0.3, face: 0.5, tile: 0.35, finish: 0.3 };
/** Keep at most this many of the large engines loaded at once (memory). */
const MAX_BIG = 1;
const SMALL: ModelKey[] = ['detector', 'sr', 'matte'];

const THREADS = 4;
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const abort = () => Object.assign(new Error('Cancelled'), { name: 'AbortError' });

class AIClient {
  private sessions = new Map<string, Promise<Session>>();
  private chain: Promise<unknown> = Promise.resolve();
  private cancelled = false;
  private last: { base: Raw; faces: { restored: Raw; matrix: Affine; size: 256 | 512 }[]; scale: number } | null = null;

  /** Jobs run one at a time, in order, like the browser worker. */
  private queue<T>(job: () => Promise<T>): Promise<T> {
    const p = this.chain.then(job, job);
    this.chain = p.catch(() => {});
    return p;
  }

  private checkpoint = () => {
    if (this.cancelled) throw abort();
  };

  private evict() {
    const big = [...this.sessions.keys()].filter((k) => !SMALL.includes(k.split(':')[0] as ModelKey));
    while (big.length > MAX_BIG) {
      const victim = big.shift()!;
      const p = this.sessions.get(victim)!;
      this.sessions.delete(victim);
      p.then((s) => s.release()).catch(() => {});
    }
  }

  private session(key: ModelKey, onProgress?: Progress, cpu = false): Promise<Session> {
    const id = cpu ? `${key}:cpu` : key;
    const hit = this.sessions.get(id);
    if (hit) {
      this.sessions.delete(id);
      this.sessions.set(id, hit); // most recently used
      return hit;
    }
    const def = MODELS[key];
    const p = (async () => {
      const path = await modelPath(key, (loaded, total) => onProgress?.(`Downloading ${def.label}`, total ? loaded / total : 0, [loaded, total]));
      onProgress?.(`Starting ${def.label.toLowerCase()}…`, 1);
      // Four threads: the big cores of a typical phone. More only adds waiting on the slow little cores.
      // The 512² face restorer is large: no memory arena (it only grows) and no pattern reuse, so peak memory stays lower on 3–4 GB phones.
      const lean = key === 'restorer';
      const base = { graphOptimizationLevel: 'all' as const, logSeverityLevel: 3 as const, intraOpNumThreads: THREADS, enableCpuMemArena: !lean, enableMemPattern: !lean };
      if (cpu) return ort.InferenceSession.create(path, { ...base, executionProviders: ['cpu'] });
      // XNNPACK (optimised ARM kernels) with the plain CPU behind it. Android's NNAPI is not used: its drivers differ
      // from phone to phone (slow on some, wrong pixels or a crash on others) and Android 15 deprecates it.
      try {
        return await ort.InferenceSession.create(path, { ...base, executionProviders: ['xnnpack', 'cpu'] });
      } catch {
        return ort.InferenceSession.create(path, { ...base, executionProviders: ['cpu'] });
      }
    })();
    p.catch(() => this.sessions.delete(id));
    this.sessions.set(id, p);
    this.evict();
    return p;
  }

  /** Accelerated-path failures become GPULostError so the editor retries once on the CPU. */
  private guard<T>(safe: boolean, job: () => Promise<T>): Promise<T> {
    return job().catch((e: Error) => {
      if (safe || e.name === 'AbortError' || e instanceof DownloadError) throw e;
      console.warn('[ai] accelerated run failed, retrying on CPU:', e);
      throw new GPULostError(e.message);
    });
  }

  private async detect(img: Raw, onProgress?: Progress, cpu = false) {
    const det = await this.session('detector', onProgress, cpu);
    return (await detectFaces(ort, det, img)).filter((f) => Math.min(f.box[2], f.box[3]) >= MIN_FACE_PX);
  }

  /** Release every engine (used after a failure, before the safe-mode retry). */
  restart() {
    for (const [, p] of this.sessions) p.then((s) => s.release()).catch(() => {});
    this.sessions.clear();
    this.chain = Promise.resolve();
  }

  init(): Promise<Result<'ready'>> {
    return this.queue(async () => ({ type: 'ready' as const, id: 0, backend: 'native' as const, cached: await cachedModels() }));
  }

  scan(bitmap: ImageBitmap): Promise<Result<'scanned'>> {
    return this.queue(async () => {
      const img = bitmapToRaw(bitmap);
      asPic(bitmap).close();
      const faces = (await this.detect(img)).length;
      return { type: 'scanned' as const, id: 0, faces };
    });
  }

  enhance(bitmap: ImageBitmap, o: EnhanceOptions, onProgress?: Progress, keep = true): Promise<Result<'enhanced'>> {
    return this.queue(() =>
      this.guard(!!o.safe, async () => {
        this.cancelled = false;
        try {
          return await this.runEnhance(bitmap, o, onProgress, keep);
        } finally {
          asPic(bitmap).close();
        }
      }),
    );
  }

  private async runEnhance(bitmap: ImageBitmap, o: EnhanceOptions, onProgress: Progress | undefined, keep: boolean): Promise<Result<'enhanced'>> {
    const safe = !!o.safe;
    let img = bitmapToRaw(bitmap);
    const t0 = Date.now();
    const lap = (what: string) => debug(`ai ${what} ${Date.now() - t0}ms`);

    // One overall progress value: every step adds its share of `total` as it finishes.
    const tiles = (w: number, h: number) => Math.ceil(w / 224) * Math.ceil(h / 224);
    let done = 0;
    let total = COST.finish + (o.faces ? COST.detect + COST.load + 2 * COST.face : 0) + (o.scale > 1 ? COST.load + tiles(img.width, img.height) * COST.tile : 0);
    let shown = 0;
    const report = (stage: string, extra = 0) => {
      shown = Math.max(shown, Math.min(0.99, (done + extra) / total));
      onProgress?.(stage, shown);
    };

    let faces: Face[] = [];
    const restored: { restored: Raw; large: Raw; matrix: Affine; aligned: Raw }[] = [];
    if (o.faces) {
      report('Finding faces');
      faces = await this.detect(img, onProgress, safe);
      done += COST.detect;
      if (faces.length > MAX_FACES) {
        const area = (f: Face) => f.box[2] * f.box[3];
        faces = [...faces].sort((a, b) => area(b) - area(a)).slice(0, MAX_FACES).sort((a, b) => a.box[0] - b.box[0]);
      }
      total += faces.length ? (faces.length - 2) * COST.face : -(COST.load + 2 * COST.face);
      lap(`found ${faces.length} faces`);
      if (faces.length) {
        const s = await this.session('restorer', onProgress, safe);
        done += COST.load;
        // Faces drawn much larger than the restorer's 256² crop get a 4× detail pass (the bundled upscaler, one tile each).
        const big = RESTORER_SIZE === 256 && faces.some((f) => o.scale / Math.hypot(alignMatrix(f, 256)[0], alignMatrix(f, 256)[3]) > 1.3);
        const sr = big ? await this.session('sr', onProgress, safe) : null;
        for (const [i, f] of faces.entries()) {
          this.checkpoint();
          report(faces.length > 1 ? `Restoring face ${i + 1} of ${faces.length}` : 'Restoring the face');
          await pause();
          const m = alignMatrix(f, RESTORER_SIZE);
          restored.push({ ...(await restoreFace(ort, s, img, m, RESTORER_SIZE, sr ? (crop) => upscaleCrop(ort, sr, crop) : undefined, o.scale)), matrix: m });
          done += COST.face;
          lap(`face ${i + 1} restored`);
        }
      }
    }

    let base: Raw;
    if (o.scale > 1) {
      report(`Upscaling ${o.scale}×`);
      const s = await this.session('sr', onProgress, safe);
      done += COST.load;
      const k = Math.min(1, Math.sqrt(MAX_SR_PIXELS / (img.width * img.height * o.scale * o.scale)));
      const src = k < 1 ? await resizeRaw(img, Math.round(img.width * k), Math.round(img.height * k)) : img;
      total += (tiles(src.width, src.height) - tiles(img.width, img.height)) * COST.tile;
      let tilesDone = 0;
      base = await superResolve(ort, s, src, o.scale as 2 | 4, {
        checkpoint: this.checkpoint,
        onProgress: () => report(`Upscaling ${o.scale}×`, ++tilesDone * COST.tile),
        pause,
      });
      done += tilesDone * COST.tile;
      lap(`upscaled to ${base.width}×${base.height}`);
    } else base = cloneRaw(img);

    this.checkpoint();
    report('Finishing…');
    await pause();
    const state = { base, faces: restored.map(({ large, matrix }) => ({ restored: large, matrix, size: RESTORER_SIZE })), scale: base.width / img.width };
    if (keep) this.last = state;
    const out = cloneRaw(base);
    pasteFaces(out, state.faces.map((f) => ({ ...f, strength: 1 })), state.scale);
    const result = await rawToBitmap(out);
    lap('done');

    const infos: FaceInfo[] = [];
    if (keep)
      for (const [i, r] of restored.entries()) {
        const before = await rawToBitmap(await resizeRaw(r.aligned, 128, 128));
        const after = await rawToBitmap(await resizeRaw(r.restored, 128, 128));
        infos.push({ box: faces[i].box, score: faces[i].score, before, after });
      }
    return { type: 'enhanced' as const, id: 0, bitmap: result, faces: infos, width: base.width, height: base.height };
  }

  /** Re-blend the kept restored faces with new strengths (cheap: no inference). */
  composite(strengths: number[]): Promise<Result<'composited'>> {
    return this.queue(async () => {
      if (!this.last) throw new Error('Nothing to compose');
      const out = cloneRaw(this.last.base);
      pasteFaces(out, this.last.faces.map((f, i) => ({ ...f, strength: strengths[i] ?? 1 })), this.last.scale);
      return { type: 'composited' as const, id: 0, bitmap: await rawToBitmap(out) };
    });
  }

  matte(bitmap: ImageBitmap, onProgress?: Progress): Promise<Result<'matted'>> {
    return this.queue(async () => {
      const img = bitmapToRaw(bitmap);
      asPic(bitmap).close();
      const s = await this.session('matte', onProgress);
      return { type: 'matted' as const, id: 0, ...(await matte(ort, s, img)) };
    });
  }

  /**
   * Load a model that is already saved on this phone into the engine in the background, so the next Enhance does not wait
   * for it. Never queues other work behind it and never downloads anything (the caller checks that it is saved).
   */
  warm(key: ModelKey) {
    this.session(key).catch(() => {});
  }

  /** Cooperative: the job stops at the next tile / face boundary. */
  cancel() {
    this.cancelled = true;
  }
}

let client: AIClient | null = null;

export const getAI = (): AIClient => (client ??= new AIClient());
