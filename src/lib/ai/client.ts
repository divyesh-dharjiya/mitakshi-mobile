import type { EnhanceOptions, Req, Res } from './protocol';

const ASSET_BASE = (process.env.EXPO_PUBLIC_ASSET_BASE ?? '').replace(/\/$/, '');

type Progress = (stage: string, value: number, bytes?: [number, number]) => void;
type Pending = { resolve: (r: Res) => void; reject: (e: Error) => void; onProgress?: Progress; lastSeen: number };

/** The GPU was reset or stopped responding; recover with `ai.restart()`. */
export class GPULostError extends Error {
  name = 'GPULostError';
}

/** A job that sends nothing for this long is treated as a hung GPU (backup to `device.lost`). */
const STALL_MS = 120_000;

/** Promise-based RPC to the AI worker. Requests are serialised so jobs never interleave. */
class AIClient {
  private worker!: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private chain: Promise<unknown> = Promise.resolve();

  constructor() {
    this.spawn();
    setInterval(() => this.checkStalls(), 5_000);
  }

  private spawn() {
    // Bundled separately by tools/build-worker.mjs into public/ai-worker.js (Metro cannot bundle workers).
    this.worker = new Worker(`${ASSET_BASE}/ai-worker.js`, { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<Res>) => {
      const m = e.data;
      if (m.type === 'log') return console.log(`[ai] ${m.message}`);
      const p = this.pending.get(m.id);
      if (!p) return;
      p.lastSeen = performance.now();
      if (m.type === 'progress') return p.onProgress?.(m.stage, m.value, m.bytes);
      this.pending.delete(m.id);
      if (m.type === 'error') {
        const err = m.gpuLost ? new GPULostError(m.message) : new Error(m.message);
        if (m.aborted) err.name = 'AbortError';
        p.reject(err);
      } else p.resolve(m);
    };
    this.worker.onerror = (e) => this.failAll(new Error(e.message || 'AI engine crashed'));
  }

  private failAll(err: Error) {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  private checkStalls() {
    const now = performance.now();
    for (const p of this.pending.values()) if (now - p.lastSeen > STALL_MS) return this.failAll(new GPULostError('The GPU stopped responding'));
  }

  /** Tear down the worker (and its GPU device) and start fresh. Models reload from disk. */
  restart() {
    this.worker.terminate();
    this.failAll(new Error('AI engine restarted'));
    this.chain = Promise.resolve();
    this.spawn();
  }

  private call<T extends Res['type']>(req: Omit<Req, 'id'> & { type: Req['type'] }, transfer: Transferable[] = [], onProgress?: Progress) {
    const run = () =>
      new Promise<Extract<Res, { type: T }>>((resolve, reject) => {
        const id = this.nextId++;
        this.pending.set(id, { resolve: resolve as (r: Res) => void, reject, onProgress, lastSeen: performance.now() });
        this.worker.postMessage({ ...req, id }, transfer);
      });
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }

  init() {
    return this.call<'ready'>({ type: 'init' });
  }
  scan(bitmap: ImageBitmap) {
    return this.call<'scanned'>({ type: 'scan', bitmap } as Req, [bitmap]);
  }
  enhance(bitmap: ImageBitmap, options: EnhanceOptions, onProgress?: Progress, keep = true) {
    return this.call<'enhanced'>({ type: 'enhance', bitmap, options, keep } as Req, [bitmap], onProgress);
  }
  composite(strengths: number[]) {
    return this.call<'composited'>({ type: 'composite', strengths } as Req);
  }
  matte(bitmap: ImageBitmap, onProgress?: Progress) {
    return this.call<'matted'>({ type: 'matte', bitmap } as Req, [bitmap], onProgress);
  }
  clearModels() {
    return this.call<'cleared'>({ type: 'clear-models' });
  }
  /** Cooperative: the worker stops at the next tile / face boundary. */
  cancel() {
    this.worker.postMessage({ type: 'cancel', id: 0 });
  }
}

let client: AIClient | null = null;

/** Created on first use, so server rendering never spawns a worker. */
export const getAI = (): AIClient => (client ??= new AIClient());
