# Mitakshi: AI photo enhancer (React Native / Expo)

The Mitakshi AI photo enhancer as a React Native app (Expo SDK 58). It runs fully on the device: as a native Android app and in the browser (react-native-web).

## Android APK

```bash
npm install
npm run apk          # builds ./Mitakshi.apk (about 15 min the first time, a few minutes after)
```

Copy `Mitakshi.apk` to the phone and open it to install. Android asks once to allow installs from that source. The app needs Android 8.0 or later on a 64-bit (arm64) phone. The APK is about 26 MB.

`npm run apk` (`tools/build-apk.mjs`) mirrors the project to `C:\m` and builds there. Android's native build breaks on long Windows paths and paths with spaces, and the build output should stay out of OneDrive. It uses JDK 17 and the Android SDK from `JAVA_HOME` / `ANDROID_HOME`, or from `%LOCALAPPDATA%\Programs\jdk17` and `%LOCALAPPDATA%\Android\Sdk`. Pass `--clean` to regenerate the native project, and `--abi x86_64` for a copy that runs on the Android emulator on a PC (do not hand that one to users: it is a different build). Set `EXPO_PUBLIC_DEBUG=1` for a build that logs the pipeline to logcat, and `MITAKSHI_TEST_BUILD=1` to allow plain-http model downloads from a laptop.

Until an upload key exists (below), the APK is signed with the debug key, which is fine for installing on your own phones.

## Google Play

```bash
npm run upload-key   # once: creates your upload key (asks for a password)
npm run aab          # builds ./Mitakshi.aab, signed with that key
```

Upload `Mitakshi.aab` in the Play Console and keep Play App Signing on. Back up `~/.mitakshi/mitakshi-upload.jks` and its password, and raise `android.versionCode` in `app.json` for every upload. The app asks for no camera, microphone or photo-read permission, so the Console needs no photo-permission declaration. The Data safety form can declare that no data is collected or shared.

## AI engines and download size

The face detector (0.2 MB) and the 4× upscaler (2.4 MB) ship inside the app, so **Enhance works offline straight after install**. The two engines below download once, the first time they are chosen, straight from Hugging Face, and stay on the phone. The user picks *either* face restoration *or* colorization for a run, so only one of them is ever downloaded for it.

| Engine | Used for | Size | Licence |
| --- | --- | --- | --- |
| YuNet (bundled) | finding faces | 0.2 MB | MIT |
| Real-ESRGAN General x4v3 (bundled) | 2× / 4× upscale | 2.4 MB | BSD-3-Clause |
| GPEN-BFR 512 (same as the web app) | face restoration | 284 MB, or 78 MB from your own host | **not stated: confirm before a commercial launch** |
| DDColor tiny (int8) | colorize old photos | 62 MB | Apache-2.0 |
| MODNet (fp16) | background | 13 MB | Apache-2.0 |

**Best faces: GPEN-BFR-512.** It gives clearly better faces than the 256 model (real skin texture, hair strands, natural eyes). `tools/shrink-model.mjs` stores it as int8 + float16, which is 78 MB (the original is 284 MB) and looks identical to the full file in tests. That file is `model-upload/gpen_bfr_512_q.onnx`: upload it to any HTTPS host (for example a free Hugging Face model repo) and build with `EXPO_PUBLIC_FACE_URL=https://…/gpen_bfr_512_q.onnx npm run apk`. Without that variable the app downloads FaceFusion's full-size 512 file (284 MB) the first time a photo is enhanced. (The web app serves the 512 file itself from `public/models`.)

GPEN replaced GFPGAN (340 MB) because it is about eight times faster on a phone and a quarter of the size. Its repository has no licence file, so ask your lawyer before a commercial launch; the swap-back to GFPGAN 1.4 (Apache-2.0) is described in `src/lib/ai/registry.ts`.

### How it stays fast

- **One pass through the photo.** The upscaler takes the photo's own RGBA bytes and returns RGBA bytes, so the colour conversion, clipping and rounding run in ONNX Runtime's native kernels instead of JavaScript (`tools/build-sr.mjs` rebuilds the network for that, with float16 weights).
- **Fixed 256 px tiles** so ONNX Runtime's XNNPACK (the fast ARM path) can be used; an accelerator self-test (`accel.native.ts`) decides whether NNAPI helps on a given phone and remembers the answer.
- **Sized to the phone.** The output scale and the working pixel budget follow the photo size and the phone's RAM; only the three latest edits are kept for undo; face detection runs on a 2048 px preview.
- One overall progress bar with a time-left estimate covers detection, model load, faces, upscaling and colour.

