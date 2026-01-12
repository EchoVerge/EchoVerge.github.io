// js/dashboardController.js
import { getTransactions, addTransaction } from "./services/transaction.js";
import { getAccounts } from "./services/account.js";
import { getHoldings, fetchYahooPrice } from "./services/portfolio.js";
import { getTemplates } from "./services/template.js"; // 🔥 新增
import { recordDailySnapshot, getHistory } from "./services/history.js"; // 🔥 新增

// Chart 實例 (用於銷毀重繪)
let trendChart = null;
let pieChart = null;
let netWorthChart = null; // 🔥 新增

export async function initDashboard() {
    await refreshDashboard();
    renderTemplates(); // 🔥 渲染快速按鈕
}

// 刷新整個儀表板數據
export async function refreshDashboard() {
    try {
        const [transactions, accounts, holdings] = await Promise.all([
            getTransactions(),
            getAccounts(),
            getHoldings()
        ]);

        // 1. 計算資產總額
        // 現金資產 = 初始金額 + 收入 - 支出
        let cashTotal = accounts.reduce((sum, acc) => sum + acc.initial, 0);
        transactions.forEach(tx => {
            // 注意：這裡簡化計算，實際應考慮轉帳邏輯
            // 若為轉帳，通常是一進一出不影響總資產，或是只有手續費
            // 這裡假設 transactions 包含所有收支
            if (tx.type === "收入") cashTotal += parseFloat(tx.amount);
            else if (tx.type === "支出") cashTotal -= parseFloat(tx.amount);
        });

        // 投資資產
        let portfolioTotal = 0;
        holdings.forEach(h => {
            portfolioTotal += (h.quantity * h.currentPrice);
        });

        const totalAssets = cashTotal + portfolioTotal;

        // 更新 UI顯示 (加入 sensitive class)
        const assetEl = document.getElementById("total-assets-display");
        if(assetEl) assetEl.textContent = `$ ${Math.round(totalAssets).toLocaleString()}`;
        
        // 投資市值顯示
        const pfValueEl = document.getElementById("portfolio-total-value");
        if(pfValueEl) pfValueEl.textContent = `$ ${Math.round(portfolioTotal).toLocaleString()}`;

        // 🔥 記錄每日資產快照 (用於繪製歷史圖)
        await recordDailySnapshot(totalAssets);

        // 2. 渲染各個模組
        renderAccountList(accounts, transactions);
        renderStats(transactions);
        renderTrendChart(transactions);
        renderPieChart(transactions);
        renderNetWorthChart(); // 🔥 新增

    } catch (e) {
        console.error("Dashboard refresh failed", e);
    }
}

// 🔥 新增：渲染快速記帳模版按鈕
async function renderTemplates() {
    const container = document.getElementById("quick-templates-container");
    if (!container) return;
    
    const templates = await getTemplates();
    if (templates.length === 0) {
        container.classList.add("d-none");
        return;
    }
    
    container.classList.remove("d-none");
    container.innerHTML = "";

    templates.forEach(tpl => {
        const btn = document.createElement("button");
        btn.className = "btn-template";
        btn.innerHTML = `<i class="bi bi-lightning-charge"></i> ${tpl.name}`;
        
        btn.onclick = async () => {
            const amountStr = tpl.amount ? `$${tpl.amount}` : "金額未定";
            if (!confirm(`確定要快速新增「${tpl.name}」(${amountStr}) 嗎？`)) return;
            
            try {
                // 如果模版沒金額，提示輸入
                let finalAmount = tpl.amount;
                if (!finalAmount) {
                    const input = prompt("請輸入金額：");
                    if (!input) return;
                    finalAmount = parseFloat(input);
                }

                await addTransaction({
                    date: new Date().toISOString().split('T')[0],
                    type: tpl.type,
                    category: tpl.category,
                    account: tpl.account,
                    item: tpl.item || tpl.name,
                    amount: finalAmount,
                    tags: tpl.tags || [],
                    notes: "快速記帳"
                });
                
                await refreshDashboard();
                // 通知 TransactionController 更新列表
                document.dispatchEvent(new Event("zenwallet:dataChanged"));
            } catch (e) {
                alert("新增失敗: " + e.message);
            }
        };
        container.appendChild(btn);
    });
}

