/* PlungeTX offline shell. Network first for the app, cache first for fonts and audio.
   Paths are relative to this file, so the same worker is valid at /app/ and at /plungetx-app/.
   Install caches the shell and the sauna music. The page then warms the selected voice.
   Other voices are stored the first time they are fetched. Activate drops older caches. */
const CACHE = 'plungetx-app-v5';
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/audio.js',
  'js/voice.js',
  'js/cues.js',
  'js/store.js',
  'js/clip-ids.js',
  'manifest.webmanifest',
  'icon-180.png',
  'icon-192.png',
  'icon-512.png',
  'fonts/inter.woff2',
  'fonts/sora.woff2',
  'audio/manifest.json',
  'audio/music/first-light.mp3',
  'audio/music/soft-rain.mp3',
  'audio/music/stillness.mp3'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

async function warm(urls) {
  const cache = await caches.open(CACHE);
  const queue = urls.slice();
  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      if (await cache.match(url)) continue;
      try {
        const res = await fetch(url);
        if (res && res.status === 200) await cache.put(url, res);
      } catch (e) { /* a missed clip retries the next time the app is online */ }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'warm' && Array.isArray(data.urls)) {
    event.waitUntil(warm(data.urls).then(() => {
      if (event.source) event.source.postMessage({ type: 'warm-done' });
    }));
  }
});

async function rangeResponse(request) {
  const cache = await caches.open(CACHE);
  let full = await cache.match(request.url);
  if (!full) {
    const net = await fetch(request.url);
    if (net && net.status === 200) {
      await cache.put(request.url, net.clone());
      full = net;
    } else {
      return net;
    }
  }
  const match = /bytes=(\d+)-(\d+)?/.exec(request.headers.get('range') || '');
  if (!match) return full;
  const buf = await full.arrayBuffer();
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : buf.byteLength - 1;
  const safeEnd = Math.min(end, buf.byteLength - 1);
  if (start > safeEnd) return new Response(null, { status: 416 });
  const slice = buf.slice(start, safeEnd + 1);
  const headers = new Headers(full.headers);
  headers.set('Content-Type', full.headers.get('Content-Type') || 'audio/mpeg');
  headers.set('Content-Range', `bytes ${start}-${safeEnd}/${buf.byteLength}`);
  headers.set('Content-Length', String(slice.byteLength));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(slice, { status: 206, statusText: 'Partial Content', headers });
}

function cacheable(response) {
  return response && response.status === 200 && (response.type === 'basic' || response.type === 'default');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const heavy = path.includes('/audio/') || path.includes('/fonts/');

  if (req.headers.get('range')) {
    event.respondWith(rangeResponse(req));
    return;
  }

  if (heavy) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (cacheable(res)) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (cacheable(res)) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (e) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = await caches.match(new URL('index.html', self.location).href);
        if (shell) return shell;
      }
      return new Response('', { status: 503, statusText: 'Offline' });
    }
  })());
});