### Why the APK is small

Only arm64 native code ships (ONNX Runtime, Skia, React Native, Hermes). `plugins/withOrtVersion.js` pins ONNX Runtime to 1.22.0: the newest releases are twice the size for nothing this app uses. Raise the pin only after re-checking the APK size and the models. Play serves each phone only its own architecture.

## Screens

- **Splash** (`components/brand/Splash.tsx`): the logo settles and the name rises on the same background as Android's own splash, so there is no flash.
- **Home** (`components/home/`): a hero with a live before/after and one big *Choose a photo* button, then *More tools*: Auto fix, Colorize, Background, Crop & rotate, and Batch.
- **Editor** (`components/editor/`): four tabs at the bottom (a side panel on tablets and landscape).
  - *Enhance*: **Faces** or **Colorize** (one at a time) and Size, one button, then face strength.
  - *Edit*: **Auto fix** (brightness, contrast, colour balance, detail from the photo's own histogram), Looks, and Light / Colour / Detail sliders. All live and non-destructive.
  - *Crop*: rotate, flip, mirror, crop to 1:1 / 4:5 / 3:4 / 9:16 / 4:3 / 16:9. Before/after is switched off afterwards because the original no longer lines up.
  - *Backdrop*.
- **Processing** (`ProcessingOverlay.tsx`): a progress ring with the step, the time left, the download size on first use, and Cancel.

## Brand

Navy and sky blue in two modes: **dark is the default** (deep navy, sky-blue accent) and light is one tap away (the sun / moon button on the home screen, or Settings → Appearance; the choice is remembered). Every colour lives in `src/theme.ts`: components read the palette with `useTheme()` and build styles with `makeStyles()`, so a switch restyles the whole app at once. The web app's `globals.css` has the same tokens. The mark is a white **M** with a sky-blue iris on a navy tile ("Mitakshi" means *of the beautiful eyes*). `tools/make-assets.mjs` draws every icon and the demo photos (`assets/`, `public/icon.svg`); the same geometry is in `components/brand/Logo.tsx` and the web app's `Logo.tsx`: keep the three in sync.

## How it is put together

| Layer | Browser | Android |
| --- | --- | --- |
| UI | React Native components (shared) | same |
| Editor state and actions | `src/lib/editor/*.ts` (shared) | same, plus `*.native.ts` for export, batch, picker, runtime |
| AI engine | Web Worker + ONNX Runtime Web (WebGPU / WASM): `ai/worker.ts`, `ai/client.ts` | ONNX Runtime Android (XNNPACK, CPU fallback): `ai/client.native.ts` |
| AI pipelines | `ai/faces.ts`, `ai/tasks.ts`, `ai/image-core.ts` (shared) | same |
| Pixels in/out | OffscreenCanvas: `ai/image.ts`, `imageio.ts` | Skia: `ai/image.native.ts`, `imageio.native.ts` |
| Look / compositor | WebGL2 shader: `gl/compositor.ts` | Skia runtime shader: `gl/compositor.native.ts` |
| Photo view | DOM canvas + pointer events: `Canvas.web.tsx` | Skia canvas + gesture handler: `Canvas.native.tsx`, `lib/native/viewer.ts` |

The native viewer keeps *placement* (where the fitted photo sits; written only by JS) apart from the *user's framing* (zoom and pan; written only by gestures). A new resolution after an AI step, or a layout change, therefore never moves the photo.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run apk` | Android release APK into `./Mitakshi.apk` |
| `npm run upload-key` | Create the Google Play upload key (once) |
| `npm run aab` | Google Play bundle into `./Mitakshi.aab` |
| `npm run web` | Browser dev server (http://localhost:8081) |
| `npm run export` | Static web build in `dist/` |
| `npm run typecheck` | Type-check |
| `node tools/make-assets.mjs` | Redraw the logo and icons |
| `node tools/shrink-model.mjs in.onnx out.onnx` | Store a model's weights as int8 / float16 |
| `node tools/build-sr.mjs` | Rebuild the bundled upscaler from `tools/source/` |
