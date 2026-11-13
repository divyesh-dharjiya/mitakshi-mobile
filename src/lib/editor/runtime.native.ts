import { Compositor } from '@/lib/gl/compositor.native';
import { NativeViewer } from '@/lib/native/viewer';
import { useEditor } from './store';

/**
 * Imperative handles that must not live in React state (native): the Skia compositor and the
 * pan/zoom viewer. Unlike the web, neither needs a mounted view, so both exist from the start.
 */
export const rt: {
  comp: Compositor | null;
  viewer: NativeViewer | null;
  frame: boolean;
} = {
  comp: new Compositor(),
  viewer: new NativeViewer((zoom) => {
    if (useEditor.getState().zoom !== zoom) useEditor.setState({ zoom });
  }),
  frame: false,
};

/** Web-only (a canvas element owns the WebGL context there). */
export function ensureCompositor(): Compositor {
  return rt.comp!;
}

/** Coalesce redraws into a single frame. */
export function scheduleRender() {
  if (rt.frame) return;
  rt.frame = true;
  requestAnimationFrame(() => {
    rt.frame = false;
    const s = useEditor.getState();
    if (!rt.comp || !s.preview) return;
    rt.comp.render();
  });
}

// Any change that affects the picture triggers a redraw; progress and other UI-only updates don't.
useEditor.subscribe((s, prev) => {
  // The look is live on the UI thread: no waiting for the next frame, nothing to rebuild.
  if (s.look !== prev.look) rt.comp?.setLook(s.look);
  if (s.mask !== prev.mask || s.preview !== prev.preview) scheduleRender();
});
