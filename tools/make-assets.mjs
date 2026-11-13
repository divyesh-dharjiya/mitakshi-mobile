// Draws the Mitakshi mark and writes every icon and the home-screen demo images: node tools/make-assets.mjs
//
// The mark is a solid M with an eye (an iris) above its notch: "Mitakshi" means "of the beautiful eyes". White
// on a navy tile, with a sky-blue iris. Colours are the ones in src/theme.ts. The same geometry is in src/components/brand/Logo.tsx
// and in the web app (Image Enhancement/src/components/brand/Logo.tsx): change all three together.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const out = fileURLToPath(new URL('../assets/', import.meta.url));
const pub = fileURLToPath(new URL('../public/', import.meta.url));
mkdirSync(out, { recursive: true });

const T = { a1: '#2563d6', a2: '#0a2358', sky: '#5cc4ff' };
const M_PATH = 'M100 400V150Q100 116 132 130L256 232L380 130Q412 116 412 150V400H340V268L256 338L172 268V400Z';
const defs = `
  <linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${T.a1}"/><stop offset="1" stop-color="${T.a2}"/></linearGradient>
  <linearGradient id="hi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.7" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dbe9ff"/></linearGradient>`;

/** The M with its iris, white. */
const mark = `<g transform="translate(0 6)"><path d="${M_PATH}" fill="url(#m)"/>
  <circle cx="256" cy="136" r="34" fill="#fff"/><circle cx="256" cy="136" r="16" fill="${T.sky}"/><circle cx="263" cy="129" r="5.5" fill="#fff"/></g>`;
/** Single-colour silhouette for Android's themed icons: the M and a ring for the iris (the pupil is a hole). */
const mono = `<g transform="translate(0 6)"><path d="${M_PATH}" fill="#fff"/>
  <path fill-rule="evenodd" fill="#fff" d="M256 102a34 34 0 1 0 0 68a34 34 0 1 0 0-68ZM256 120a16 16 0 1 1 0 32a16 16 0 1 1 0-32Z"/></g>`;

