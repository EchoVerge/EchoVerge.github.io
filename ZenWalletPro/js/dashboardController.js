// js/dashboardController.js
import { getTransactions, addTransaction } from "./services/transaction.js";
import { getAccounts } from "./services/account.js";
import { getHoldings, fetchYahooPrice } from "./services/portfolio.js";
import { getTemplates } from "./services/template.js";
import { recordDailySnapshot, getHistory } from "./services/history.js";

let trendChart = null;
let pieChart = null;
let netWorthChart = null;
let tagTrendChart = null; // 🔥 新增：標籤圖表實例
let tagModal = null;      // 🔥 新增：Modal 實例

export async function initDashboard() {
    // 初始化 Modal
    const modalEl = document.getElementById('tagTrendModal');
    if (modalEl) tagModal = new bootstrap.Modal(modalEl);

    await refreshDashboard();
    renderTemplates();
}

export async function refreshDashboard() {
    try {
        const [transactions, accounts, holdings] = await Promise.all([
            getTransactions(),
            getAccounts(),
            getHoldings()
        ]);

        // 1. 計算資產
        let cashTotal = accounts.reduce((sum, acc) => sum + acc.initial, 0);
        transactions.forEach(tx => {
            if (tx.type === "收入") cashTotal += parseFloat(tx.amount);
            else if (tx.type === "支出") cashTotal -= parseFloat(tx.amount);
        });

        let portfolioTotal = 0;
        holdings.forEach(h => {
            portfolioTotal += (h.quantity * h.currentPrice);
        });

        const totalAssets = cashTotal + portfolioTotal;

        // 更新 UI
        document.getElementById("total-assets-display").textContent = `$ ${Math.round(totalAssets).toLocaleString()}`;
        document.getElementById("portfolio-total-value").textContent = `$ ${Math.round(portfolioTotal).toLocaleString()}`;

        // 記錄歷史
        await recordDailySnapshot(totalAssets);

        // 2. 更新列表與圖表
        renderAccountList(accounts, transactions);
        renderStats(transactions);
        renderTrendChart(transactions);
        renderPieChart(transactions);
        renderNetWorthChart();
        renderTagAnalytics(transactions); // 🔥 新增：渲染標籤分析

    } catch (e) {
        console.error("Dashboard refresh failed", e);
    }
}

// ... (renderTemplates 保持不變) ...
async function renderTemplates() {
    const container = document.getElementById("quick-templates-container");
    if (!container) return;
    const templates = await getTemplates();
    if (templates.length === 0) { container.classList.add("d-none"); return; }
    container.classList.remove("d-none");
    container.innerHTML = "";
    templates.forEach(tpl => {
        const btn = document.createElement("button");
        btn.className = "btn-template";
        btn.innerHTML = `<i class="bi bi-lightning-charge"></i> ${tpl.name}`;
        btn.onclick = async () => {
            if (!confirm(`確定要快速新增「${tpl.name}」($${tpl.amount}) 嗎？`)) return;
            try {
                await addTransaction({
                    date: new Date().toISOString().split('T')[0],
                    type: tpl.type, category: tpl.category, account: tpl.account,
                    item: tpl.item, amount: tpl.amount, tags: tpl.tags, notes: "快速記帳"
                });
                await refreshDashboard();
                document.dispatchEvent(new Event("zenwallet:dataChanged"));
            } catch (e) { alert(e.message); }
        };
        container.appendChild(btn);
    });
}

// ... (renderNetWorthChart 保持不變) ...
async function renderNetWorthChart() {
    const ctx = document.getElementById('netWorthChart');
    if (!ctx) return;
    const history = await getHistory(30); 
    const labels = history.map(h => h.date.slice(5)); 
    const data = history.map(h => h.total);
    if (netWorthChart) netWorthChart.destroy();
    netWorthChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '總資產', data: data, borderColor: '#0d6efd', backgroundColor: 'rgba(13, 110, 253, 0.1)', fill: true, tension: 0.4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false } } }
    });
}

// ... (renderAccountList 保持不變) ...
function renderAccountList(accounts, transactions) {
    const list = document.getElementById("account-balance-list");
    list.innerHTML = "";
    accounts.forEach(acc => {
        let currentBalance = acc.initial; 
        transactions.forEach(tx => {
            if(tx.account === acc.name) {
                if(tx.type === '收入' || (tx.category === '轉帳收入')) currentBalance += parseFloat(tx.amount);
                else currentBalance -= parseFloat(tx.amount);
            }
        });
        list.innerHTML += `<li class="list-group-item d-flex justify-content-between align-items-center"><span>${acc.name}</span><span class="fw-bold sensitive">$${currentBalance.toLocaleString()}</span></li>`;
    });
}

// ... (renderStats 保持不變) ...
function renderStats(transactions) {
    const income = transactions.filter(t => t.type === '收入').reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const expense = transactions.filter(t => t.type === '支出').reduce((sum, t) => sum + parseFloat(t.amount), 0);
    document.getElementById("stat-income").textContent = `$ ${income.toLocaleString()}`;
    document.getElementById("stat-expense").textContent = `$ ${expense.toLocaleString()}`;
}

