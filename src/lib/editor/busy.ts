import { fmtMB } from '@/lib/format';
import { useEditor } from './store';

/** Busy overlay state: one long-running task at a time. */

export const isBusy = () => useEditor.getState().busy !== null;

export function startBusy(title: string, sub = '', cancel?: () => void) {
  useEditor.setState({ busy: { title, sub, progress: 0, startedAt: Date.now(), cancel } });
}

export function updateBusy(patch: { title?: string; sub?: string; progress?: number }) {
  const b = useEditor.getState().busy;
  if (b) useEditor.setState({ busy: { ...b, ...patch } });
}

export function endBusy() {
  useEditor.setState({ busy: null });
}

/** Progress callback for AI jobs (stage, 0..1, optional download bytes). */
export function jobProgress(stage: string, value: number, bytes?: [number, number]) {
  updateBusy({ title: stage, progress: value, sub: bytes ? `${fmtMB(bytes[0])} / ${fmtMB(bytes[1])} · one-time download, saved on this device` : timeLeft(value) });
}

/** "About 20 s left", from how long the task has run and how far it is. Empty until the estimate is steady. */
function timeLeft(value: number) {
  const b = useEditor.getState().busy;
  if (!b || value < 0.08 || value >= 0.99) return '';
  const elapsed = (Date.now() - b.startedAt) / 1000;
  if (elapsed < 4) return '';
  const left = Math.round((elapsed * (1 - value)) / value);
  if (left < 3) return 'Almost done';
  return left < 90 ? `About ${Math.round(left / 5) * 5 || 5} s left` : `About ${Math.round(left / 60)} min left`;
}