const svg = (size, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512"><defs>${defs}</defs>${body}</svg>`);
const ground = `<rect width="512" height="512" fill="url(#s)"/><rect width="512" height="512" fill="url(#hi)"/>`;
const tile = `<rect width="512" height="512" rx="116" fill="url(#s)"/><rect width="512" height="512" rx="116" fill="url(#hi)"/>`;
/** The mark centred in the square canvas at \`k\` of its width. */
const placed = (k, body) => `<g transform="translate(${(512 - 512 * k) / 2} ${(512 - 512 * k) / 2}) scale(${k})">${body}</g>`;
const png = (name, buf, size) => sharp(buf).resize(size, size).png().toFile(out + name);

await png('icon.png', svg(1024, ground + placed(1.04, mark)), 1024);
await png('android-icon-foreground.png', svg(1024, placed(0.76, mark)), 1024);
await png('android-icon-background.png', svg(1024, ground), 1024);
await png('android-icon-monochrome.png', svg(1024, placed(0.76, mono)), 1024);
// The system splash shows the whole icon (rounded) on the app's light background.
await png('splash-icon.png', svg(512, tile + placed(1.04, mark)), 512);
await png('favicon.png', svg(96, tile + placed(1.04, mark)), 96);
writeFileSync(pub + 'icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>${defs}</defs>${tile}${placed(1.04, mark)}</svg>`);

// ── Home-screen demo: one illustrated night scene, soft and noisy on one side, crisp on the other ──────────────────────
const W = 900, H = 1050;
const scene = () => {
  // Deterministic stars so the sharp and the soft copy match exactly.
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const stars = Array.from({ length: 70 }, () => {
    const x = Math.round(rnd() * W), y = Math.round(rnd() * 430), r = (0.8 + rnd() * 1.7).toFixed(1), o = (0.35 + rnd() * 0.6).toFixed(2);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" fill-opacity="${o}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#040a1c"/><stop offset="0.34" stop-color="#0c2257"/><stop offset="0.6" stop-color="#1f5cb3"/><stop offset="0.8" stop-color="#6fb7f0"/><stop offset="1" stop-color="#cfeaff"/></linearGradient>
    <radialGradient id="moon" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fffdf2" stop-opacity="0.95"/><stop offset="0.3" stop-color="#e8f2ff" stop-opacity="0.55"/><stop offset="1" stop-color="#7fc3ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="m1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5f9be6"/><stop offset="1" stop-color="#1d3f96"/></linearGradient>
    <linearGradient id="m2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f66c6"/><stop offset="1" stop-color="#12306f"/></linearGradient>
    <linearGradient id="m3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#17408f"/><stop offset="1" stop-color="#071a47"/></linearGradient>
    <linearGradient id="lake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ec8ff"/><stop offset="1" stop-color="#0d2a68"/></linearGradient>
    <linearGradient id="aur" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4cb8ff" stop-opacity="0"/><stop offset="0.5" stop-color="#7c8cff" stop-opacity="0.38"/><stop offset="1" stop-color="#4cb8ff" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${stars}
  <path d="M-40 330 Q220 190 460 300 T940 230 V330 Q700 270 470 380 T-40 420Z" fill="url(#aur)"/>
  <circle cx="640" cy="360" r="260" fill="url(#moon)"/><circle cx="640" cy="360" r="74" fill="#fbfdff"/>
  <circle cx="618" cy="340" r="14" fill="#dbe9fb"/><circle cx="668" cy="388" r="9" fill="#dbe9fb"/><circle cx="650" cy="332" r="6" fill="#e6f0fc"/>
  <path d="M0 560 L120 430 L220 500 L360 350 L480 480 L560 430 L700 520 L820 390 L900 470 V700 H0Z" fill="url(#m1)"/>
  <path d="M120 430 L220 500 M360 350 L480 480 M700 520 L820 390" stroke="#cfe6ff" stroke-opacity="0.55" stroke-width="2" fill="none"/>
  <path d="M0 620 L110 520 L250 600 L400 470 L540 600 L700 500 L820 610 L900 560 V760 H0Z" fill="url(#m2)"/>
  <path d="M0 700 L140 620 L300 700 L470 610 L640 700 L800 630 L900 690 V800 H0Z" fill="url(#m3)"/>
  <rect y="690" width="${W}" height="${H - 690}" fill="url(#lake)" opacity="0.94"/>
  <path d="M0 690 H${W}" stroke="#d8eeff" stroke-opacity="0.6" stroke-width="2"/>
  <g stroke="#e8f6ff" stroke-linecap="round" stroke-opacity="0.65"><path d="M540 730h200M575 756h130M600 782h80M555 808h170M590 834h100" stroke-width="6"/></g>
  <path d="M0 850 L110 800 L250 850 L430 790 L620 855 L800 800 L900 845 V1050 H0Z" fill="#050f2c"/>
  ${[[160, 190, 8], [225, 150, 7], [305, 215, 6]].map(([x, y, r]) => `<path d="M${x - r * 2} ${y}q${r} -${r} ${r * 2} 0q${r} -${r} ${r * 2} 0" stroke="#e8f0ff" stroke-opacity="0.8" stroke-width="3.4" fill="none" stroke-linecap="round"/>`).join('')}
</svg>`;
};
const noise = (w, h) => {
  const px = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { const v = 128 + (Math.random() - 0.5) * 90; px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v; px[i * 4 + 3] = 70; }
  return sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
};
const crisp = await sharp(Buffer.from(scene())).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
const soft = await sharp(Buffer.from(scene()))
  .resize(Math.round(W / 9), Math.round(H / 9)).blur(0.8).resize(W, H, { kernel: 'cubic' }).blur(3)
  .modulate({ brightness: 0.92, saturation: 0.75 })
  .composite([{ input: await noise(W, H), blend: 'overlay' }])
  .jpeg({ quality: 32, mozjpeg: true }).toBuffer();
writeFileSync(out + 'demo-sharp.jpg', crisp);
writeFileSync(out + 'demo-soft.jpg', soft);
console.log('assets written to', out);
