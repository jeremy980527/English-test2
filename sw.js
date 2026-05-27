const CACHE_NAME = 'silenvocab-v4';

// 定義需要快取的核心檔案
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './auth.js',
  './SILENVOCAB.png'
];

// 安裝 Service Worker 並快取資源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 [PWA] 快取核心檔案中...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 啟動並清除舊版本快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🧹 [PWA] 清除舊版快取:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 攔截請求：網路優先，失敗則讀取快取
self.addEventListener('fetch', (event) => {
  // 排除非 GET 請求或跨域外部 API (例如 Firebase) 的攔截
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
      return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 如果有網路且成功抓到新檔案，順便更新快取
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // 斷網時，從快取拿檔案，實現離線秒開！
        return caches.match(event.request);
      })
  );
});

