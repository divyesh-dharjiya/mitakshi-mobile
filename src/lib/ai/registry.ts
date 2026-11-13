/** Every AI model the app uses. All licences permit commercial use except where noted (see README). */

export type ModelKey = 'detector' | 'restorer' | 'sr' | 'colorizer' | 'matte';

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

/**
 * Face restoration: GPEN-BFR-512, the same engine as the web app (clearly better faces than the 256 model: real skin
 * texture, hair strands, natural eyes). It downloads the first time a photo is enhanced and stays on the phone.
 *  - Default: FaceFusion's full-size file (284 MB) on Hugging Face, which needs no hosting.
 *  - Better: set EXPO_PUBLIC_FACE_URL to a copy of the compact file (gpen_bfr_512_q.onnx, 78 MB, see README): same
 *    faces, a quarter of the download. The full-size file stays as the fallback if that address is unreachable.
 */
const FACE_URL = process.env.EXPO_PUBLIC_FACE_URL;
const FACE_FULL = { url: `${HF}/facefusion/models-3.0.0/resolve/main/gpen_bfr_512.onnx`, bytes: 284_340_240 };
export const RESTORER_SIZE: 256 | 512 = 512;

export const MODELS: Record<ModelKey, ModelDef> = {
  // YuNet face detector (OpenCV Zoo, MIT).
  detector: { url: `${BASE}/models/yunet.onnx`, label: 'Face detector' },
  // GPEN-BFR 256 face restoration, FaceFusion's ONNX export: 76 MB and about eight times faster than GFPGAN (340 MB),
  // with natural-looking skin and eyes. GPEN's repository carries no licence file: have your lawyer confirm it
  // before a commercial launch, or switch to GFPGAN 1.4 (Apache-2.0, `gfpgan_1.4.onnx`, 340 MB, CROP = 512 in faces.ts).
  restorer: FACE_URL
    ? { url: FACE_URL, label: 'Face restoration engine', large: { bytes: 77_917_344 }, fallbacks: [FACE_FULL] }
    : { url: FACE_FULL.url, label: 'Face restoration engine', large: { bytes: FACE_FULL.bytes } },
  // Real-ESRGAN General x4v3 (BSD-3-Clause), Qualcomm AI Hub export, rebuilt by tools/build-sr.mjs (RGBA bytes in and out, 256² tiles).
  sr: { url: `${BASE}/models/esrgan_x4v3_rgba.onnx`, label: 'Upscaler' },
  // DDColor tiny (Apache-2.0), weights stored as int8: 62 MB, natural colour, 256² input.
  colorizer: {
    url: `${HF}/Faridzar/ddcolor-mirror/resolve/main/ddcolor-wq8.onnx`,
    label: 'Colorization engine',
    large: { bytes: 62_078_001 },
    fallbacks: [{ url: `${HF}/wavespeed/image-colorizer/resolve/main/ddcolor-fp16.onnx`, bytes: 113225654 }],
  },
  matte: { url: `${HF}/Xenova/modnet/resolve/main/onnx/model_fp16.onnx`, label: 'Background engine', large: { bytes: 12_984_781 } },
};

export const modelBytes = (k: ModelKey) => MODELS[k].large?.bytes ?? 0;
