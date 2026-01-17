/**
 * Service Worker for Customize Worksheet
 * Version: 7.2.0
 * Last Updated: 2026-01-17 (Feature Update)
 * * [Changelog V7.1.1] 2026-01-16
 * - Added: assets/js/modules/debugUtils.js (模擬試卷生成器)
 * - Added: assets/css/toast.css (通知樣式表)
 * - Updated: gradingController.js (本地閱卷流程優化、Loading 提示)
 * - Updated: localParser.js (OpenCV 辨識核心升級)
 * - Updated: onboarding.js (新版教學導覽)
 * - Updated: toast.js (沙漏動畫與持續顯示支援)
 * - Removed: AI Grading dependency (aiParser.js cleaned)
 * * [Changelog V7.2.0] 2026-01-17
 * - Updated: localParser.js (OpenCV 掃描檔案錯誤修正)
 * - Updated: gradingController.js (新增得分計算功能)
 * - Updated: textParser.js (新增剖析單題配分功能)
 * - Updated: editorController.js (新增編輯單題分數)
 * - Updated: index.html (新增分數顯示窗格)
 * - Updated: scoreCalculator.js (匯出excel功能支援導入配分)
 * - Updated: wordExporter.js (匯出word功能引入配分)
 * - Updated: viewRenderer.js (學生卷增加配分顯示)
 */

const CACHE_NAME = 'worksheet-assistant-v7.2.0';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    
    // CSS
    './assets/css/style.css',
    './assets/css/worksheetStyle.css',
    './assets/css/historyItem.css',
    './assets/css/toast.css', // [New]
    
    // Images
    './assets/img/icon.svg',
    './assets/img/icon-192.png',
    './assets/img/icon-512.png',

    // Main Entry
    './assets/js/main.js',

    // Modules
    './assets/js/modules/state.js',
    './assets/js/modules/stepManager.js',
    './assets/js/modules/editorController.js',
    './assets/js/modules/textParser.js',
    './assets/js/modules/viewRenderer.js',
    './assets/js/modules/columnManager.js',
    './assets/js/modules/outputController.js',
    './assets/js/modules/wordExporter.js',
    './assets/js/modules/settingsController.js',
    './assets/js/modules/aiParser.js',
    './assets/js/modules/fileHandler.js',
    './assets/js/modules/fileExtractor.js',
    './assets/js/modules/historyManager.js',
    './assets/js/modules/db.js',
    './assets/js/modules/toast.js',
    './assets/js/modules/usageMonitor.js',
    './assets/js/modules/onboarding.js',
    './assets/js/modules/cloudManager.js',
    './assets/js/modules/templateManager.js',
    './assets/js/modules/gradingController.js',
    './assets/js/modules/answerSheetRenderer.js',
    './assets/js/modules/localParser.js',
    './assets/js/modules/scoreCalculator.js',
    './assets/js/modules/jsonBackupManager.js',
    './assets/js/modules/debugUtils.js' // [New]
];

// Install Event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caching all assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate Event (Cleanup old caches)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    // 排除 API 請求與 Google Analytics 等外部資源
    if (event.request.url.includes('google') || event.request.url.includes('api')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache Hit
                if (response) {
                    return response;
                }
                
                // Network Fetch
                return fetch(event.request).then(
                    (networkResponse) => {
                        // Check if valid response
                        if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                            return networkResponse;
                        }

                        // Clone and Cache new files
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });

                        return networkResponse;
                    }
                );
            })
    );
});