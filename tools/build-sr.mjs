// Rebuilds the on-device upscaler from Qualcomm's Real-ESRGAN General x4v3 export:
//   node tools/build-sr.mjs  [in.onnx] [out.onnx]
//
// What changes, and why (the network itself does not):
//  - Input is the photo's own RGBA bytes (uint8, NHWC) and the outputs are RGBA bytes too. The
//    divide-by-255, channel shuffling, clipping and rounding run inside ONNX Runtime's native kernels instead
//    of JavaScript loops, which were slower than the network on a phone.
//  - Two outputs: `x4` and `x2` (the 4x result averaged 2x2 inside the graph). ONNX Runtime only computes
//    the one that is asked for.
//  - The tile is 256 x 256 (the export used 128): bigger tiles waste less on overlap. The shape stays fixed
//    because ONNX Runtime's XNNPACK (the fast ARM path) only takes fixed shapes. Keep SR_TILE in
//    src/lib/ai/tasks.ts equal to TILE below.
//  - Weights are stored as float16 (4.8 MB -> 2.4 MB) and converted back to float32 when the model loads. Pass
//    --int8 to store convolution weights as int8 instead (1.3 MB, 41 dB PSNR against float16: the default keeps
//    full quality because the upscaler is the heart of the result).
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import pkg from 'onnx-proto';
const { onnx } = pkg;

