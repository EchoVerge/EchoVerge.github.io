const CACHE_NAME = 'teacher-salary-v1.1';
// 這裡列出所有需要快取的檔案
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './assets/css/style.css',
    './assets/js/main.js',
    './assets/js/modules/backup.js',
    './assets/js/modules/batch.js',
    './assets/js/modules/calendar.js',
    './assets/js/modules/charts.js',
    './assets/js/modules/cloud.js',
    './assets/js/modules/db.js',
    './assets/js/modules/drag_drop.js',
    './assets/js/modules/record.js',
    './assets/js/modules/search.js',
    './assets/js/modules/semester.js',
    './assets/js/modules/settings.js',
    './assets/js/modules/state.js',
    './assets/js/modules/stats.js',
    './assets/js/modules/ui.js', // 如果有的話
    './assets/js/modules/utils.js',
    // 外部 CDN 也可以快取 (選用)
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://unpkg.com/dexie/dist/dexie.js'
];

// 安裝 Service Worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
});

// 攔截網路請求
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // 如果快取有，直接回傳快取 (離線可用)
                if (response) {
                    return response;
                }
                // 如果快取沒有，去網路抓
                return fetch(event.request);
            })
    );
});

// 更新時清除舊快取
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
});