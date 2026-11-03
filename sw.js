/* 离线缓存：第二次打开基本秒开 */
const VER = 'xz-v20261104d';
const SHELL = [
  './', './index.html', './css/app.css',
  './js/zip.js', './js/store.js', './js/bank.js', './js/card.js',
  './js/mapview.js', './js/session.js', './js/views.js', './js/app.js',
  './data/meta.js'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(VER).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () { }); }));
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VER; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // 页面导航：先走网络，断了用缓存
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(function () { return caches.match('./index.html'); })
    );
    return;
  }

  // 题库数据：优先网络（避免缓存里是坏文件导致一直载入），失败再用缓存
  if (url.pathname.indexOf('/data/') >= 0) {
    e.respondWith(fetch(req).catch(function () { return caches.match(req); }));
    return;
  }

  // 静态资源：先给缓存，同时后台更新（stale-while-revalidate）
  e.respondWith(caches.open(VER).then(function (cache) {
    return cache.match(req).then(function (hit) {
      const net = fetch(req).then(function (res) {
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});
