// 離線快取：網頁本體先上網抓最新版，抓不到才用快取；
// 程式檔、FFmpeg、人臉偵測模型、網路色卡與貼圖下載一次後就存著重複使用。
// 只快取「下載」的東西，從不上傳任何資料。
const CACHE = 'kang-app-v1';
const CDN_HOSTS = ['cdn.jsdelivr.net'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match(self.registration.scope))),
    );
    return;
  }

  const cacheable = CDN_HOSTS.includes(url.hostname)
    || (sameOrigin && /\/(assets|vendor|models|icons)\//.test(url.pathname));
  if (!cacheable) return;

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    }),
  );
});
