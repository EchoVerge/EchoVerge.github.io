// js/dashboardController.js
import { getTransactions } from "./services/transaction.js";
import { getAccounts } from "./services/account.js";
import { getHoldings } from "./services/portfolio.js";
import { calculateBalances, calculatePeriodStats, prepareChartData } from "./services/report.js";

let pieChartInstance = null;
let trendChartInstance = null;

// 初始化儀表板
export async function initDashboard() {
    await refreshDashboard();
}

/**
 * 刷新整個儀表板 (當新增/刪除/修改交易後呼叫)
 */
export async function refreshDashboard() {
    try {
        // 平行讀取所有需要的資料
        const [accounts, transactions, holdings] = await Promise.all([
            getAccounts(), 
            getTransactions(), 
            getHoldings()
        ]);

        // 更新各個區塊
        updateAssetDisplay(accounts, transactions, holdings);
        updateStatCards(transactions);
        renderCharts(transactions);

    } catch (e) {
        console.error("儀表板刷新失敗:", e);
    }
}

// 1. 更新資產總覽與帳戶列表
function updateAssetDisplay(accounts, transactions, holdings) {
    const { balances, totalAssets: cashAssets } = calculateBalances(accounts, transactions);

    // 計算投資總值
    let portfolioValue = 0;
    if (holdings && holdings.length > 0) {
        portfolioValue = holdings.reduce((sum, h) => sum + (h.quantity * h.currentPrice), 0);
    }

    // 總資產 = 現金 + 投資
    const grandTotal = cashAssets + portfolioValue;

    // 更新大字總資產
    const totalEl = document.getElementById("total-assets-display");
    if (totalEl) totalEl.textContent = `$ ${grandTotal.toLocaleString()}`;

    // 更新列表
    const listEl = document.getElementById("account-balance-list");
    if (listEl) {
        listEl.innerHTML = "";
        
        // 顯示現金帳戶
        accounts.forEach(acc => {
            const bal = balances[acc.name] || 0;
            const colorClass = bal < 0 ? "text-danger" : (bal > 0 ? "text-success" : "text-muted");
            
            const li = document.createElement("li");
            li.className = "list-group-item d-flex justify-content-between align-items-center px-0";
            li.innerHTML = `
                <div><strong>${acc.name}</strong></div>
                <div class="d-flex align-items-center">
                    <span class="${colorClass} me-2 fw-bold">$ ${bal.toLocaleString()}</span>
                    <button class="btn btn-outline-secondary btn-sm border-0" title="核對餘額" onclick="window.showAdjustmentModal('${acc.name}', ${bal})">
                        <i class="bi bi-check-circle"></i>
                    </button>
                </div>
            `;
            listEl.appendChild(li);
        });

        // 顯示投資部位匯總
        const pfLi = document.createElement("li");
        pfLi.className = "list-group-item d-flex justify-content-between align-items-center px-0 bg-light border-top mt-2 pt-2";
        pfLi.innerHTML = `
            <span><i class="bi bi-graph-up-arrow"></i> 投資組合市值</span>
            <span class="fw-bold text-primary">$ ${portfolioValue.toLocaleString()}</span>
        `;
        listEl.appendChild(pfLi);
    }
}

// 2. 更新統計卡片 (收入/支出)
function updateStatCards(transactions) {
    const { totalIncome, totalExpense } = calculatePeriodStats(transactions);
    const incEl = document.getElementById("stat-income");
    const expEl = document.getElementById("stat-expense");
    
    if (incEl) incEl.textContent = `$ ${totalIncome.toLocaleString()}`;
    if (expEl) expEl.textContent = `$ ${totalExpense.toLocaleString()}`;
}