// 渲染帳戶列表
function renderAccountList(accounts, transactions) {
    const list = document.getElementById("account-balance-list");
    if(!list) return;
    list.innerHTML = "";
    
    accounts.forEach(acc => {
        let currentBalance = acc.initial;
        // 簡單計算該帳戶餘額
        transactions.forEach(tx => {
            if(tx.account === acc.name) {
                if(tx.type === '收入') currentBalance += parseFloat(tx.amount);
                else if(tx.type === '支出') currentBalance -= parseFloat(tx.amount);
            }
        });

        // 加入 sensitive class
        list.innerHTML += `
            <li class="list-group-item d-flex justify-content-between align-items-center px-2">
                <span>${acc.name}</span>
                <span class="fw-bold sensitive ${currentBalance < 0 ? 'text-danger' : ''}">$${currentBalance.toLocaleString()}</span>
            </li>
        `;
    });
}

// 渲染統計卡片 (本月/本週/今日 依據 transactionController 的 filter 而定，這裡簡化顯示全部或需傳入 filter)
// 目前架構下 dashboardController 拿到的是全部 transactions，通常這裡會顯示「當月」統計
function renderStats(transactions) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    let income = 0;
    let expense = 0;

    transactions.forEach(tx => {
        if (tx.dateStr >= startOfMonth && tx.dateStr <= endOfMonth) {
            if (tx.type === "收入") income += parseFloat(tx.amount);
            else if (tx.type === "支出") expense += parseFloat(tx.amount);
        }
    });

    const incEl = document.getElementById("stat-income");
    const expEl = document.getElementById("stat-expense");
    
    // 加入 sensitive class
    if(incEl) {
        incEl.textContent = `$ ${income.toLocaleString()}`;
        if (!incEl.classList.contains('sensitive')) incEl.classList.add('sensitive');
    }
    if(expEl) {
        expEl.textContent = `$ ${expense.toLocaleString()}`;
        if (!expEl.classList.contains('sensitive')) expEl.classList.add('sensitive');
    }
}

// 渲染趨勢圖 (近6個月)
function renderTrendChart(transactions) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;

    // 整理數據 (略過複雜邏輯，以月為單位)
    const months = {};
    const today = new Date();
    for(let i=5; i>=0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        months[key] = { income: 0, expense: 0 };
    }

    transactions.forEach(tx => {
        const key = tx.dateStr.substring(0, 7); // YYYY-MM
        if (months[key]) {
            if (tx.type === "收入") months[key].income += parseFloat(tx.amount);
            else if (tx.type === "支出") months[key].expense += parseFloat(tx.amount);
        }
    });

    const labels = Object.keys(months);
    const dataIncome = labels.map(k => months[k].income);
    const dataExpense = labels.map(k => months[k].expense);

    if (trendChart) trendChart.destroy();

    trendChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: '收入', data: dataIncome, backgroundColor: '#198754' },
                { label: '支出', data: dataExpense, backgroundColor: '#dc3545' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } }
        }
    });
}

// 渲染圓餅圖 (本月支出類別)
function renderPieChart(transactions) {
    const ctx = document.getElementById('categoryPieChart');
    const noDataMsg = document.getElementById('pie-chart-no-data');
    if (!ctx) return;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const categories = {};
    let hasData = false;

    transactions.forEach(tx => {
        if (tx.type === "支出" && tx.dateStr >= startOfMonth && tx.dateStr <= endOfMonth) {
            categories[tx.category] = (categories[tx.category] || 0) + parseFloat(tx.amount);
            hasData = true;
        }
    });

    if (!hasData) {
        ctx.style.display = 'none';
        if(noDataMsg) noDataMsg.classList.remove('d-none');
        return;
    }

    ctx.style.display = 'block';
    if(noDataMsg) noDataMsg.classList.add('d-none');

    if (pieChart) pieChart.destroy();

    pieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categories),
            datasets: [{
                data: Object.values(categories),
                backgroundColor: [
                    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { boxWidth: 12 } } }
        }
    });
}

// 🔥 新增：渲染資產歷史折線圖
async function renderNetWorthChart() {
    const ctx = document.getElementById('netWorthChart');
    if (!ctx) return;

    const history = await getHistory(30); // 取最近30天
    
    // 如果沒有歷史資料，暫時顯示空圖表或提示
    if (history.length === 0) return;

    const labels = history.map(h => h.date.slice(5)); // 取 MM-DD
    const data = history.map(h => h.total);

    if (netWorthChart) netWorthChart.destroy();

    netWorthChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '總資產',
                data: data,
                borderColor: '#0d6efd',
                backgroundColor: 'rgba(13, 110, 253, 0.1)',
                fill: true,
                tension: 0.3, // 稍微平滑
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index',
            },
            plugins: { 
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return '$ ' + context.parsed.y.toLocaleString();
                        }
                    }
                }
            },
            scales: { 
                y: { 
                    beginAtZero: false, // 資產通常不會是0，讓變化更明顯
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toLocaleString();
                        }
                    }
                } 
            }
        }
    });
}