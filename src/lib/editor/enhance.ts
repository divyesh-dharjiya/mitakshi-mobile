import type { EnhanceOptions } from '@/lib/ai/protocol';
import { getAI } from '@/lib/ai/client';
import { type ModelKey } from '@/lib/ai/registry';
import { fmtSize } from '@/lib/format';
import { copy } from '@/lib/imageio';
import { toast } from '@/lib/toast';
import { endBusy, jobProgress, startBusy } from './busy';
import { cancelJob, confirmDownloads, markCached, withRecovery } from './engine';
import { autoEnhance } from './look';
import { setWork } from './photo';
import { useEditor } from './store';
import { setCompare } from './view';

/** AI Enhance: face restoration and upscaling, then Auto edit (light and colour), plus per-face controls. */

export function modelsFor(o: EnhanceOptions): ModelKey[] {
  const keys: ModelKey[] = ['detector'];
  if (o.faces) keys.push('restorer');
  if (o.scale > 1) keys.push('sr');
  return keys;
}

/** Per-face strengths as the worker expects them (a disabled face counts as 0). */
export function currentStrengths(): number[] {
  const f = useEditor.getState().faces;
  if (!f) return [];
  return f.strengths.map((v, i) => (f.enabled[i] ? v : 0));
}

export async function runEnhance() {
  const s = useEditor.getState();
  if (!s.work || s.busy) return;
  const o = { ...s.opts };
  const noAI = !o.faces && o.scale === 1;
  if (noAI && !s.autoEdit) return toast('Turn on at least one step.');
  // Auto edit alone needs no AI engine: it only sets light and colour.
  if (noAI) {
    if (s.activeFilter !== 'auto') autoEnhance();
    return;
  }
  if (!(await confirmDownloads(modelsFor(o)))) return;

  startBusy('AI Enhance', 'Starting…', cancelJob);
  const t0 = performance.now();
  try {
    const src = s.work;
    const r = await withRecovery((safe) => copy(src).then((img) => getAI().enhance(img, { ...o, safe }, jobProgress)));
    markCached(modelsFor(o));

    const k = useEditor.getState().fidelity;
    useEditor.setState({
      faces: { faces: r.faces, strengths: r.faces.map(() => k), enabled: r.faces.map(() => true) },
    });
    let bmp = r.bitmap;
    if (k < 1 && r.faces.length) {
      bmp.close();
      bmp = (await getAI().composite(currentStrengths())).bitmap;
    }
    await setWork(bmp);
    // The new photo's own light and colour, measured on the enhanced result.
    if (s.autoEdit && useEditor.getState().activeFilter !== 'auto') autoEnhance();

    const parts = [
      s.autoEdit && 'auto edit',
      r.faces.length ? `${r.faces.length} face${r.faces.length > 1 ? 's' : ''} restored` : '',
      o.scale > 1 && fmtSize(r.width, r.height),
    ].filter(Boolean);
    toast(`Done in ${((performance.now() - t0) / 1000).toFixed(1)}s${parts.length ? ` · ${parts.join(' · ')}` : ''}`, 'ok');
    if (!useEditor.getState().compare && !useEditor.getState().geom) setCompare(true);
  } catch (e) {
    if ((e as Error).name === 'AbortError') toast('Cancelled.');
    else {
      console.error(e);
      toast(`AI Enhance failed: ${(e as Error).message}`, 'error', 8000);
    }
  } finally {
    endBusy();
  }
}

let compositing = false;
let again = false;

/**
 * Re-blend the restored faces into the image with the current strengths. The worker keeps the
 * last enhance result, so this only pastes faces back. Rapid slider moves are coalesced.
 */
export async function recomposite(): Promise<void> {
  if (!useEditor.getState().faces) return;
  if (compositing) {
    again = true;
    return;
  }
  compositing = true;
  try {
    const r = await getAI().composite(currentStrengths());
    if (useEditor.getState().faces) await setWork(r.bitmap, false);
    else r.bitmap.close();
  } catch (e) {
    console.error(e);
  } finally {
    compositing = false;
    if (again) {
      again = false;
      void recomposite();
    }
  }
}

/** Global "Face enhancement" slider: sets every face to the same strength. */
export function setFidelity(k: number) {
  const f = useEditor.getState().faces;
  useEditor.setState({ fidelity: k, faces: f ? { ...f, strengths: f.strengths.map(() => k) } : null });
  if (f) void recomposite();
}

export function setFaceStrength(index: number, value: number) {
  const f = useEditor.getState().faces;
  if (!f) return;
  useEditor.setState({ faces: { ...f, strengths: f.strengths.map((v, i) => (i === index ? value : v)) } });
  void recomposite();
}

export function setFaceEnabled(index: number, on: boolean) {
  const f = useEditor.getState().faces;
  if (!f) return;
  useEditor.setState({ faces: { ...f, enabled: f.enabled.map((v, i) => (i === index ? on : v)) } });
  void recomposite();
}
