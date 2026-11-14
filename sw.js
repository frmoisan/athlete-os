// Athlete OS service worker: makes the app open with no signal.
// index.html, program.json, manifest: network first, so a new deploy shows up as
// soon as you are online; cached copy when the network is down or too slow.
// fonts/ and icons/: cached copy first (they never change).
// Bump VERSION only if you change this file's logic or replace a font/icon.
const VERSION = 'athlete-os-v1';
const SHELL = [
  './', 'index.html', 'program.json', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png',
  'fonts/chakra-petch-latin-400-normal.woff2',
  'fonts/chakra-petch-latin-600-normal.woff2',
  'fonts/chakra-petch-latin-700-normal.woff2',
  'fonts/jetbrains-mono-latin-wght-normal.woff2'
];
const NETWORK_TIMEOUT_MS = 3500;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => Promise.all(SHELL.map(u => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

// Cache key without the query string, so program.json?v=123 hits the same entry.
function keyFor(request) {
  const url = new URL(request.url);
  return url.origin + url.pathname;
}

async function networkFirst(request) {
  const key = keyFor(request);
  const cache = await caches.open(VERSION);
  const live = fetch(request).then(res => {
    if (res && res.ok) cache.put(key, res.clone());
    return res;
  });
  try {
    return await Promise.race([live, timeout(NETWORK_TIMEOUT_MS)]);
  } catch (err) {
    live.catch(() => {});                          // already handled; avoid an unhandled rejection
    const hit = await cache.match(key) ||
      (request.mode === 'navigate' ? await cache.match(new URL('./', self.registration.scope).href) : null);
    if (hit) return hit;
    return live;                                   // nothing cached yet: wait for the network
  }
}

async function cacheFirst(request) {
  const key = keyFor(request);
  const cache = await caches.open(VERSION);
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok) cache.put(key, res.clone());
  return res;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (/\/(fonts|icons)\//.test(url.pathname)) event.respondWith(cacheFirst(request));
  else event.respondWith(networkFirst(request));
});
