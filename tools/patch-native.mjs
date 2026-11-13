// Small compatibility fixes for onnxruntime-react-native 1.24 on React Native 0.88 (new
// architecture only) and Gradle 9. Runs on `postinstall`; every edit is idempotent.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../node_modules/onnxruntime-react-native/android/', import.meta.url));

function patch(file, edits) {
  const path = root + file;
  if (!existsSync(path)) return console.warn(`patch-native: ${file} not found, skipped`);
  let src = readFileSync(path, 'utf8');
  let changed = false;
  for (const [from, to] of edits) {
    if (src.includes(to) && !src.includes(from)) continue;
    if (!src.includes(from)) throw new Error(`patch-native: pattern not found in ${file}: ${from.slice(0, 60)}`);
    src = src.split(from).join(to);
    changed = true;
  }
  if (changed) {
    writeFileSync(path, src);
    console.log(`patch-native: patched ${file}`);
  }
}

patch('build.gradle', [
  // The app's root project supplies the Android Gradle Plugin; an old classpath here conflicts with it.
  ["    classpath 'com.android.tools.build:gradle:7.4.2'\n", ''],
  // org.gradle.util.VersionNumber was removed in Gradle 9.
  ['if (VersionNumber.parse(REACT_NATIVE_VERSION) < VersionNumber.parse("0.71")) {', 'if (REACT_NATIVE_MINOR_VERSION < 71) {'],
  // Deprecated DSL blocks removed from recent Android Gradle Plugin versions.
  ['  lintOptions {\n', '  lint {\n'],
  ['  packagingOptions {\n', '  packaging {\n'],
  ['    pickFirst \'**/libc++_shared.so\'\n    pickFirst \'**/libfbjni.so\'\n', "    jniLibs.pickFirsts += ['**/libc++_shared.so', '**/libfbjni.so']\n"],
  ["    doNotStrip resolveBuildType() == 'debug' ? \"**/**/*.so\" : ''\n", ''],
  ['    excludes = [\n', '    resources.excludes += [\n'],
]);

patch('CMakeLists.txt', [
  // Google Play requires 16 KB-aligned native libraries; NDK 27 still links at 4 KB by default.
  [
    '             POSITION_INDEPENDENT_CODE ON)\n',
    '             POSITION_INDEPENDENT_CODE ON\n             LINK_FLAGS "-Wl,-z,max-page-size=16384")\n',
  ],
]);

patch('src/main/java/ai/onnxruntime/reactnative/OnnxruntimeModule.java', [
  // Bridgeless mode has no CatalystInstance; the context exposes the call invoker directly.
  [
    '(CallInvokerHolderImpl) getReactApplicationContext().getCatalystInstance().getJSCallInvokerHolder();',
    '(CallInvokerHolderImpl) getReactApplicationContext().getJSCallInvokerHolder();',
  ],
]);
