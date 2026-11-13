import { clamp } from './format';

/**
 * Zoom, pan and the before/after split for the preview. Navigation is a CSS transform on the
 * image wrapper (GPU-composited), so moving around never re-runs the image pipeline.
 */

export interface ViewerOptions {
  /** Called with the split position (0..1 of the image width), or >1 to show only the original. */
  onSplit(uv: number): void;
  /** Called with the zoom level as a percentage of device pixels. */
  onZoom(percent: number): void;
  /** Return true to leave a pointer alone (the eraser brush paints instead of panning). */
  ignore?(e: PointerEvent): boolean;
}

/** Elements marked with this attribute never start a pan (zoom bar, split handle). */
const IGNORE_SELECTOR = '[data-viewer-ignore]';

type Listener = [EventTarget, string, EventListener, AddEventListenerOptions | undefined];

export class Viewer {
  private imgW = 0;
  private imgH = 0;
  private scale = 1;
  private tx = 0;
  private ty = 0;
  private fitScale = 1;
  private compare = false;
  private holding = false;
  private splitX = 0.5;
  private draggingSplit = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private listeners: Listener[] = [];
  private observer: ResizeObserver;

  constructor(
    private readonly stage: HTMLElement,
    private readonly art: HTMLElement,
    private readonly split: HTMLElement,
    private readonly opts: ViewerOptions,
  ) {
    this.observer = new ResizeObserver(() => this.fit(true));
    this.observer.observe(stage);
    this.on(stage, 'wheel', (e) => this.onWheel(e as WheelEvent), { passive: false });
    this.on(stage, 'pointerdown', (e) => this.onDown(e as PointerEvent));
    this.on(stage, 'pointermove', (e) => this.onMove(e as PointerEvent));
    this.on(stage, 'pointerup', (e) => this.onUp(e as PointerEvent));
    this.on(stage, 'pointercancel', (e) => this.onUp(e as PointerEvent));
    this.on(stage, 'dblclick', (e) => this.onDouble(e as MouseEvent));
    this.on(split, 'pointerdown', (e) => this.onSplitDown(e as PointerEvent));
    this.on(split, 'pointermove', (e) => this.onSplitMove(e as PointerEvent));
    this.on(split, 'pointerup', () => (this.draggingSplit = false));
    this.on(split, 'pointercancel', () => (this.draggingSplit = false));
  }

  /** Remove every listener (called when the view unmounts). */
  destroy() {
    this.observer.disconnect();
    for (const [target, type, fn, options] of this.listeners) target.removeEventListener(type, fn, options);
    this.listeners = [];
  }

  private on(target: EventTarget, type: string, fn: (e: Event) => void, options?: AddEventListenerOptions) {
    target.addEventListener(type, fn as EventListener, options);
    this.listeners.push([target, type, fn as EventListener, options]);
  }

  /** Set the image size. With `keepView`, the on-screen framing survives a resolution change. */
  setImageSize(w: number, h: number, keepView = false) {
    const changed = w !== this.imgW || h !== this.imgH;
    const prevW = this.imgW;
    this.imgW = w;
    this.imgH = h;
    if (keepView && prevW && changed) {
      this.scale *= prevW / w;
      this.fitScale = this.computeFit();
      this.apply();
    } else if (changed || !keepView) {
      this.fit();
    }
  }

  /**
   * The part of the stage that floating panels leave uncovered. The layout publishes the panel
   * sizes as `--inset-*` custom properties on the stage, so the picture centres in the clear area.
   */
  private visible() {
    const r = this.stage.getBoundingClientRect();
    const css = getComputedStyle(this.stage);
    const px = (name: string) => parseFloat(css.getPropertyValue(name)) || 0;
    const left = px('--inset-left');
    const top = px('--inset-top');
    const w = Math.max(1, r.width - left - px('--inset-right'));
    const h = Math.max(1, r.height - top - px('--inset-bottom'));
    return { r, left, top, w, h };
  }

  private computeFit() {
    const v = this.visible();
    const pad = v.w < 600 ? 12 : 28;
    return Math.min((v.w - pad * 2) / this.imgW, (v.h - pad * 2) / this.imgH, 4);
  }

