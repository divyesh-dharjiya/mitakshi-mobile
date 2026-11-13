import { type GeoOp, centreCrop } from '@/lib/geo';
import { transform } from '@/lib/imageio';
import { toast } from '@/lib/toast';
import { setWork } from './photo';
import { useEditor } from './store';
import { setCompare } from './view';

/** Rotate, flip and crop. Each step is one Undo step. */

let working = false;

async function apply(make: (w: number, h: number) => GeoOp) {
  const { work, busy } = useEditor.getState();
  if (!work || busy || working) return;
  working = true;
  try {
    const next = await transform(work, make(work.width, work.height));
    useEditor.setState({ faces: null });
    setCompare(false);
    await setWork(next, true, true);
  } catch (e) {
    console.error(e);
    toast(`Could not change the photo: ${(e as Error).message}`, 'error');
  } finally {
    working = false;
  }
}

export const rotate = (dir: 1 | -1) => apply(() => ({ turns: dir === 1 ? 1 : 3, flipX: false, flipY: false }));
export const flip = (axis: 'x' | 'y') => apply(() => ({ turns: 0, flipX: axis === 'x', flipY: axis === 'y' }));

/** Crop to `aspect` (width ÷ height) from the centre. */
export const cropTo = (aspect: number) => apply((w, h) => ({ turns: 0, flipX: false, flipY: false, crop: centreCrop(w, h, aspect) }));
