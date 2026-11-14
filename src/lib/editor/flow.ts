import { autoEnhance } from './look';
import { pickOne } from './io';
import { loadPhoto, scanDone } from './photo';
import { type PhotoSource, useEditor } from './store';
import { setTab } from './view';

/** What the user chose on the home screen: one tap picks a photo and starts that job. */
export type StartIntent = 'enhance' | 'auto' | 'crop' | 'background';

/** Pick a photo, open it, and go straight to the chosen tool. */
export function startWith(intent: StartIntent) {
  pickOne((source, name) => void openWith(source, name, intent));
}

async function openWith(source: PhotoSource, name: string, intent: StartIntent) {
  await loadPhoto(source, name);
  if (!useEditor.getState().work) return;
  if (intent === 'crop' || intent === 'background') return setTab(intent);
  if (intent === 'auto') {
    setTab('edit');
    return autoEnhance();
  }

  setTab('enhance');
  await scanDone();
  // The photo opens with the right mode already chosen; the user taps Enhance when ready (nothing is
  // downloaded or processed until then).
}
