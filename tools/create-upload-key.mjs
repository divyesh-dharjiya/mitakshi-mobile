// Creates the Google Play upload key once: ~/.mitakshi/mitakshi-upload.jks, plus the four
// MITAKSHI_UPLOAD_* entries in ~/.gradle/gradle.properties that plugins/withReleaseSigning.js reads.
// Both live outside the project (and OneDrive), so the key and its password never get shared with
// the code. Back up the .jks file and the password: Play only accepts updates signed with this key
// (if it is lost, the upload key can be reset from the Play Console, which takes a few days).
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const dir = join(homedir(), '.mitakshi');
const store = join(dir, 'mitakshi-upload.jks');
const alias = 'mitakshi-upload';
const gradleProps = join(process.env.GRADLE_USER_HOME ?? join(homedir(), '.gradle'), 'gradle.properties');
const keytool = join(process.env.JAVA_HOME ?? join(process.env.LOCALAPPDATA ?? '', 'Programs', 'jdk17'), 'bin', 'keytool');

if (existsSync(store)) {
  console.error(`An upload key already exists at ${store}. Delete it first only if it was never used on Google Play.`);
  process.exit(1);
}
if (existsSync(gradleProps) && readFileSync(gradleProps, 'utf8').includes('MITAKSHI_UPLOAD_STORE_FILE')) {
  console.error(`${gradleProps} already points at an upload key; remove the MITAKSHI_UPLOAD_* lines first.`);
  process.exit(1);
}

/** Reads one line; hidden input prints nothing while typing. */
function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => { if (s.startsWith(question)) process.stdout.write(question); };
    rl.question(question, (answer) => {
      if (hidden) process.stdout.write('\n');
      rl.close();
      resolve(answer.trim());
    });
  });
}

const owner = (await ask('Your name or company (shown inside the key certificate): ')) || 'Mitakshi';
const password = await ask('New key password (at least 8 characters): ', true);
if (password.length < 8) { console.error('The password must have at least 8 characters.'); process.exit(1); }
if ((await ask('Type the password again: ', true)) !== password) { console.error('The passwords do not match.'); process.exit(1); }
if (/[\\\r\n]/.test(password)) { console.error('Use a password without backslashes.'); process.exit(1); }

mkdirSync(dir, { recursive: true });
const r = spawnSync(keytool, [
  '-genkeypair', '-storetype', 'PKCS12', '-keystore', store, '-alias', alias,
  '-keyalg', 'RSA', '-keysize', '4096', '-validity', '10000',
  '-dname', `CN=${owner.replace(/[,=+<>#;"\\]/g, ' ')}`,
  '-storepass:env', 'MITAKSHI_KEY_PASSWORD', '-keypass:env', 'MITAKSHI_KEY_PASSWORD',
], { stdio: 'inherit', env: { ...process.env, MITAKSHI_KEY_PASSWORD: password } });
if (r.status !== 0) { console.error('keytool failed; no key was created.'); process.exit(r.status ?? 1); }

// Gradle properties use backslash escapes, and Windows paths need forward slashes there.
mkdirSync(join(gradleProps, '..'), { recursive: true });
appendFileSync(gradleProps, [
  '',
  '# Mitakshi Google Play upload key (tools/create-upload-key.mjs)',
  `MITAKSHI_UPLOAD_STORE_FILE=${store.replace(/\\/g, '/')}`,
  `MITAKSHI_UPLOAD_KEY_ALIAS=${alias}`,
  `MITAKSHI_UPLOAD_STORE_PASSWORD=${password}`,
  `MITAKSHI_UPLOAD_KEY_PASSWORD=${password}`,
  '',
].join('\n'));

console.log(`\nUpload key created: ${store}`);
console.log(`Signing settings added to: ${gradleProps}`);
console.log('Back up the key file and its password somewhere safe (not only on this PC). Next: npm run aab');
