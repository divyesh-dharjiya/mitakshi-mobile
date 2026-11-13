import type { Mode } from '@/theme';

/** Remembers the light / dark choice (browser build: localStorage). */
const KEY = 'mitakshi-theme';

export function loadMode(): Mode | null {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function saveMode(mode: Mode) {
  try {
    globalThis.localStorage?.setItem(KEY, mode);
  } catch {
    /* private window: the choice just lasts until the page is closed */
  }
}
