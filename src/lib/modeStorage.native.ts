import { File, Paths } from 'expo-file-system';
import type { Mode } from '@/theme';

/** Remembers the light / dark choice in a one-word file in the app's own storage. */
const file = () => new File(Paths.document, 'theme.txt');

export function loadMode(): Mode | null {
  try {
    const f = file();
    if (!f.exists) return null;
    const v = f.textSync().trim();
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function saveMode(mode: Mode) {
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(mode);
  } catch {
    /* not saving only means the next launch starts in dark again */
  }
}