// ... (renderTrendChart 保持不變) ...
function renderTrendChart(transactions) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    // (簡化：顯示最近7個月)
    const months = [];
    const incomeData = [];
    const expenseData = [];
    for(let i=6; i>=0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        months.push(k);
        incomeData.push(0); expenseData.push(0);
    }
    transactions.forEach(tx => {
        const k = tx.dateStr.substring(0, 7);
        const idx = months.indexOf(k);
        if(idx !== -1) {
            if(tx.type === '收入') incomeData[idx] += parseFloat(tx.amount);
            else expenseData[idx] += parseFloat(tx.amount);
        }
    });
    if(trendChart) trendChart.destroy();
    trendChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [
                { label: '收入', data: incomeData, backgroundColor: '#198754' },
                { label: '支出', data: expenseData, backgroundColor: '#dc3545' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { grid: {display: false} } } }
    });
}

// ... (renderPieChart 保持不變) ...
function renderPieChart(transactions) {
    const ctx = document.getElementById('categoryPieChart');
    const noDataMsg = document.getElementById('pie-chart-no-data');
    if (!ctx) return;
    
    // 只統計支出
    const expenses = transactions.filter(t => t.type === '支出' && t.category !== '轉帳支出' && t.category !== '帳目調整');
    if (expenses.length === 0) {
        ctx.style.display = 'none'; noDataMsg.classList.remove('d-none'); return;
    }
    ctx.style.display = 'block'; noDataMsg.classList.add('d-none');

    const catMap = {};
    expenses.forEach(t => {
        catMap[t.category] = (catMap[t.category] || 0) + parseFloat(t.amount);
    });

    const labels = Object.keys(catMap);
    const data = Object.values(catMap);
    const colors = ['#0d6efd', '#6610f2', '#6f42c1', '#d63384', '#dc3545', '#fd7e14', '#ffc107', '#198754', '#20c997', '#0dcaf0'];

    if(pieChart) pieChart.destroy();
    pieChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: data, backgroundColor: colors }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12 } } } }
    });
}

// 🔥 新增：渲染標籤分析 (Tag Analytics)
function renderTagAnalytics(transactions) {
    const list = document.getElementById("tag-analytics-list");
    if (!list) return;

    // 1. 統計標籤 (只算支出)
    const tagStats = {};
    transactions.forEach(tx => {
        if (tx.type === '支出' && tx.tags && tx.tags.length > 0) {
            tx.tags.forEach(tag => {
                const cleanTag = tag.trim();
                tagStats[cleanTag] = (tagStats[cleanTag] || 0) + parseFloat(tx.amount);
            });
        }
    });

    // 2. 排序 (金額大到小)
    const sortedTags = Object.entries(tagStats)
        .sort(([, amountA], [, amountB]) => amountB - amountA);

    list.innerHTML = "";
    if (sortedTags.length === 0) {
        list.innerHTML = '<div class="text-center text-muted py-3">無標籤資料</div>';
        return;
    }

    // 3. 渲染列表
    sortedTags.forEach(([tag, amount], index) => {
        const item = document.createElement("div");
        item.className = "list-group-item tag-stat-item d-flex justify-content-between align-items-center";
        item.onclick = () => showTagTrend(tag, transactions);
        item.innerHTML = `
            <div>
                <span class="tag-rank-num">${index + 1}</span>
                <span class="badge rounded-pill">${tag}</span>
            </div>
            <span class="text-expense fw-bold sensitive">$${Math.round(amount).toLocaleString()}</span>
        `;
        list.appendChild(item);
    });
}

// 🔥 新增：顯示標籤趨勢 (Modal + Chart)
function showTagTrend(tagName, allTransactions) {
    const title = document.getElementById('tag-trend-title');
    const totalDisplay = document.getElementById('tag-trend-total');
    const ctx = document.getElementById('tagTrendChart');

    if (!tagModal || !ctx) return;

    // 1. 篩選該標籤的交易
    const tagTransactions = allTransactions
        .filter(tx => tx.type === '支出' && tx.tags && tx.tags.includes(tagName))
        .sort((a, b) => a.dateStr.localeCompare(b.dateStr)); // 日期升序

    // 2. 計算總額
    const total = tagTransactions.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
    
    // 3. 準備圖表數據 (按月分組)
    const monthlyData = {};
    // 初始化最近 6 個月
    for(let i=5; i>=0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        monthlyData[k] = 0;
    }

    tagTransactions.forEach(tx => {
        const k = tx.dateStr.substring(0, 7); // YYYY-MM
        // 如果是這6個月內的，或者想要顯示所有歷史，這裡範例只顯示有資料的月份 + 補零
        if (monthlyData.hasOwnProperty(k)) {
            monthlyData[k] += parseFloat(tx.amount);
        } else {
            // 自動擴充前面的月份 (選用)
            monthlyData[k] = (monthlyData[k] || 0) + parseFloat(tx.amount);
        }
    });

    // 排序月份 Key
    const labels = Object.keys(monthlyData).sort();
    const data = labels.map(k => monthlyData[k]);

    // 4. 更新 UI
    title.textContent = `${tagName} 支出趨勢`;
    totalDisplay.textContent = `$ ${Math.round(total).toLocaleString()}`;

    if (tagTrendChart) tagTrendChart.destroy();

    tagTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '支出金額',
                data: data,
                borderColor: '#dc3545',
                backgroundColor: 'rgba(220, 53, 69, 0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } }
        }
    });

    tagModal.show();
}