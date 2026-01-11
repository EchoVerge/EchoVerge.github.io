/**
 * customize_worksheet/sw.js
 * Service Worker for PWA capabilities
 * V2: Added Dexie.js to cache and bumped version to force refresh
 */
const CACHE_NAME = 'worksheet-assistant-v2'; // [修改] 改為 v2 強制更新
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './assets/css/style.css',
  './assets/css/worksheetStyle.css',
  './assets/css/historyItem.css',
  './assets/js/main.js',
  './assets/js/modules/aiParser.js',
  './assets/js/modules/answerSheetRenderer.js',
  './assets/js/modules/cloudManager.js',
  './assets/js/modules/columnManager.js',
  './assets/js/modules/db.js', // [新增]
  './assets/js/modules/editorController.js',
  './assets/js/modules/fileExtractor.js',
  './assets/js/modules/fileHandler.js',
  './assets/js/modules/gradingController.js',
  './assets/js/modules/historyManager.js',
  './assets/js/modules/outputController.js',
  './assets/js/modules/settingsController.js',
  './assets/js/modules/state.js',
  './assets/js/modules/textParser.js',
  './assets/js/modules/usageMonitor.js',
  './assets/js/modules/viewRenderer.js',
  './assets/imgs/icon.svg',
  'https://unpkg.com/dexie/dist/dexie.js' // [關鍵新增] 快取外部函式庫
];

// 安裝 Service Worker 並快取檔案
self.addEventListener('install', (event) => {
  self.skipWaiting(); // [新增] 讓新版 SW 立即接手
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache v2');
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
});

// 攔截請求並回傳快取
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request);
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
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // [新增] 立即控制所有頁面
});