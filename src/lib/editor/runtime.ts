import { Compositor } from '@/lib/gl/compositor';
import type { Viewer } from '@/lib/viewer';
import { useEditor } from './store';

/**
 * Imperative handles that must not live in React state: the WebGL compositor, the pan/zoom
 * viewer and the eraser's paint canvas. React components attach them on mount.
 */
export const rt: {
  comp: Compositor | null;
  compCanvas: HTMLCanvasElement | null;
  viewer: Viewer | null;
  frame: boolean;
} = { comp: null, compCanvas: null, viewer: null, frame: false };

/** One compositor per canvas element. Reusing it keeps the WebGL context valid across React re-mounts. */
export function ensureCompositor(canvas: HTMLCanvasElement): Compositor {
  if (rt.comp && rt.compCanvas === canvas) return rt.comp;
  rt.comp = new Compositor(canvas);
  rt.compCanvas = canvas;
  return rt.comp;
}

/** Coalesce redraws into a single animation frame. */
export function scheduleRender() {
  if (rt.frame) return;
  rt.frame = true;
  requestAnimationFrame(() => {
    rt.frame = false;
    const s = useEditor.getState();
    if (!rt.comp || !s.preview) return;
    rt.comp.setLook(s.look);
    rt.comp.render();
  });
}

// Any change that affects the picture triggers a redraw; progress and other UI-only updates don't.
useEditor.subscribe((s, prev) => {
  if (s.look !== prev.look || s.mask !== prev.mask || s.preview !== prev.preview) scheduleRender();
});
