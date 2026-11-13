// Offline support: caches the app shell, hashed Expo build assets (/_expo, /assets), the ONNX Runtime engine and the
// small self-hosted models. Large AI engines are stored once in OPFS by the app (lib/ai/models.ts),
// so they are deliberately not duplicated here.
// Bump VERSION when files in /ort or /models change (they are not content-hashed).
const VERSION = 'mitakshi-rn-shell-v1';
const LARGE = 20 * 1024 * 1024;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon.svg'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const cacheFirst = async (req) => {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  const size = Number(res.headers.get('content-length')) || 0;
  if (res.ok && size < LARGE) cache.put(req, res.clone()).catch(() => {});
  return res;
};

const networkFirst = async (req) => {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch {
    return (await cache.match(req)) ?? (await cache.match('/'));
  }
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') return e.respondWith(networkFirst(req));
  if (url.origin !== location.origin) return;
  // The AI worker is not content-hashed, so prefer the network to pick up new builds.
  if (url.pathname === '/ai-worker.js') return e.respondWith(networkFirst(req));
  if (/^\/(_expo|assets|models|ort)\//.test(url.pathname)) e.respondWith(cacheFirst(req));
});
