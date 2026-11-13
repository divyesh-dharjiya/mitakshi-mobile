import { GPULostError, getAI } from '@/lib/ai/client';
import { MODELS, type ModelKey, modelBytes } from '@/lib/ai/registry';
import { ask } from '@/lib/dialog';
import { fmtMB } from '@/lib/format';
import { toast } from '@/lib/toast';
import { useEditor } from './store';

/** Engines that still need downloading before these models can run. */
export function missingEngines(keys: ModelKey[]): ModelKey[] {
  const cached = useEditor.getState().cached;
  return keys.filter((k) => MODELS[k].large && !cached.includes(k));
}

/** Downloads above this size ask first (they can take a while on mobile data). */
const ASK_ABOVE = 50e6;

/** Ask before a large one-time engine download. Resolves true when it may go ahead. */
export async function confirmDownloads(keys: ModelKey[]): Promise<boolean> {
  const need = missingEngines(keys);
  const bytes = need.reduce((sum, k) => sum + modelBytes(k), 0);
  if (bytes < ASK_ABOVE) return true;
  const names = need.map((k) => MODELS[k].label.toLowerCase()).join(' and ');
  return ask(
    'One-time download',
    `This needs the ${names} (${fmtMB(bytes)}). It downloads once and is saved on your phone, so next time it starts instantly. Wi-Fi is recommended.`,
    'Download',
  );
}

/** Add model keys to the "already on this device" list. */
export function markCached(keys: ModelKey[]) {
  useEditor.setState((s) => ({ cached: [...new Set([...s.cached, ...keys])] }));
}

/** Start the AI worker and read which engines are already stored. Safe to call more than once. */
export async function initEngine() {
  try {
    navigator.storage?.persist?.().catch(() => {});
    const r = await getAI().init();
    useEditor.setState((s) => ({ backend: r.backend, cached: [...new Set([...s.cached, ...r.cached])] }));
  } catch (e) {
    console.error(e);
  }
}

/**
 * Run an AI job. If the OS resets the graphics chip mid-job, restart the engine with a fresh
 * device and retry once with the heavy steps on the CPU.
 */
export async function withRecovery<T>(job: (safe: boolean) => Promise<T>): Promise<T> {
  try {
    return await job(false);
  } catch (e) {
    if (!(e instanceof GPULostError)) throw e;
    toast('The AI accelerator stopped responding. Retrying in safe mode…', 'info', 6000);
    getAI().restart();
    await initEngine();
    return job(true);
  }
}

/** Delete the large engines stored on this device. */
export async function deleteEngines() {
  await getAI().clearModels();
  useEditor.setState({ cached: [] });
  await initEngine(); // engines built into the app stay available
  toast('AI engines deleted from this device.', 'ok');
}

export const cancelJob = () => getAI().cancel();
