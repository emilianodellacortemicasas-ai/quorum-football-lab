// QUORUM service worker · v2
// Pages always come from the network (never from a cache), so the app installed on the phone is always the latest
// version. No private pages, financial records or authenticated API responses are cached.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const r = event.request;
  if (r.mode !== 'navigate') return;
  event.respondWith(fetch(r, { cache: 'no-store' }).catch(() => fetch(r)));
});
