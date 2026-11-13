// Shrinks an ONNX model's download size without changing its graph interface:
//   • Conv / Gemm / modulated-conv weights -> int8, one scale per output channel, with a DequantizeLinear node
//   • other big float weights -> float16 with a Cast back to float32
// ONNX Runtime folds both back to float32 when the model loads, so inference is unchanged apart from
// the (tiny) rounding of the weights. Usage: node tools/shrink-model.mjs in.onnx out.onnx [--fp16-only]
// Needs `onnx-proto` (npm i --no-save onnx-proto).
import fs from 'node:fs';
import pkg from 'onnx-proto';
const { onnx } = pkg;

const [, , input, output, flag] = process.argv;
const fp16Only = flag === '--fp16-only';
// --keep16=text: tensors whose name contains `text` stay float16 (for layers that are sensitive to int8).
const keep16 = process.argv.filter((a) => a.startsWith('--keep16=')).map((a) => a.slice(9));
const MIN = 4096;

const model = onnx.ModelProto.decode(fs.readFileSync(input));
const g = model.graph;
const T = onnx.TensorProto.DataType;

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

// Gemm weights are [N, K] with transB (quantise per row, axis 0) or [K, N] (per column, axis 1).
const gemmAxis = new Map();
for (const n of g.node) {
  if (n.opType !== 'Gemm' || !n.input[1]) continue;
  const tb = n.attribute.find((a) => a.name === 'transB');
  gemmAxis.set(n.input[1], tb && Number(tb.i) === 1 ? 0 : 1);
}

const floats = (t) => {
  if (t.rawData?.length) return new Float32Array(t.rawData.buffer.slice(t.rawData.byteOffset, t.rawData.byteOffset + t.rawData.byteLength));
  return Float32Array.from(t.floatData);
};
const dims = (t) => t.dims.map((d) => Number(d));

const keep = [];
const prefix = [];
let before = 0, after = 0;
for (const t of g.initializer) {
  const n = dims(t).reduce((a, b) => a * b, 1);
  if (t.dataType !== T.FLOAT || n < MIN) { keep.push(t); continue; }
  const w = floats(t);
  before += w.length * 4;
  const d = dims(t);
  const axis = gemmAxis.has(t.name) ? gemmAxis.get(t.name) : d.length >= 3 ? (d[0] > 1 ? 0 : 1) : -1;
  if (!fp16Only && !keep16.some((k) => t.name.includes(k)) && axis >= 0 && d.length >= 2 && d.length <= 5) {
    // Quantise per output channel along `axis`: scale = max|w| / 127 for each slice.
    const C = d[axis];
    const inner = d.slice(axis + 1).reduce((a, b) => a * b, 1);
    const outer = n / (C * inner);
    const scale = new Float32Array(C);
    const q = new Int8Array(n);
    const mx = new Float32Array(C);
    for (let o = 0; o < outer; o++) for (let c = 0; c < C; c++) { const base = (o * C + c) * inner; for (let i = 0; i < inner; i++) mx[c] = Math.max(mx[c], Math.abs(w[base + i])); }
    for (let c = 0; c < C; c++) scale[c] = mx[c] / 127 || 1e-8;
    for (let o = 0; o < outer; o++) for (let c = 0; c < C; c++) { const base = (o * C + c) * inner; for (let i = 0; i < inner; i++) q[base + i] = Math.round(w[base + i] / scale[c]); }
    keep.push(onnx.TensorProto.create({ name: `${t.name}__q`, dims: d, dataType: T.INT8, rawData: Buffer.from(q.buffer) }));
    keep.push(onnx.TensorProto.create({ name: `${t.name}__s`, dims: [C], dataType: T.FLOAT, rawData: Buffer.from(scale.buffer) }));
    keep.push(onnx.TensorProto.create({ name: `${t.name}__z`, dims: [C], dataType: T.INT8, rawData: Buffer.alloc(C) }));
    prefix.push(onnx.NodeProto.create({ opType: 'DequantizeLinear', input: [`${t.name}__q`, `${t.name}__s`, `${t.name}__z`], output: [t.name], attribute: [onnx.AttributeProto.create({ name: 'axis', type: onnx.AttributeProto.AttributeType.INT, i: axis })] }));
    after += n + C * 5;
  } else {
    const h = new Uint16Array(n);
    for (let i = 0; i < n; i++) h[i] = f16(w[i]);
    keep.push(onnx.TensorProto.create({ name: `${t.name}__h`, dims: d, dataType: T.FLOAT16, rawData: Buffer.from(h.buffer) }));
    prefix.push(onnx.NodeProto.create({ opType: 'Cast', input: [`${t.name}__h`], output: [t.name], attribute: [onnx.AttributeProto.create({ name: 'to', type: onnx.AttributeProto.AttributeType.INT, i: T.FLOAT })] }));
    after += n * 2;
  }
}
g.initializer = keep;
// Initializers that were also listed as graph inputs would clash with the new Cast/Dequantize outputs.
const replaced = new Set(prefix.map((p) => p.output[0]));
g.input = g.input.filter((i) => !replaced.has(i.name));
g.node = [...prefix, ...g.node];
fs.writeFileSync(output, onnx.ModelProto.encode(model).finish());
console.log(`${(before / 1e6).toFixed(0)} MB of weights -> ${(after / 1e6).toFixed(0)} MB; file ${(fs.statSync(output).size / 1e6).toFixed(1)} MB`);
