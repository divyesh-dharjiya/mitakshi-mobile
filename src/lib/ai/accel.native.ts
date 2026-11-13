/**
 * Picks the fastest safe way to run the two heavy networks (the upscaler and the face restorer) on this phone.
 *
 * Android's NNAPI can run a convolution network on the phone's GPU or NPU, several times faster than its
 * CPU cores, but drivers differ a lot between makers: some are slower, a few return wrong pixels or crash.
 * So the first time a network is needed the app runs it once both ways, compares the output and the
 * time, and remembers the answer on this device:
 *   - NNAPI only when it is clearly faster and its output matches the CPU's;
 *   - otherwise the CPU (XNNPACK), as before.
 * The verdict is written as "trying" before NNAPI is touched, so if a driver ever kills the app, the next
 * launch finds "trying" and never uses NNAPI for that network on this phone again.
 */
import * as ortRN from 'onnxruntime-react-native';
import { File, Paths } from 'expo-file-system';
import { debug } from '@/lib/debug';

export type Accelerated = 'sr' | 'restorer';
type Verdict = 'untested' | 'trying' | 'nnapi' | 'cpu';
type Provider = 'nnapi' | 'xnnpack' | 'cpu';
interface Perf {
  verdicts: Partial<Record<Accelerated, Verdict>>;
  /** Measured milliseconds per run on the CPU path (for time estimates). */
  cpuMs: Partial<Record<Accelerated, number>>;
}

const file = () => new File(Paths.document, 'perf.json');

function read(): Perf {
  try {
    const f = file();
    if (f.exists) {
      const p = JSON.parse(f.textSync()) as Partial<Perf>;
      return { verdicts: p.verdicts ?? {}, cpuMs: p.cpuMs ?? {} };
    }
  } catch {
    /* unreadable: start over */
  }
  return { verdicts: {}, cpuMs: {} };
}

let cached: Perf | null = null;
const state = () => (cached ??= read());

function save() {
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify(state()));
  } catch {
    /* not being able to save only means the test runs again next time */
  }
}

/** A smooth test image with some texture, so errors in any channel show. */
function pattern(size: number, channels: number, at: (v: number) => number): Float32Array | Uint8Array {
  const out = new Float32Array(size * size * channels);
  let seed = 12345;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const n = ((seed >>> 24) - 128) / 1024;
      for (let c = 0; c < channels; c++) {
        const v = c === 0 ? x / size : c === 1 ? y / size : 0.5 + 0.4 * Math.sin((x + y) / 17);
        out[(y * size + x) * channels + c] = Math.min(1, Math.max(0, v + n));
      }
    }
  return Float32Array.from(out, at) as Float32Array;
}

interface Case {
  feeds: (name: string) => Record<string, ortRN.Tensor>;
  fetches?: string[];
  /** Output values as 0..255 samples for the PSNR check. */
  samples: (data: ortRN.Tensor['data']) => ArrayLike<number>;
}

const CASES: Record<Accelerated, (tile: number) => Case> = {
  sr: (tile) => {
    const rgba = Uint8Array.from(pattern(tile, 4, (v) => v * 255));
    return {
      feeds: (name) => ({ [name]: new ortRN.Tensor('uint8', rgba, [1, tile, tile, 4]) }),
      fetches: ['x2'],
      samples: (d) => d as Uint8Array,
    };
  },
  restorer: (size) => {
    const px = pattern(size, 3, (v) => v * 2 - 1); // HWC in [-1, 1]
    const chw = new Float32Array(3 * size * size);
    for (let i = 0; i < size * size; i++) for (let c = 0; c < 3; c++) chw[c * size * size + i] = px[i * 3 + c];
    return {
      feeds: (name) => ({ [name]: new ortRN.Tensor('float32', chw, [1, 3, size, size]) }),
      samples: (d) => Float32Array.from(d as Float32Array, (v) => Math.min(255, Math.max(0, v * 127.5 + 127.5))),
    };
  },
};

const psnr = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let e = 0;
  for (let i = 0; i < a.length; i++) e += (a[i] - b[i]) ** 2;
  return 10 * Math.log10((255 * 255) / (e / a.length || 1e-9));
};

async function timed(s: ortRN.InferenceSession, c: Case) {
  const fetches = c.fetches ?? [s.outputNames[0]];
  await s.run(c.feeds(s.inputNames[0]), fetches); // warm-up (kernel setup)
  const t0 = Date.now();
  const out = await s.run(c.feeds(s.inputNames[0]), fetches);
  const t = out[fetches[0]];
  return { ms: Date.now() - t0, data: c.samples(t.data) };
}

/**
 * Which execution providers `key` should use. Runs the self-test on first use.
 * `size` is the network's input side (256 for the upscaler tile, 512 for faces).
 */
export async function providersFor(key: Accelerated, modelPath: string, size: number, threads: number): Promise<Provider[]> {
  const cpu: Provider[] = ['xnnpack', 'cpu'];
  let v = state().verdicts[key] ?? 'untested';
  if (v === 'trying') {
    // The previous attempt never finished: the driver took the app down. Do not touch NNAPI again.
    state().verdicts[key] = v = 'cpu';
    save();
  }
  if (v === 'nnapi') return ['nnapi', 'cpu'];
  if (v === 'cpu') return cpu;

  state().verdicts[key] = 'trying';
  save();
  let verdict: Verdict = 'cpu';
  try {
    const test = CASES[key](size);
    const base = { graphOptimizationLevel: 'all' as const, logSeverityLevel: 3 as const, intraOpNumThreads: threads };
    const a = await ortRN.InferenceSession.create(modelPath, { ...base, executionProviders: cpu });
    const ref = await timed(a, test);
    await a.release();
    state().cpuMs[key] = ref.ms;
    const b = await ortRN.InferenceSession.create(modelPath, { ...base, executionProviders: ['nnapi', 'cpu'] });
    const acc = await timed(b, test);
    await b.release();
    const quality = psnr(ref.data, acc.data);
    debug(`${key}: cpu ${ref.ms} ms, nnapi ${acc.ms} ms, match ${quality.toFixed(1)} dB`);
    if (quality >= 30 && acc.ms * 1.4 < ref.ms) verdict = 'nnapi';
  } catch (e) {
    debug(`${key}: nnapi unavailable:`, (e as Error).message);
  }
  state().verdicts[key] = verdict;
  save();
  return verdict === 'nnapi' ? ['nnapi', 'cpu'] : cpu;
}

/** Measured milliseconds for one run of `key` on this phone's CPU, when known. */
export const knownMs = (key: Accelerated) => state().cpuMs[key];