// 3. 繪製圖表 (圓餅圖 + 趨勢圖)
function renderCharts(transactions) {
    const { pieData, trendData } = prepareChartData(transactions);

    // --- A. 圓餅圖 (支出類別) ---
    const ctxPie = document.getElementById("categoryPieChart");
    if (ctxPie) {
        if (pieChartInstance) pieChartInstance.destroy();

        const pieLabels = Object.keys(pieData);
        const pieValues = Object.values(pieData);
        const noDataEl = document.getElementById("pie-chart-no-data");

        if (pieValues.length === 0) {
            if(noDataEl) noDataEl.classList.remove("d-none");
            ctxPie.style.display = "none";
        } else {
            if(noDataEl) noDataEl.classList.add("d-none");
            ctxPie.style.display = "block";

            pieChartInstance = new Chart(ctxPie, {
                type: 'doughnut',
                data: {
                    labels: pieLabels,
                    datasets: [{
                        data: pieValues,
                        backgroundColor: [
                            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF', '#FF9F80', '#8AC926'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false, // 關鍵：讓圖表適應 Gridstack 容器大小
                    plugins: {
                        legend: { 
                            position: 'right', // 圖例放右邊
                            labels: { 
                                boxWidth: 12, 
                                font: { size: 11 },
                                color: '#333' // 確保文字顏色可見
                            } 
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.label || '';
                                    if (label) label += ': ';
                                    let value = context.raw;
                                    label += '$' + value.toLocaleString();
                                    return label;
                                }
                            }
                        }
                    },
                    // 點擊事件：顯示明細
                    onClick: (e, elements, chart) => {
                        if (elements[0]) {
                            const index = elements[0].index;
                            const category = chart.data.labels[index];
                            showCategoryDetailsModal(category); 
                        }
                    }
                }
            });
        }
    }

    // --- B. 趨勢圖 (收支長條) ---
    const ctxTrend = document.getElementById("trendChart");
    if (ctxTrend) {
        if (trendChartInstance) trendChartInstance.destroy();

        // 取最近 30 天 (或筆) 的資料
        const dates = Object.keys(trendData).slice(-30); 
        const incomeData = dates.map(d => trendData[d].income);
        const expenseData = dates.map(d => trendData[d].expense);

        trendChartInstance = new Chart(ctxTrend, {
            type: 'bar',
            data: {
                labels: dates,
                datasets: [
                    { label: '收入', data: incomeData, backgroundColor: '#198754' },
                    { label: '支出', data: expenseData, backgroundColor: '#dc3545' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // 適應 Gridstack
                scales: {
                    x: { stacked: true, grid: { display: false }, ticks: { maxTicksLimit: 10 } },
                    y: { stacked: true }
                }
            }
        });
    }
}

// 4. 顯示類別明細 Modal (核心修復)
async function showCategoryDetailsModal(category) {
    const listEl = document.getElementById("categoryDetailsList");
    const titleEl = document.getElementById("categoryDetailsTitle");
    const modalEl = document.getElementById('categoryDetailsModal');

    if (!listEl || !modalEl) return;

    // 設定標題
    titleEl.textContent = `「${category}」支出明細`;
    
    // 顯示 Loading
    listEl.innerHTML = '<div class="text-center py-3"><div class="spinner-border text-primary" role="status"></div></div>';

    // 打開 Modal
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    try {
        // 重新讀取交易 (確保是最新資料)
        // 這裡會使用 transactionService 的 cache 機制 (如果有的話)，或是重新從 Firestore 拉
        const allTransactions = await getTransactions();

        // 篩選：支出 + 該類別 + 依照日期降序
        const filteredTxs = allTransactions
            .filter(tx => tx.type === "支出" && tx.category === category)
            .sort((a, b) => new Date(b.dateStr) - new Date(a.dateStr));

        if (filteredTxs.length === 0) {
            listEl.innerHTML = '<div class="text-center text-muted py-3">此類別尚無明細</div>';
            return;
        }

        // 渲染列表
        let html = '';
        filteredTxs.forEach(tx => {
            html += `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="overflow-hidden">
                            <div class="fw-bold text-truncate">${tx.item}</div>
                            <small class="text-muted">${tx.dateStr} | ${tx.account}</small>
                            ${tx.notes ? `<div class="text-muted small fst-italic text-truncate" style="max-width: 250px;">${tx.notes}</div>` : ''}
                        </div>
                        <div class="text-expense fw-bold flex-shrink-0 ms-2">
                            $${parseFloat(tx.amount).toLocaleString()}
                        </div>
                    </div>
                </div>
            `;
        });
        listEl.innerHTML = html;

    } catch (e) {
        console.error("載入明細失敗:", e);
        listEl.innerHTML = '<div class="text-danger text-center py-3">無法載入資料</div>';
    }
}