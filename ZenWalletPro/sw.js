const CACHE_NAME = 'zenwallet-pro-v1';

// 要快取的資源列表
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './js/config.js',
    './js/constants.js',
    './js/budgetController.js',
    './js/dashboardController.js',
    './js/portfolioController.js',
    './js/settingsController.js',
    './js/transactionController.js',
    './js/utils/helpers.js',
    './js/utils/ui.js',
    './js/services/account.js',
    './js/services/auth.js',
    './js/services/budgetService.js',
    './js/services/category.js',
    './js/services/dataInitializer.js',
    './js/services/dataManager.js',
    './js/services/history.js',
    './js/services/portfolio.js',
    './js/services/recurring.js',
    './js/services/report.js',
    './js/services/repository.js',
    './js/services/stockService.js',
    './js/services/tag.js',
    './js/services/template.js',
    './js/services/transaction.js',
    './js/services/storage/localDB.js',
    './js/services/storage/cloudDB.js',
    './components/navbar.html',
    './components/tab-dashboard.html',
    './components/tab-portfolio.html',
    './components/tab-settings.html',
    './components/modals.html',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/gridstack@10.0.1/dist/gridstack.min.css',
    'https://cdn.jsdelivr.net/npm/gridstack@10.0.1/dist/gridstack-all.js',
    'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js',
    'https://cdn.jsdelivr.net/npm/idb@8/build/umd.js',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js'
];

// 安裝 Service Worker 並快取資源
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caching all assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
});

// 啟用 Service Worker 並清除舊快取
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[Service Worker] Removing old cache', key);
                    return caches.delete(key);
                }
            }));
        })
    );
});

// 攔截網路請求：有快取就用快取，沒快取就上網抓
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // 如果快取中有，直接回傳
                if (response) {
                    return response;
                }
                // 否則發送網路請求
                return fetch(event.request);
            })
    );
});