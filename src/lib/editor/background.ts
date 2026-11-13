import { getAI } from '@/lib/ai/client';
import type { Look } from '@/lib/gl/look';
import { copy } from '@/lib/imageio';
import { endBusy, isBusy, jobProgress, startBusy } from './busy';
import { markCached } from './engine';
import { rt } from './runtime';
import { useEditor } from './store';

/** AI background tools: subject matting, background modes and the colour swatches. */

export const SWATCHES: [number, number, number][] = [
  [1, 1, 1],
  [0.08, 0.08, 0.1],
  [0.85, 0.86, 0.88],
  [0.36, 0.55, 0.95],
  [0.98, 0.78, 0.82],
  [0.62, 0.87, 0.72],
  [0.99, 0.86, 0.55],
  [0.55, 0.36, 0.96],
];

let pending: Promise<void> | null = null;

/**
 * Find the subject in the preview (once per picture). Concurrent calls share one job. The first
 * use downloads the background engine, so that run shows the progress overlay.
 */
export function ensureMatte(): Promise<void> {
  const s = useEditor.getState();
  if (s.mask || !s.preview) return Promise.resolve();
  if (pending) return pending;
  const preview = s.preview;
  const overlay = !s.cached.includes('matte') && !isBusy();
  useEditor.setState({ bgNotice: { tone: 'info', text: 'Finding the subject…' } });
  if (overlay) startBusy('Finding the subject', 'Starting…');

  pending = (async () => {
    try {
      const r = await getAI().matte(await copy(preview), overlay ? jobProgress : undefined);
      markCached(['matte']);
      if (preview !== useEditor.getState().preview) return; // the photo changed while we worked
      rt.comp?.setMask(r);
      let fg = 0;
      for (const a of r.alpha) if (a > 128) fg++;
      const share = fg / r.alpha.length;
      useEditor.setState({
        mask: r,
        bgNotice:
          share > 0.03
            ? { tone: 'ok', text: 'Subject found. Pick a background style.' }
            : { tone: 'warn', text: 'No clear subject found. Works best with people and pets.' },
      });
    } catch (e) {
      console.error(e);
      useEditor.setState({ bgNotice: { tone: 'warn', text: 'Could not load the background engine. Check your connection and try again.' } });
    } finally {
      if (overlay) endBusy();
      pending = null;
    }
  })();
  return pending;
}

/** Choose a background mode. Anything except "Original" needs the subject matte. */
export async function setBackground(bg: Look['bg']) {
  useEditor.setState((s) => ({ look: { ...s.look, bg } }));
  if (bg !== 'none') await ensureMatte();
}
