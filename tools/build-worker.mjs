// Metro cannot bundle Web Workers, so the AI worker (ONNX Runtime Web + the pixel pipeline) is
// bundled here with esbuild into public/ai-worker.js, and ONNX Runtime's WASM engine is copied
// into public/ort. Runs before `start`, `web` and `export`. Pass --watch to rebuild on change.
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const watch = process.argv.includes('--watch');
const production = process.env.NODE_ENV === 'production' || process.argv.includes('--production');

const ortSrc = `${root}node_modules/onnxruntime-web/dist`;
await mkdir(`${root}public/ort`, { recursive: true });
for (const f of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']) {
  await copyFile(`${ortSrc}/${f}`, `${root}public/ort/${f}`);
}

const options = {
  entryPoints: [`${root}src/lib/ai/worker.ts`],
  outfile: `${root}public/ai-worker.js`,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: production,
  sourcemap: !production,
  alias: { '@': `${root}src` },
  // ONNX Runtime loads its own WASM glue at runtime from ort.env.wasm.wasmPaths.
  external: ['*.wasm'],
  define: {
    'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development'),
    'process.env.EXPO_PUBLIC_ASSET_BASE': JSON.stringify(process.env.EXPO_PUBLIC_ASSET_BASE ?? ''),
    // worker.ts is shared with the web app, which names the same setting NEXT_PUBLIC_ASSET_BASE.
    'process.env.NEXT_PUBLIC_ASSET_BASE': JSON.stringify(process.env.EXPO_PUBLIC_ASSET_BASE ?? ''),
    'process.env.EXPO_PUBLIC_MODEL_BASE': JSON.stringify(process.env.EXPO_PUBLIC_MODEL_BASE ?? ''),
  },
  logLevel: 'warning',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('AI worker: watching for changes');
} else {
  if (production) await rm(`${options.outfile}.map`, { force: true });
  await esbuild.build(options);
  console.log('AI worker bundled to public/ai-worker.js, ONNX Runtime copied to public/ort');
}
