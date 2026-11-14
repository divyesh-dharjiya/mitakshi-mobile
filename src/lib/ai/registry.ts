/** Every AI model the app uses: the same engines as the web app. See README for licences. */

export type ModelKey = 'detector' | 'restorer' | 'sr' | 'matte';

export interface ModelDef {
  url: string;
  label: string;
  /** Other places to download the same file from, tried in order when `url` fails. */
  fallbacks?: { url: string; bytes: number }[];
  /** Large model: streamed once into on-device storage with download progress. */
  large?: { bytes: number };
}

/** Serve self-hosted model files from a CDN by setting EXPO_PUBLIC_ASSET_BASE (e.g. https://cdn.example.com). */
const BASE = (process.env.EXPO_PUBLIC_ASSET_BASE ?? '').replace(/\/$/, '');
const HF = 'https://huggingface.co';
/** The web app's public repository serves the files it hosts itself (the upscaler), so both apps use the same ones. */
const WEB_MODELS = 'https://raw.githubusercontent.com/divyesh-dharjiya/image-enhancement/main/public/models';

/**
 * Face restoration: CodeFormer, FaceFusion's ONNX export, 377 MB, downloaded once the first time a photo is enhanced
 * and kept on the phone. In side-by-side tests on the same photos it gave the most natural colour, skin and eyes
 * (RestoreFormer++ hardened and over-saturated a faded print, GFPGAN 1.4 warped eyes, GPEN-1024 was harsher).
 *
 * LICENCE: CodeFormer's licence (S-Lab, NTU) is NON-COMMERCIAL. Fine for a personal or free app; before selling the app
 * or showing ads, switch `restorer` to RestoreFormer++ (Apache-2.0: restoreformer_plus_plus.onnx, 294 MB,
 * 294_264_232 bytes, same folder on Hugging Face), which needs no other change.
 */
export const RESTORER_SIZE: 256 | 512 = 512;

export const MODELS: Record<ModelKey, ModelDef> = {
  // YuNet face detector (OpenCV Zoo, MIT): built into the app.
  detector: { url: `${BASE}/models/yunet.onnx`, label: 'Face detector' },
  restorer: {
    url: `${HF}/facefusion/models-3.0.0/resolve/main/codeformer.onnx`,
    label: 'Face restoration engine',
    large: { bytes: 376_951_650 },
  },
  // Real-ESRGAN x4plus (BSD-3-Clause), the same file as the web app (tools/build-sr.mjs: RGBA bytes in and out, 256²
  // tiles, float16 weights). Downloaded once rather than built in, so the APK stays under 25 MB.
  sr: { url: `${WEB_MODELS}/esrgan_x4plus_rgba.onnx`, label: 'Upscaler', large: { bytes: 36_123_606 } },
  matte: { url: `${HF}/Xenova/modnet/resolve/main/onnx/model_fp16.onnx`, label: 'Background engine', large: { bytes: 12_984_781 } },
};

export const modelBytes = (k: ModelKey) => MODELS[k].large?.bytes ?? 0;
