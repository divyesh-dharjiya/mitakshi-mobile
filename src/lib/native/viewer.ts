import { PixelRatio } from 'react-native';
import { makeMutable, withTiming } from 'react-native-reanimated';
import { debug } from '@/lib/debug';
import { clamp } from '@/lib/format';

/**
 * Zoom, pan and the before/after split for the native preview. The same methods as the web
 * Viewer (viewer.ts), but the state lives in Reanimated shared values: gestures update them on
 * the UI thread and the Skia view reads them there, so moving around never involves React.
 *
 * The view is split into two kinds of values so they can never disagree:
 *  - placement (`baseS`, `baseX`, `baseY`): where the fitted photo sits in the stage. Only JS writes
 *    these, from plain fields, whenever the stage or the image size changes.
 *  - the user's framing (`zoom`, `panX`, `panY`): relative to that placement. Only gestures write
 *    these. A new image resolution (AI result) or a layout change therefore keeps the framing on
 *    screen without any value being read back from the UI thread.
 *
 * Screen position of an image point p:  centre + pan + zoom · (fitted(p) − centre).
 */
export class NativeViewer {
  readonly baseS = makeMutable(1);
  readonly baseX = makeMutable(0);
  readonly baseY = makeMutable(0);
  readonly zoom = makeMutable(1);
  readonly panX = makeMutable(0);
  readonly panY = makeMutable(0);
  /** Centre of the clear area of the stage, in stage pixels. */
  readonly cx = makeMutable(0);
  readonly cy = makeMutable(0);
  readonly imgW = makeMutable(0);
  readonly imgH = makeMutable(0);
  readonly stageW = makeMutable(1);
  /** Split handle position, 0..1 of the stage width. */
  readonly splitX = makeMutable(0.5);
  readonly compare = makeMutable(false);
  readonly holding = makeMutable(false);

  private stage = { w: 1, h: 1, bottom: 0 };
  private img = { w: 0, h: 0 };
  private fitScale = 1;
  private base = { x: 0, y: 0, cx: 0, cy: 0 };

  constructor(private readonly onZoom: (percent: number) => void) {}

  /** Report the zoom as a percentage of device pixels (also called from gestures via scheduleOnRN). */
  report = (zoom = this.zoom.value) => this.onZoom(Math.round(this.fitScale * zoom * PixelRatio.get() * 100));

  /** The stage's size and how much of its bottom is covered by floating controls. */
  setStage(w: number, h: number, bottom: number) {
    this.stage = { w: Math.max(1, w), h: Math.max(1, h), bottom };
    this.stageW.value = this.stage.w;
    this.place();
  }

  /** Set the image size. The user's framing survives a resolution change. */
  setImageSize(w: number, h: number, _keepView?: boolean) {
    this.img = { w, h };
    this.imgW.value = w;
    this.imgH.value = h;
    this.place();
  }

  /** Fit the photo in the clear area (JS-owned values only). */
  private place() {
    const { w, h, bottom } = this.stage;
    const clear = h - bottom;
    this.base.cx = w / 2;
    this.base.cy = clear / 2;
    this.cx.value = this.base.cx;
    this.cy.value = this.base.cy;
    if (!this.img.w) return;
    const pad = w < 600 ? 12 : 28;
    const f = Math.max(0.01, Math.min((w - pad * 2) / this.img.w, (clear - pad * 2) / this.img.h, 4));
    this.fitScale = f;
    this.base.x = (w - this.img.w * f) / 2;
    this.base.y = (clear - this.img.h * f) / 2;
    this.baseS.value = f;
    this.baseX.value = this.base.x;
    this.baseY.value = this.base.y;
    debug('viewer place', { stage: this.stage, img: this.img, fit: f, x: this.base.x, y: this.base.y });
  }

  /** Back to the whole photo in view. Animated unless `instant`. */
  fit(instant = false) {
    const to = (v: number) => (instant ? v : withTiming(v, { duration: 180 }));
    debug('viewer fit', { instant });
    this.zoom.value = to(1);
    this.panX.value = to(0);
    this.panY.value = to(0);
    this.report(1);
  }

  private zoomAt(fx: number, fy: number, next: number) {
    const z = this.zoom.value;
    next = clamp(next, 1, 16);
    const px = this.panX.value;
    const py = this.panY.value;
    // Keep the point under (fx, fy) where it is.
    this.panX.value = withTiming(fx - this.base.cx - (next * (fx - this.base.cx - px)) / z, { duration: 180 });
    this.panY.value = withTiming(fy - this.base.cy - (next * (fy - this.base.cy - py)) / z, { duration: 180 });
    this.zoom.value = withTiming(next, { duration: 180 });
    this.report(next);
  }

  /** Zoom so one image pixel is one device pixel. */
  actualSize() {
    this.zoomAt(this.base.cx, this.base.cy, 1 / (PixelRatio.get() * this.fitScale));
  }

  zoomBy(factor: number) {
    this.zoomAt(this.base.cx, this.base.cy, this.zoom.value * factor);
  }

  setCompare(on: boolean) {
    this.compare.value = on;
  }

  /** Press and hold to see the untouched original. */
  hold(on: boolean) {
    this.holding.value = on;
  }

  /** Double tap: zoom in around the point, or back to fit when already zoomed in. */
  toggleZoomAt(x: number, y: number) {
    if (this.zoom.value > 1.05) this.fit();
    else this.zoomAt(x, y, Math.max(2.5, 1 / (PixelRatio.get() * this.fitScale)));
  }

  /** Screen point (stage coordinates) → image pixel. */
  toImage(x: number, y: number): [number, number] {
    const z = this.zoom.value;
    const s = this.fitScale * z;
    const tx = this.base.cx + this.panX.value + z * (this.base.x - this.base.cx);
    const ty = this.base.cy + this.panY.value + z * (this.base.y - this.base.cy);
    return [(x - tx) / s, (y - ty) / s];
  }

  destroy() {}
}
