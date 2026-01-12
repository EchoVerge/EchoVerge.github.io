/**
 * assets/js/modules/uiController.js
 */
import { state } from './state.js';
import { dbManager } from './dbManager.js';

export const uiController = {
    charts: { pie: null, trend: null },

    init() {
        this.initEventListeners();
        this.initWidgets();
    },

    initEventListeners() {
        window.addEventListener('auth-status-changed', (e) => {
            this.updatePremiumUI(state.isPro);
        });
    },

    initWidgets() {
        if (typeof Split !== 'undefined') {
            Split(['#dashboard-col-left', '#dashboard-col-right'], {
                sizes: [42, 58],
                minSize: 320,
                gutterSize: 10,
            });
        }

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

    // [新增] 渲染交易列表 (修復 Missing Function Error)
    renderTransactionList(transactions) {
        const listEl = document.getElementById('transactionsList');
        if (!listEl) return;

        listEl.innerHTML = ''; // 清空舊資料

        if (transactions.length === 0) {
            listEl.innerHTML = '<div class="text-center text-muted p-3">尚無交易紀錄</div>';
            return;
        }

        transactions.forEach(tx => {
            // 處理日期格式
            const dateStr = tx.date; // 假設存的是 YYYY-MM-DD
            
            // 處理標籤顯示
            let tagsHtml = '';
            if (Array.isArray(tx.tags) && tx.tags.length > 0) {
                tagsHtml = tx.tags.map(tag => 
                    `<span class="badge bg-light text-dark border me-1">${tag}</span>`
                ).join('');
            }

            const item = document.createElement('div');
            item.className = 'list-group-item d-flex justify-content-between align-items-center';
            item.innerHTML = `
                <div>
                    <div class="fw-bold">${tx.item} <small class="text-muted ms-2">${dateStr}</small></div>
                    <div class="small text-muted">
                        <span class="badge bg-secondary me-1">${tx.category}</span>
                        ${tagsHtml}
                        ${tx.account ? `<span class="text-info ms-1"><i class="bi bi-wallet2"></i> ${tx.account}</span>` : ''}
                    </div>
                </div>
                <div class="text-end">
                    <div class="fw-bold ${tx.type === '收入' ? 'text-income' : 'text-expense'}">
                        ${tx.type === '收入' ? '+' : '-'} $${parseFloat(tx.amount).toLocaleString()}
                    </div>
                    <button class="btn btn-sm btn-link text-danger p-0 delete-btn" data-id="${tx.id}">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            `;
            
            // 綁定刪除按鈕事件
            item.querySelector('.delete-btn').addEventListener('click', async (e) => {
                if(confirm('確定要刪除這筆紀錄嗎？')) {
                    const id = e.currentTarget.dataset.id;
                    await dbManager.deleteTransaction(id);
                }
            });

            listEl.appendChild(item);
        });
    },

    renderCategoryChart(transactions) {
        const ctx = document.getElementById('categoryPieChart')?.getContext('2d');
        if (!ctx) return;

        if (this.charts.pie) this.charts.pie.destroy();

        const dataMap = {};
        transactions.forEach(tx => {
            // 安全檢查 tx.tags 是否為陣列
            const tags = Array.isArray(tx.tags) ? tx.tags : [];
            if (tags.includes('#不納入統計') || tx.type !== '支出') return;
            dataMap[tx.category] = (dataMap[tx.category] || 0) + parseFloat(tx.amount);
        });

        this.charts.pie = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: Object.keys(dataMap),
                datasets: [{
                    data: Object.values(dataMap),
                    backgroundColor: ['#ff6384', '#36a2eb', '#ffce56', '#4bc1c2', '#9966ff', '#ff9f40']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    },

    updatePremiumUI(isPro) {
        const proBadge = document.getElementById('pro-status-badge');
        const cloudBtn = document.getElementById('btn-cloud-sync');

        if (proBadge) {
            proBadge.innerHTML = isPro ? '💎 專業版 (全站通吃)' : '免費版';
            proBadge.style.color = isPro ? '#2e7d32' : '#666';
        }

        if (cloudBtn) {
            cloudBtn.disabled = !isPro;
            cloudBtn.title = isPro ? "雲端備份" : "專業版專屬功能";
        }
    },

    saveLayout() {
        const layout = {
            left: Array.from(document.querySelectorAll('#dashboard-col-left .dashboard-module')).map(el => el.id),
            right: Array.from(document.querySelectorAll('#dashboard-col-right .dashboard-module')).map(el => el.id)
        };
        
        if (state.isPro && state.currentUser) {
            dbManager.db.collection('users').doc(state.currentUser.uid).update({ layout });
        } else {
            localStorage.setItem('zenwallet_layout', JSON.stringify(layout));
        }
    }
};