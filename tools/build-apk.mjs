// Builds a standalone release APK (JS bundled in) into ./Mitakshi.apk, or with --aab the Google Play
// bundle ./Mitakshi.aab. Both are signed with the upload key from `npm run upload-key` when it is set
// up (plugins/withReleaseSigning.js); APKs fall back to the debug key, AABs refuse to build without it.
//
// The build runs in a mirror of the project at a short path without spaces (default ~/mkb, or
// MITAKSHI_BUILD_DIR): Android's native builds (CMake / ninja) break on Windows paths with
// spaces or long names, and gigabytes of build output should not land in a synced folder.
// Uses JAVA_HOME / ANDROID_HOME when set, otherwise the per-user installs under %LOCALAPPDATA%.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const win = process.platform === 'win32';
const clean = process.argv.includes('--clean');
const aab = process.argv.includes('--aab');
// Phones are arm64-v8a. Pass --abi x86_64 for a copy that runs on the Android emulator on a PC. The
// Play bundle also carries x86_64 (Chromebooks, emulators); Play sends each device only its own ABI.
const abi = process.argv.includes('--abi') ? process.argv[process.argv.indexOf('--abi') + 1] : aab ? 'arm64-v8a,x86_64' : 'arm64-v8a';

const gradleProps = join(process.env.GRADLE_USER_HOME ?? join(homedir(), '.gradle'), 'gradle.properties');
const hasUploadKey = existsSync(gradleProps) && readFileSync(gradleProps, 'utf8').includes('MITAKSHI_UPLOAD_STORE_FILE');
if (aab && !hasUploadKey) {
  console.error('Google Play needs the app signed with your own upload key. Run `npm run upload-key` once, then `npm run aab` again.');
  process.exit(1);
}
if (!hasUploadKey) console.warn('No upload key set up (`npm run upload-key`): the APK is signed with the debug key.');
// Short on purpose: Windows caps paths at 260 characters (long paths need admin rights to enable),
// and the native build appends long node_modules paths to the root.
const root = process.env.MITAKSHI_BUILD_DIR ?? (win ? 'C:\\m' : join(homedir(), 'mkb'));

const env = { ...process.env };
if (win) {
  const local = process.env.LOCALAPPDATA;
  env.JAVA_HOME ??= join(local, 'Programs', 'jdk17');
  env.ANDROID_HOME ??= join(local, 'Android', 'Sdk');
  env.PATH = `${join(env.JAVA_HOME, 'bin')};${join(env.ANDROID_HOME, 'platform-tools')};${env.PATH}`;
}
env.NODE_ENV = 'production';
env.EXPO_NO_TELEMETRY = '1';

function run(cmd, args, cwd, ok = (code) => code === 0) {
  console.log(`\n> ${cmd} ${args.join(' ')}   (in ${cwd})`);
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: win });
  if (!ok(r.status ?? 1)) process.exit(r.status ?? 1);
}

// 1. Mirror the project (sources, node_modules, models); keep the mirror's own android/ build cache.
mkdirSync(root, { recursive: true });
const skipDirs = ['android', 'ios', 'dist', '.expo', 'web-build', 'model-cdn', 'model-upload'];
if (win) {
  // robocopy exit codes below 8 mean success.
  run('robocopy', [`"${project}"`, `"${root}"`, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS', '/NP', '/MT:16', '/XD', ...skipDirs.map((d) => `"${join(project, d)}"`), `"${join(root, 'android')}"`, '/XF', 'Mitakshi*.apk', 'Mitakshi.aab'], project, (c) => c < 8);
} else {
  run('rsync', ['-a', '--delete', ...skipDirs.flatMap((d) => ['--exclude', `/${d}`]), '--exclude', '/Mitakshi*.apk', '--exclude', '/Mitakshi.aab', `${project}/`, `${root}/`], project);
}

// 2. Generate the native project and build.
const android = join(root, 'android');
run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install', ...(clean ? ['--clean'] : [])], root);
// Gradle's native build cache sits under android/app/.cxx by default. Windows can't create folders
// past 248 characters, so the cache moves to a short folder (C:\s) that is outside the project.
if (win) {
  const gradle = join(android, 'app', 'build.gradle');
  const stagingLine = 'android { externalNativeBuild { cmake { buildStagingDirectory "C:/s" } } }';
  const src = readFileSync(gradle, 'utf8');
  if (!src.includes(stagingLine)) writeFileSync(gradle, `${src}\n${stagingLine}\n`);
}
// onnxruntime-react-native unpacks the ONNX Runtime aar it builds against into its own build folder and
// links whichever copy it finds there. Copies of other versions left from earlier builds (see
// plugins/withOrtVersion.js) would win and bring the old, bigger runtime back, so only the pinned one stays.
const ortBuild = join(root, 'node_modules', 'onnxruntime-react-native', 'android', 'build');
if (existsSync(ortBuild)) for (const d of readdirSync(ortBuild)) if (/^onnxruntime-android.*.aar$/.test(d) && !d.includes('-1.22.0.')) rmSync(join(ortBuild, d), { recursive: true, force: true });
writeFileSync(join(android, 'local.properties'), `sdk.dir=${env.ANDROID_HOME.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}\n`);
run(join(android, win ? 'gradlew.bat' : 'gradlew'), [aab ? 'bundleRelease' : 'assembleRelease', `-PreactNativeArchitectures=${abi}`], android);

const outputs = join(android, 'app', 'build', 'outputs');
const built = aab ? join(outputs, 'bundle', 'release', 'app-release.aab') : join(outputs, 'apk', 'release', 'app-release.apk');
const out = aab ? join(project, 'Mitakshi.aab') : join(project, abi === 'arm64-v8a' ? 'Mitakshi.apk' : `Mitakshi-${abi.replace(/,/g, '+')}.apk`);
copyFileSync(built, out);
console.log(`\n${aab ? 'Play Store bundle' : 'APK'} ready: ${out}`);
