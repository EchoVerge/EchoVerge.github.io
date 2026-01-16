/**
 * customize_worksheet/sw.js
 * Service Worker for PWA capabilities
 * V6.4.0: new proofread interface
 */
const CACHE_NAME = 'worksheet-assistant-v6.4.0'; 
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/style.css',
  './assets/css/worksheetStyle.css',
  './assets/css/historyItem.css',
  './assets/css/toast.css', 
  './assets/js/main.js',
  './assets/js/modules/aiParser.js',
  './assets/js/modules/answerSheetRenderer.js',
  './assets/js/modules/cloudManager.js',
  './assets/js/modules/columnManager.js',
  './assets/js/modules/db.js', 
  './assets/js/modules/editorController.js',
  './assets/js/modules/fileExtractor.js',
  './assets/js/modules/fileHandler.js',
  './assets/js/modules/gradingController.js',
  './assets/js/modules/historyManager.js',
  './assets/js/modules/localParser.js',
  './assets/js/modules/outputController.js',
  './assets/js/modules/scoreCalculator.js', 
  './assets/js/modules/settingsController.js',
  './assets/js/modules/state.js',
  './assets/js/modules/textParser.js',
  './assets/js/modules/usageMonitor.js',
  './assets/js/modules/viewRenderer.js',
  './assets/js/modules/toast.js', 
  './assets/imgs/icon.svg',
  'https://unpkg.com/dexie/dist/dexie.js' 
];

// 安裝 Service Worker 並快取檔案
self.addEventListener('install', (event) => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache ' + CACHE_NAME);
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
});

// 攔截請求並回傳快取
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // 如果快取有，就回傳快取；否則去網路抓
        return response || fetch(event.request).catch((err) => {
            console.error('Fetch failed for:', event.request.url, err);
            return caches.match('./offline.html'); 
        });
      })
  );
});

// 更新時清除舊快取
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); 
});