  /** Fit the whole image in the clear area. With `onlyIfFitted`, only re-fits when the user hasn't zoomed. */
  fit(onlyIfFitted = false) {
    if (!this.imgW) return;
    const wasFitted = Math.abs(this.scale - this.fitScale) < 1e-6;
    this.fitScale = this.computeFit();
    if (onlyIfFitted && !wasFitted) return this.apply();
    const v = this.visible();
    this.scale = this.fitScale;
    this.tx = v.left + (v.w - this.imgW * this.scale) / 2;
    this.ty = v.top + (v.h - this.imgH * this.scale) / 2;
    this.apply();
  }

  /** Zoom so one image pixel is one device pixel. */
  actualSize() {
    const v = this.visible();
    this.zoomAt(v.r.left + v.left + v.w / 2, v.r.top + v.top + v.h / 2, 1 / devicePixelRatio);
  }

  zoomBy(factor: number) {
    const v = this.visible();
    this.zoomAt(v.r.left + v.left + v.w / 2, v.r.top + v.top + v.h / 2, this.scale * factor);
  }

  private zoomAt(cx: number, cy: number, next: number) {
    const r = this.stage.getBoundingClientRect();
    const min = Math.min(this.fitScale, 1) * 0.5;
    const max = Math.max(this.fitScale * 16, 8);
    next = clamp(next, min, max);
    const x = cx - r.left;
    const y = cy - r.top;
    this.tx = x - ((x - this.tx) * next) / this.scale;
    this.ty = y - ((y - this.ty) * next) / this.scale;
    this.scale = next;
    this.apply();
  }

  setCompare(on: boolean) {
    this.compare = on;
    this.update();
  }

  /** Press and hold to see the untouched original. */
  hold(on: boolean) {
    this.holding = on;
    this.update();
  }

  private onWheel(e: WheelEvent) {
    if (!this.imgW) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    this.zoomAt(e.clientX, e.clientY, this.scale * factor);
  }

  private onDouble(e: MouseEvent) {
    if ((e.target as HTMLElement).closest(IGNORE_SELECTOR)) return;
    if (this.scale > this.fitScale * 1.01) this.fit();
    else this.zoomAt(e.clientX, e.clientY, Math.max(this.fitScale * 2.5, 1 / devicePixelRatio));
  }

  private onDown(e: PointerEvent) {
    if (!this.imgW || (e.target as HTMLElement).closest(IGNORE_SELECTOR) || this.opts.ignore?.(e)) return;
    this.stage.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) this.pinchDist = this.pinchSpan();
    this.stage.classList.add('is-panning');
  }

  private pinchSpan() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private onMove(e: PointerEvent) {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    if (this.pointers.size === 1) {
      this.tx += e.clientX - prev.x;
      this.ty += e.clientY - prev.y;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.apply();
      return;
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [a, b] = [...this.pointers.values()];
    const d = this.pinchSpan();
    if (this.pinchDist > 0) this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (this.scale * d) / this.pinchDist);
    this.pinchDist = d;
  }

  private onUp(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    this.pinchDist = this.pointers.size === 2 ? this.pinchSpan() : 0;
    if (!this.pointers.size) this.stage.classList.remove('is-panning');
  }

  private onSplitDown(e: PointerEvent) {
    e.stopPropagation();
    this.draggingSplit = true;
    this.split.setPointerCapture(e.pointerId);
  }

  private onSplitMove(e: PointerEvent) {
    if (!this.draggingSplit) return;
    const r = this.stage.getBoundingClientRect();
    this.splitX = clamp((e.clientX - r.left) / r.width, 0, 1);
    this.update();
  }

  private apply() {
    this.art.style.width = `${this.imgW}px`;
    this.art.style.height = `${this.imgH}px`;
    this.art.style.transform = `translate3d(${this.tx}px, ${this.ty}px, 0) scale(${this.scale})`;
    this.opts.onZoom(Math.round(this.scale * devicePixelRatio * 100));
    this.update();
  }

  private update() {
    const r = this.stage.getBoundingClientRect();
    this.split.style.display = this.compare && !this.holding ? 'block' : 'none';
    this.split.style.transform = `translate3d(${this.splitX * r.width}px, 0, 0)`;
    let uv = 0;
    if (this.holding) uv = 1.01;
    else if (this.compare && this.imgW) uv = clamp((this.splitX * r.width - this.tx) / (this.imgW * this.scale), -0.01, 1.01);
    this.opts.onSplit(uv);
  }
}
