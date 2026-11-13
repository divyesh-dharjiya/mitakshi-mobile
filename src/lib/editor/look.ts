import type { Look } from '@/lib/gl/look';
import { FILTERS, TONE_ZERO, type ToneValues, autoValues } from './tone';
import { setCompare } from './view';
import { useEditor } from './store';

/** Live, non-destructive look changes. Each call triggers a redraw through the store subscription. */

export function setLook(patch: Partial<Look>) {
  if (useEditor.getState().compare) setCompare(false);
  useEditor.setState((s) => ({ look: { ...s.look, ...patch } }));
}

/**
 * Apply a one-tap filter. Every tone slider is first reset, then the filter's values are applied. Choosing the
 * filter that is already active (Auto included) switches it off again: every adjustment goes back to zero.
 */
export function applyFilter(id: string) {
  const s = useEditor.getState();
  const f = FILTERS.find((x) => x.id === id);
  if (!f || !s.preview) return;
  if (id !== 'none' && s.activeFilter === id) {
    resetAdjustments();
    return;
  }
  if (s.compare) setCompare(false);
  const values: ToneValues = f.values === 'auto' ? autoValues(s.preview) : f.values;
  useEditor.setState({ look: { ...s.look, ...TONE_ZERO, ...values }, activeFilter: id });
}

/** Reset every tone slider (the background settings are kept). */
export function resetAdjustments() {
  useEditor.setState((s) => ({ look: { ...s.look, ...TONE_ZERO }, activeFilter: 'none' }));
}

/** One tap: set light and colour to what suits this photo (see `autoValues`); a second tap resets everything. */
export function autoEnhance() {
  applyFilter('auto');
}
