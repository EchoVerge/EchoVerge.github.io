// js/dashboardController.js
import { getTransactions } from "./services/transaction.js";
import { getAccounts } from "./services/account.js";
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
        // 平行讀取帳戶與交易資料
        const [accounts, transactions] = await Promise.all([getAccounts(), getTransactions()]);

        // 1. 更新資產與餘額列表
        updateAssetDisplay(accounts, transactions);

        // 2. 更新統計卡片 (總收支)
        updateStatCards(transactions);

        // 3. 繪製圖表
        renderCharts(transactions);

    } catch (e) {
        console.error("儀表板刷新失敗:", e);
    }
}

function updateAssetDisplay(accounts, transactions) {
    const { balances, totalAssets } = calculateBalances(accounts, transactions);

    // 更新大字總資產
    document.getElementById("total-assets-display").textContent = `$ ${totalAssets.toLocaleString()}`;

    // 更新帳戶列表
    const listEl = document.getElementById("account-balance-list");
    listEl.innerHTML = "";
    
    accounts.forEach(acc => {
        const bal = balances[acc.name] || 0;
        const colorClass = bal < 0 ? "text-danger" : (bal > 0 ? "text-success" : "text-muted");
        
        const li = document.createElement("li");
        li.className = "list-group-item d-flex justify-content-between align-items-center px-0";
        li.innerHTML = `
            <span>${acc.name}</span>
            <span class="fw-bold ${colorClass}">$ ${bal.toLocaleString()}</span>
        `;
        listEl.appendChild(li);
    });
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