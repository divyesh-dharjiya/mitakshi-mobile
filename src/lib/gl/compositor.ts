/**
 * Final on-screen / export rendering in one WebGL2 pass: before/after split, tone, detail,
 * vignette and AI background effects (blur, colour, black & white, transparent).
 *
 * Textures are image-oriented (v = 0 is the top row, as uploaded from ImageBitmaps); the shader
 * flips y because the canvas origin is bottom-left.
 */
import { BG, type Look, NEUTRAL } from './look';

export { NEUTRAL, type Look, type ToneKey } from './look';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

const VERT = /* glsl */ `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uOrig, uImg, uMask;
uniform bool uHasMask;
uniform float uSplit;
uniform vec2 uPx;
uniform float uExposure, uContrast, uHighlights, uShadows, uFade;
uniform float uWarm, uTint, uVibrance, uSat;
uniform float uSharpen, uDetail, uDenoise, uVig, uGrain;
uniform int uBg;            // 0 none, 1 blur, 2 colour, 3 black & white, 4 transparent
uniform float uBgBlur;      // mip level for the blur
uniform vec3 uBgColor;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/** Light & colour. localL = large-area brightness, so shadows/highlights act locally like a real editor. */
vec3 tone(vec3 c, float localL) {
  c *= exp2(uExposure);
  // Shadows lift dark regions, highlights recover bright ones (based on the surrounding area).
  float ll = clamp(localL * exp2(uExposure), 0.0, 1.0);
  c *= exp2(uShadows * 1.4 * (1.0 - ll) * (1.0 - ll) + uHighlights * 1.2 * ll * ll);
  // Smooth S-curve contrast that never hard-clips.
  float k = uContrast >= 0.0 ? uContrast * 1.6 : uContrast * 0.9;
  vec3 dc = clamp(c, 0.0, 1.5) - 0.5;
  c = 0.5 + dc * (1.0 + k) / (1.0 + k * abs(2.0 * dc));
  // Vibrance boosts muted colours most; saturation scales all colour.
  float L = dot(c, LUMA);
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = mix(vec3(L), c, max(0.0, (1.0 + uSat) * (1.0 + uVibrance * (1.0 - clamp(sat * 1.6, 0.0, 1.0)))));
  // White balance after saturation, so desaturated looks (vintage, film) still carry their tone.
  c *= vec3(1.0 + uWarm * 0.16 + uTint * 0.04, 1.0 + uWarm * 0.03 - uTint * 0.09, 1.0 - uWarm * 0.2 + uTint * 0.04);
  // Fade: lifted blacks and softened whites for a matte / film look.
  c = mix(c, vec3(0.1) + c * 0.82, uFade);
  return c;
}

// Smooth lens-like background blur: a 12-tap disc over a mip level (no blocky mip artefacts).
vec3 blurBg(vec2 uv) {
  float r = exp2(uBgBlur);
  vec3 s = textureLod(uImg, uv, uBgBlur - 1.0).rgb;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 2.39996;            // golden angle
    float d = sqrt((float(i) + 0.5) / 12.0);
    s += textureLod(uImg, uv + vec2(cos(a), sin(a)) * d * r * uPx, uBgBlur - 1.0).rgb;
  }
  return s / 13.0;
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  if (uv.x < uSplit) { outColor = vec4(texture(uOrig, uv).rgb, 1.0); return; }

  vec3 c = texture(uImg, uv).rgb;

  // Noise reduction: edge-aware average of the 8 neighbours (keeps edges, smooths grain).
  if (uDenoise > 0.0) {
    float sigma = 0.015 + 0.09 * uDenoise;
    vec3 acc = c; float wsum = 1.0;
    for (int j = -1; j <= 1; j++)
      for (int i = -1; i <= 1; i++) {
        if (i == 0 && j == 0) continue;
        vec3 n = texture(uImg, uv + vec2(float(i), float(j)) * uPx * 1.5).rgb;
        vec3 d = n - c;
        float w = exp(-dot(d, d) / (2.0 * sigma * sigma));
        acc += n * w; wsum += w;
      }
    c = mix(c, acc / wsum, min(1.0, uDenoise * 1.5));
  }
  // Sharpen (fine detail) and clarity (mid-size local contrast).
  vec3 fine = textureLod(uImg, uv, 0.75).rgb;
  c += (c - fine) * uSharpen * 2.0;
  vec3 mid = textureLod(uImg, uv, 3.0).rgb;
  float midW = 1.0 - pow(abs(2.0 * dot(c, LUMA) - 1.0), 2.0);
  c += (c - mid) * uDetail * 0.8 * midW;

  float localL = dot(textureLod(uImg, uv, 5.0).rgb, LUMA);
  c = tone(c, localL);

  float alpha = 1.0;
  if (uHasMask && uBg > 0) {
    float a = texture(uMask, uv).r;            // 1 = subject
    vec3 bg = c;
    if (uBg == 1) bg = tone(blurBg(uv), localL);
    else if (uBg == 2) bg = uBgColor;
    else if (uBg == 3) bg = vec3(dot(c, LUMA));
    if (uBg == 4) alpha = a;
    else c = mix(bg, c, a);
  }

  // Vignette: an even oval that follows the photo's shape (same look for portrait and landscape).
  vec2 d = (uv - 0.5) * 2.0;
  float v = smoothstep(0.45, 1.35, length(d));
  c *= 1.0 - uVig * 0.75 * v;

  // Film grain (luminance only, so it looks like real film rather than coloured noise).
  c += (hash(gl_FragCoord.xy + fract(uGrain * 13.1)) - 0.5) * uGrain * 0.16;
  outColor = vec4(clamp(c, 0.0, 1.0), alpha);
}`;


