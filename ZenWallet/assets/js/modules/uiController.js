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

    // 渲染交易列表 (含編輯按鈕)
    renderTransactionList(transactions) {
        const listEl = document.getElementById('transactionsList');
        if (!listEl) return;

        listEl.innerHTML = ''; 

        if (transactions.length === 0) {
            listEl.innerHTML = '<div class="text-center text-muted p-3">尚無符合條件的紀錄</div>';
            return;
        }

        transactions.forEach(tx => {
            const dateStr = tx.date;
            
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
                    <div>
                        <button class="btn btn-sm btn-link text-primary p-0 me-2 edit-btn" data-id="${tx.id}" title="編輯">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-sm btn-link text-danger p-0 delete-btn" data-id="${tx.id}" title="刪除">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            `;
            
            // 綁定刪除
            item.querySelector('.delete-btn').addEventListener('click', async (e) => {
                if(confirm('確定要刪除這筆紀錄嗎？')) {
                    const id = e.currentTarget.dataset.id;
                    await dbManager.deleteTransaction(id);
                }
            });

            // 綁定編輯
            item.querySelector('.edit-btn').addEventListener('click', (e) => {
                // 發送事件給 main.js 處理
                const event = new CustomEvent('edit-transaction', { detail: tx });
                window.dispatchEvent(event);
            });

            listEl.appendChild(item);
        });
    },

    renderPortfolioList(holdings) {
        const listEl = document.getElementById('portfolioList');
        if (!listEl) return;

        listEl.innerHTML = '';
        if (holdings.length === 0) {
            listEl.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-3">尚無持股</td></tr>';
            return;
        }

        holdings.forEach(h => {
            const colorClass = h.change >= 0 ? 'text-income' : 'text-expense';
            const priceStr = h.price ? `$${h.price.toLocaleString()}` : '-';
            const valueStr = h.value ? `$${Math.round(h.value).toLocaleString()}` : '-';
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <div class="fw-bold">${h.ticker}</div>
                    <div class="small text-muted">${h.quantity} 股</div>
                </td>
                <td class="text-end">
                    <div>${priceStr}</div>
                    <div class="small ${colorClass}">${h.percent ? h.percent.toFixed(2) + '%' : ''}</div>
                </td>
                <td class="text-end fw-bold">${valueStr}</td>
            `;
            
            row.style.cursor = 'pointer';
            row.onclick = () => {
                document.getElementById('pf-ticker').value = h.ticker;
                document.getElementById('pf-qty').value = h.quantity;
                if (typeof bootstrap !== 'undefined') {
                    const modal = new bootstrap.Modal(document.getElementById('portfolioModal'));
                    modal.show();
                }
            };
            
            listEl.appendChild(row);
        });
    },

    renderCategoryChart(transactions) {
        const ctx = document.getElementById('categoryPieChart')?.getContext('2d');
        if (!ctx) return;

        if (this.charts.pie) this.charts.pie.destroy();

        const dataMap = {};
        transactions.forEach(tx => {
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
                    backgroundColor: ['#ff6384', '#36a2eb', '#ffce56', '#4bc1c2', '#9966ff', '#ff9f40', '#e7e9ed', '#36a2eb']
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