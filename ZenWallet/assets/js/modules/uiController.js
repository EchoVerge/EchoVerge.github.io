/**
 * assets/js/modules/uiController.js
 * 負責處理介面互動、圖表與響應式組件
 */
import { state } from './state.js';
import { dbManager } from './dbManager.js';

export const uiController = {
    charts: { pie: null, trend: null },

    init() {
        this.initEventListeners();
        this.initWidgets();
    },

    // 1. 初始化頁面事件
    initEventListeners() {
        // 監聽權限變更，更新全站 UI
        window.addEventListener('auth-status-changed', (e) => {
            this.updatePremiumUI(state.isPro);
        });
    },

    // 2. 初始化 Split.js 與 SortableJS (參考原本 Wallet.json 邏輯)
    initWidgets() {
        // 分隔欄功能
        if (typeof Split !== 'undefined') {
            Split(['#dashboard-col-left', '#dashboard-col-right'], {
                sizes: [42, 58],
                minSize: 320,
                gutterSize: 10,
            });
        }

        // 拖拽佈局功能
        const leftCol = document.getElementById('dashboard-col-left');
        const rightCol = document.getElementById('dashboard-col-right');
        if (leftCol && rightCol && typeof Sortable !== 'undefined') {
            const sortOptions = {
                group: 'dashboard-modules',
                animation: 150,
                handle: '.drag-handle',
                onEnd: () => this.saveLayout()
            };
            Sortable.create(leftCol, sortOptions);
            Sortable.create(rightCol, sortOptions);
        }
    },

    // 3. 繪製支出圓餅圖 (重構原本 drawCategoryPieChart 邏輯)
    renderCategoryChart(transactions) {
        const ctx = document.getElementById('categoryPieChart')?.getContext('2d');
        if (!ctx) return;

        if (this.charts.pie) this.charts.pie.destroy();

        // 統計邏輯：排除 #不納入統計 標籤
        const dataMap = {};
        transactions.forEach(tx => {
            if (tx.tags?.includes('#不納入統計') || tx.type !== '支出') return;
            dataMap[tx.category] = (dataMap[tx.category] || 0) + tx.amount;
        });

        this.charts.pie = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: Object.keys(dataMap),
                datasets: [{
                    data: Object.values(dataMap),
                    backgroundColor: ['#ff6384', '#36a2eb', '#ffce56', '#4bc1c2', '#9966ff']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    },

    // 4. 更新權限介面 (EchoVerge 專用)
    updatePremiumUI(isPro) {
        const proBadge = document.getElementById('pro-status-badge');
        const cloudBtn = document.getElementById('btn-cloud-sync');

        if (proBadge) {
            proBadge.innerHTML = isPro ? '💎 專業版 (全站通吃)' : '免費版';
            proBadge.style.color = isPro ? '#2e7d32' : '#666';
        }

        // 若非專業版，禁用雲端備份按鈕 (參考 cloudManager.js 邏輯)
        if (cloudBtn) {
            cloudBtn.disabled = !isPro;
            cloudBtn.title = isPro ? "雲端備份" : "專業版專屬功能";
        }
    },

    // 保存佈局 (若為 Pro 則存至雲端，否則存至 LocalStorage)
    saveLayout() {
        const layout = {
            left: Array.from(document.querySelectorAll('#dashboard-col-left .dashboard-module')).map(el => el.id),
            right: Array.from(document.querySelectorAll('#dashboard-col-right .dashboard-module')).map(el => el.id)
        };
        
        if (state.isPro && state.currentUser) {
            // 專業版功能：佈局雲端同步
            dbManager.db.collection('users').doc(state.currentUser.uid).update({ layout });
        } else {
            localStorage.setItem('zenwallet_layout', JSON.stringify(layout));
        }
    }
};