export class Compositor {
  readonly canvas: AnyCanvas;
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private orig: WebGLTexture | null = null;
  private img: WebGLTexture | null = null;
  private mask: WebGLTexture | null = null;
  private imgSize = { w: 0, h: 0 };
  private look: Look = { ...NEUTRAL };
  private split = 0;
  readonly maxTextureSize: number;

  constructor(canvas: AnyCanvas, opts: { preserveDrawingBuffer?: boolean } = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    this.prog = gl.createProgram()!;
    gl.attachShader(this.prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(this.prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(this.prog);
    if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.prog) ?? 'link');
    for (let i = 0; i < gl.getProgramParameter(this.prog, gl.ACTIVE_UNIFORMS); i++) {
      const n = gl.getActiveUniform(this.prog, i)!.name;
      this.u[n] = gl.getUniformLocation(this.prog, n);
    }
    gl.bindVertexArray(gl.createVertexArray());
  }

  private texture(src: TexImageSource | { w: number; h: number; data: Uint8Array }, mips: boolean, single = false) {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    const w = 'w' in src ? src.w : (src as ImageBitmap).width;
    const h = 'w' in src ? src.h : (src as ImageBitmap).height;
    const levels = mips ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1;
    gl.texStorage2D(gl.TEXTURE_2D, levels, single ? gl.R8 : gl.RGBA8, w, h);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if ('w' in src) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, single ? gl.RED : gl.RGBA, gl.UNSIGNED_BYTE, src.data);
    else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, src);
    if (mips) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private check(img: { width: number; height: number }) {
    if (img.width > this.maxTextureSize || img.height > this.maxTextureSize) throw new Error(`Image exceeds the GPU limit of ${this.maxTextureSize}px.`);
  }

  /** The untouched photo, shown on the left of the compare split. */
  setOriginal(img: ImageBitmap) {
    this.check(img);
    if (this.orig) this.gl.deleteTexture(this.orig);
    this.orig = this.texture(img, true);
  }

  /** The current edited image; the canvas takes its size. */
  setImage(img: ImageBitmap) {
    this.check(img);
    if (this.img) this.gl.deleteTexture(this.img);
    this.img = this.texture(img, true);
    this.imgSize = { w: img.width, h: img.height };
    this.canvas.width = img.width;
    this.canvas.height = img.height;
  }

  /** Subject matte (1 byte per pixel, 255 = subject) or null. */
  setMask(m: { width: number; height: number; alpha: Uint8Array } | null) {
    if (this.mask) this.gl.deleteTexture(this.mask);
    this.mask = m ? this.texture({ w: m.width, h: m.height, data: m.alpha }, false, true) : null;
  }

  get hasMask() {
    return !!this.mask;
  }

  setLook(l: Look) {
    this.look = l;
  }

  setSplit(uv: number) {
    this.split = uv;
  }

  render() {
    if (!this.img || !this.orig) return;
    const gl = this.gl, u = this.u, l = this.look;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    const bind = (unit: number, t: WebGLTexture | null, name: string) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(u[name], unit);
    };
    bind(0, this.orig, 'uOrig');
    bind(1, this.img, 'uImg');
    bind(2, this.mask ?? this.img, 'uMask');
    gl.uniform1i(u.uHasMask, this.mask ? 1 : 0);
    gl.uniform1f(u.uSplit, this.split);
    gl.uniform2f(u.uPx, 1 / this.canvas.width, 1 / this.canvas.height);
    gl.uniform1f(u.uExposure, l.exposure);
    gl.uniform1f(u.uContrast, l.contrast);
    gl.uniform1f(u.uHighlights, l.highlights);
    gl.uniform1f(u.uShadows, l.shadows);
    gl.uniform1f(u.uFade, l.fade);
    gl.uniform1f(u.uWarm, l.warmth);
    gl.uniform1f(u.uTint, l.tint);
    gl.uniform1f(u.uVibrance, l.vibrance);
    gl.uniform1f(u.uSat, l.saturation);
    gl.uniform1f(u.uSharpen, l.sharpen);
    gl.uniform1f(u.uDetail, l.detail);
    gl.uniform1f(u.uDenoise, l.denoise);
    gl.uniform1f(u.uVig, l.vignette);
    gl.uniform1f(u.uGrain, l.grain);
    gl.uniform1i(u.uBg, BG[l.bg]);
    // Blur radius scales with image size: a fixed fraction of the short side.
    const short = Math.min(this.imgSize.w, this.imgSize.h);
    gl.uniform1f(u.uBgBlur, Math.log2(Math.max(2, short * (0.004 + 0.03 * l.bgBlur))));
    gl.uniform3f(u.uBgColor, ...l.bgColor);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  destroy() {
    for (const t of [this.orig, this.img, this.mask]) if (t) this.gl.deleteTexture(t);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/** Look thumbnails are drawn by the native build only (the browser's Looks strip uses colour swatches). */
export function renderLookThumbs(_src: ImageBitmap, _looks: readonly unknown[], _size: number): string[] {
  return [];
}
