// js/dashboardController.js
import { getTransactions } from "./services/transaction.js";
import { getAccounts } from "./services/account.js";
import { getHoldings } from "./services/portfolio.js";
import { calculateBalances, calculatePeriodStats, prepareChartData } from "./services/report.js";

let pieChartInstance = null;
let trendChartInstance = null;

export async function initDashboard() {
    await refreshDashboard();
}

/**
 * 刷新整個儀表板 (當新增/刪除/修改交易後呼叫)
 */
export async function refreshDashboard() {
    try {
        // 2. 加入 getHoldings() 平行讀取
        const [accounts, transactions, holdings] = await Promise.all([
            getAccounts(), 
            getTransactions(), 
            getHoldings()
        ]);

        // 3. 傳入 holdings 進行計算
        updateAssetDisplay(accounts, transactions, holdings);

        updateStatCards(transactions);
        renderCharts(transactions);

    } catch (e) {
        console.error("儀表板刷新失敗:", e);
    }
}

function updateAssetDisplay(accounts, transactions, holdings) {
    const { balances, totalAssets: cashAssets } = calculateBalances(accounts, transactions);

    // 4. 計算投資總值
    let portfolioValue = 0;
    if (holdings && holdings.length > 0) {
        portfolioValue = holdings.reduce((sum, h) => sum + (h.quantity * h.currentPrice), 0);
    }

    // 5. 總資產 = 現金 + 投資
    const grandTotal = cashAssets + portfolioValue;

    // 更新大字總資產
    document.getElementById("total-assets-display").textContent = `$ ${grandTotal.toLocaleString()}`;

    // 更新列表 (加入投資組合一行)
    const listEl = document.getElementById("account-balance-list");
    listEl.innerHTML = "";
    
    // 顯示現金帳戶
    accounts.forEach(acc => {
        const bal = balances[acc.name] || 0;
        const colorClass = bal < 0 ? "text-danger" : (bal > 0 ? "text-success" : "text-muted");
        
        const li = document.createElement("li");
        li.className = "list-group-item d-flex justify-content-between align-items-center px-0";
        // 🔥 修改處：加入「核對」按鈕
        li.innerHTML = `
            <div>
                <strong>${acc.name}</strong>
            </div>
            <div class="d-flex align-items-center">
                <span class="${colorClass} me-2 fw-bold">$ ${bal.toLocaleString()}</span>
                <button class="btn btn-outline-secondary btn-sm border-0" title="核對餘額" onclick="window.showAdjustmentModal('${acc.name}', ${bal})">
                    <i class="bi bi-check-circle"></i>
                </button>
            </div>
        `;
        listEl.appendChild(li);
    });

    // 6. 顯示投資部位匯總
    const pfLi = document.createElement("li");
    pfLi.className = "list-group-item d-flex justify-content-between align-items-center px-0 bg-light border-top mt-2 pt-2";
    pfLi.innerHTML = `
        <span><i class="bi bi-graph-up-arrow"></i> 投資組合市值</span>
        <span class="fw-bold text-primary">$ ${portfolioValue.toLocaleString()}</span>
    `;
    listEl.appendChild(pfLi);
}

function updateStatCards(transactions) {
    const { totalIncome, totalExpense } = calculatePeriodStats(transactions);
    document.getElementById("stat-income").textContent = `$ ${totalIncome.toLocaleString()}`;
    document.getElementById("stat-expense").textContent = `$ ${totalExpense.toLocaleString()}`;
}

function renderCharts(transactions) {
    const { pieData, trendData } = prepareChartData(transactions);

    // --- 1. 圓餅圖 (支出類別) ---
    const ctxPie = document.getElementById("categoryPieChart");
    if (pieChartInstance) pieChartInstance.destroy(); // 銷毀舊圖表防止重疊

    const pieLabels = Object.keys(pieData);
    const pieValues = Object.values(pieData);

    if (pieValues.length === 0) {
        document.getElementById("pie-chart-no-data").classList.remove("d-none");
        ctxPie.style.display = "none";
    } else {
        document.getElementById("pie-chart-no-data").classList.add("d-none");
        ctxPie.style.display = "block";

        pieChartInstance = new Chart(ctxPie, {
            type: 'doughnut',
            data: {
                labels: pieLabels,
                datasets: [{
                    data: pieValues,
                    backgroundColor: [
                        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } }
                },
                onClick: (e, elements, chart) => {
                    if (elements[0]) {
                        const index = elements[0].index;
                        const category = chart.data.labels[index];
                        showCategoryDetailsModal(category); // 呼叫明細視窗
                    }
                }
            }
        });
    }

    // --- 2. 趨勢圖 (收支長條) ---
    const ctxTrend = document.getElementById("trendChart");
    if (trendChartInstance) trendChartInstance.destroy();

    // 取最近 30 天 (或筆) 的資料，避免圖表太擠
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
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: { stacked: true }
            }
        }
    });
}

function showCategoryDetailsModal(category) {
    // 這裡需要存取目前的交易列表，可以考慮從 transactionController 匯出 currentTransactions
    // 或者簡單地再次呼叫 getTransactions (會有快取)
    // 為了簡單，這裡示範邏輯：
    const modal = new bootstrap.Modal(document.getElementById('categoryDetailsModal'));
    document.getElementById('categoryDetailsTitle').textContent = `「${category}」支出明細`;
    // ... 篩選並渲染列表到 categoryDetailsList ...
    modal.show();
}