/** Rotating, flipping and cropping a photo: the maths, shared by both platforms. */

export interface GeoOp {
  /** Quarter turns clockwise. */
  turns: 0 | 1 | 2 | 3;
  flipX: boolean;
  flipY: boolean;
  /** Crop rectangle in pixels of the rotated and flipped photo. */
  crop?: { x: number; y: number; w: number; h: number };
}

/** 2×3 matrix [a, b, c, d, e, f]: x' = a·x + b·y + c, y' = d·x + e·y + f. */
export type Mat = [number, number, number, number, number, number];

/** `a` applied after `b`. */
const compose = (a: Mat, b: Mat): Mat => [
  a[0] * b[0] + a[1] * b[3],
  a[0] * b[1] + a[1] * b[4],
  a[0] * b[2] + a[1] * b[5] + a[2],
  a[3] * b[0] + a[4] * b[3],
  a[3] * b[1] + a[4] * b[4],
  a[3] * b[2] + a[4] * b[5] + a[5],
];

/** Matrix that maps the source photo (W × H) onto its rotated and flipped self, and that photo's size. */
export function geoMatrix(op: Pick<GeoOp, 'turns' | 'flipX' | 'flipY'>, W: number, H: number): { m: Mat; w: number; h: number } {
  let m: Mat = [1, 0, 0, 0, 1, 0];
  let w = W;
  let h = H;
  if (op.turns === 1) (m = [0, -1, H, 1, 0, 0]), (w = H), (h = W);
  else if (op.turns === 2) m = [-1, 0, W, 0, -1, H];
  else if (op.turns === 3) (m = [0, 1, 0, -1, 0, W]), (w = H), (h = W);
  if (op.flipX) m = compose([-1, 0, w, 0, 1, 0], m);
  if (op.flipY) m = compose([1, 0, 0, 0, -1, h], m);
  return { m, w, h };
}

/** The biggest centred rectangle of `aspect` (width ÷ height) inside a W × H photo. */
export function centreCrop(W: number, H: number, aspect: number) {
  const w = Math.round(W / H > aspect ? H * aspect : W);
  const h = Math.round(W / H > aspect ? H : W / aspect);
  return { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h };
}