const fromRoot = (p) => new URL(`../${p}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
// The Qualcomm export (and its .data weights) lives in tools/source so it is not shipped with the app.
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const input = args[0] ?? fromRoot('tools/source/real_esrgan_general_x4v3.onnx');
const output = args[1] ?? fromRoot('public/models/esrgan_x4v3_rgba.onnx');
const TILE = 256;
const INT8 = process.argv.includes('--int8');
// The compact upscaler leaves noisy, soft photos a little smooth ("painted"). A light unsharp mask on its output, done
// inside the graph, brings the edges back. --sharp=0 turns it off.
const SHARP = Number(process.argv.find((a) => a.startsWith('--sharp='))?.split('=')[1] ?? 0.6);
const T = onnx.TensorProto.DataType;
const A = onnx.AttributeProto.AttributeType;

const model = onnx.ModelProto.decode(fs.readFileSync(input));
const g = model.graph;

// External weights -> embedded.
const ext = new Map();
for (const t of g.initializer) {
  if (t.dataLocation !== onnx.TensorProto.DataLocation.EXTERNAL) continue;
  const info = Object.fromEntries(t.externalData.map((e) => [e.key, e.value]));
  const file = ext.get(info.location) ?? fs.readFileSync(join(dirname(input), info.location));
  ext.set(info.location, file);
  const off = Number(info.offset ?? 0);
  const len = Number(info.length ?? file.length - off);
  t.rawData = file.subarray(off, off + len);
  t.dataLocation = onnx.TensorProto.DataLocation.DEFAULT;
  t.externalData = [];
}

const f16 = (() => {
  const f = new Float32Array(1), u = new Uint32Array(f.buffer);
  return (v) => {
    f[0] = v;
    const x = u[0], s = (x >>> 16) & 0x8000, e = ((x >>> 23) & 0xff) - 112, m = x & 0x7fffff;
    if (e <= 0) return e < -10 ? s : s | ((m | 0x800000) >> (14 - e));
    if (e >= 31) return s | 0x7c00;
    return s | (e << 10) | (m >> 13);
  };
})();

const prefix = [];
const inits = [];
for (const t of g.initializer) {
  const n = t.dims.reduce((a, b) => a * Number(b), 1);
  if (t.dataType !== T.FLOAT || n < 512) { inits.push(t); continue; }
  const w = new Float32Array(t.rawData.buffer.slice(t.rawData.byteOffset, t.rawData.byteOffset + t.rawData.byteLength));
  if (INT8 && t.dims.length === 4) {
    // Per output channel: scale = max|w| / 127.
    const C = Number(t.dims[0]);
    const per = n / C;
    const q = new Int8Array(n);
    const scale = new Float32Array(C);
    for (let c = 0; c < C; c++) {
      let mx = 0;
      for (let i = 0; i < per; i++) mx = Math.max(mx, Math.abs(w[c * per + i]));
      scale[c] = mx / 127 || 1e-8;
      for (let i = 0; i < per; i++) q[c * per + i] = Math.round(w[c * per + i] / scale[c]);
    }
    inits.push(onnx.TensorProto.create({ name: `${t.name}__q`, dims: t.dims, dataType: T.INT8, rawData: Buffer.from(q.buffer) }));
    inits.push(onnx.TensorProto.create({ name: `${t.name}__s`, dims: [C], dataType: T.FLOAT, rawData: Buffer.from(scale.buffer) }));
    inits.push(onnx.TensorProto.create({ name: `${t.name}__z`, dims: [C], dataType: T.INT8, rawData: Buffer.alloc(C) }));
    prefix.push(node('DequantizeLinear', [`${t.name}__q`, `${t.name}__s`, `${t.name}__z`], [t.name], { axis: [A.INT, 0] }));
    continue;
  }
  const h = new Uint16Array(n);
  for (let i = 0; i < n; i++) h[i] = f16(w[i]);
  inits.push(onnx.TensorProto.create({ name: `${t.name}__h`, dims: t.dims, dataType: T.FLOAT16, rawData: Buffer.from(h.buffer) }));
  prefix.push(node('Cast', [`${t.name}__h`], [t.name], { to: [A.INT, T.FLOAT] }));
}

function node(op, inputs, outputs, attrs = {}) {
  return onnx.NodeProto.create({
    opType: op,
    input: inputs,
    output: outputs,
    attribute: Object.entries(attrs).map(([name, [type, v]]) =>
      onnx.AttributeProto.create({ name, type, ...(type === A.INT ? { i: v } : type === A.INTS ? { ints: v } : { f: v }) }),
    ),
  });
}
const i64 = (name, vals) => inits.push(onnx.TensorProto.create({ name, dims: [vals.length], dataType: T.INT64, int64Data: vals }));
const f32 = (name, v) => inits.push(onnx.TensorProto.create({ name, dims: [], dataType: T.FLOAT, floatData: [v] }));
const dim = (v) => (typeof v === 'number' ? { dimValue: v } : { dimParam: v });
const info = (name, type, dims) => onnx.ValueInfoProto.create({ name, type: { tensorType: { elemType: type, shape: { dim: dims.map(dim) } } } });

// Pre-processing: RGBA bytes -> RGB float NCHW in 0..1.
i64('c_s0', [0]); i64('c_e3', [3]); i64('c_e1', [1]); i64('c_ax3', [3]); i64('c_ax1', [1]);
f32('c_k', SHARP); f32('c_inv255', 1 / 255); f32('c_255', 255); f32('c_half', 0.5); f32('c_0', 0); f32('c_zero', 0);
const pre = [
  node('Slice', ['rgba', 'c_s0', 'c_e3', 'c_ax3'], ['p_rgb']),
  node('Cast', ['p_rgb'], ['p_f'], { to: [A.INT, T.FLOAT] }),
  node('Transpose', ['p_f'], ['p_chw'], { perm: [A.INTS, [0, 3, 1, 2]] }),
  node('Mul', ['p_chw', 'c_inv255'], ['image']),
];

// Post-processing: float 0..1 NCHW -> RGBA bytes NHWC.
const post = (src, tag, out) => [
  node('Mul', [src, 'c_255'], [`${tag}_a`]),
  node('Add', [`${tag}_a`, 'c_half'], [`${tag}_b`]),
  node('Clip', [`${tag}_b`, 'c_0', 'c_255'], [`${tag}_rgb`]),
  node('Slice', [`${tag}_rgb`, 'c_s0', 'c_e1', 'c_ax1'], [`${tag}_r`]),
  node('Mul', [`${tag}_r`, 'c_zero'], [`${tag}_z`]),
  node('Add', [`${tag}_z`, 'c_255'], [`${tag}_alpha`]),
  node('Concat', [`${tag}_rgb`, `${tag}_alpha`], [`${tag}_rgba`], { axis: [A.INT, 1] }),
  node('Cast', [`${tag}_rgba`], [`${tag}_u8`], { to: [A.INT, T.UINT8] }),
  node('Transpose', [`${tag}_u8`], [out], { perm: [A.INTS, [0, 2, 3, 1]] }),
];
// Unsharp mask: y + k * (y - 3x3 mean(y)).
const sharpen = [
  node('AveragePool', ['upscaled_image'], ['sh_blur'], { kernel_shape: [A.INTS, [3, 3]], strides: [A.INTS, [1, 1]], pads: [A.INTS, [1, 1, 1, 1]] }),
  node('Sub', ['upscaled_image', 'sh_blur'], ['sh_d']),
  node('Mul', ['sh_d', 'c_k'], ['sh_m']),
  node('Add', ['upscaled_image', 'sh_m'], ['sharp_image']),
];
const pool = node('AveragePool', ['sharp_image'], ['avg2'], { kernel_shape: [A.INTS, [2, 2]], strides: [A.INTS, [2, 2]] });

g.initializer = inits;
g.node = [...prefix, ...pre, ...g.node, ...sharpen, ...post('sharp_image', 'q4', 'x4'), pool, ...post('avg2', 'q2', 'x2')];
g.input = [info('rgba', T.UINT8, [1, TILE, TILE, 4])];
g.output = [info('x4', T.UINT8, [1, TILE * 4, TILE * 4, 4]), info('x2', T.UINT8, [1, TILE * 2, TILE * 2, 4])];
g.valueInfo = [];
fs.writeFileSync(output, onnx.ModelProto.encode(model).finish());
console.log(`${output}: ${(fs.statSync(output).size / 1e6).toFixed(2)} MB`);
