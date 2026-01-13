// js/dashboardController.js
import { getTransactions } from "./services/transaction.js";
import { getAccounts } from "./services/account.js";
import { getHoldings } from "./services/portfolio.js";
import { getTemplates } from "./services/template.js";
import { recordDailySnapshot, getHistory } from "./services/history.js";
import { addTransaction } from "./services/transaction.js"; // 補上遺漏的 import

let trendChart = null;
let pieChart = null;
let netWorthChart = null;
let tagTrendChart = null;
let tagModal = null;
let calendar = null; 
let dateDetailsModal = null; 

export async function initDashboard() {
    const modalEl = document.getElementById('tagTrendModal');
    if (modalEl) tagModal = new bootstrap.Modal(modalEl);

    const dateModalEl = document.getElementById('dateDetailsModal');
    if (dateModalEl) dateDetailsModal = new bootstrap.Modal(dateModalEl);

    const calendarEl = document.getElementById('calendar');
    if (calendarEl) {
        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            headerToolbar: {
                left: 'title', // 標題靠左，更簡潔
                center: '',
                right: 'prev,next today' // 按鈕靠右
            },
            height: '100%', // 隨父容器高度
            contentHeight: 'auto',
            locale: 'zh-tw',
            dayMaxEvents: true, // 🔥 關鍵：限制單日顯示數量，避免 Overflow
            moreLinkText: '更多', // "More" 的中文
            fixedWeekCount: false, // 不強制顯示6週，隨該月週數變化 (如4-5週)，節省空間

            dayCellContent: function(arg) {
                return arg.dayNumberText.replace('日', '');
            },
            
            eventClick: function(info) {
                if(info.event.startStr) showDateDetails(info.event.startStr);
            },
            dateClick: function(info) {
                showDateDetails(info.dateStr);
            }
        });
        calendar.render();
        
        // 解決 Gridstack 拖拉變形問題：監聽視窗變動重繪
        // (Gridstack 的 resize event 處理比較複雜，這裡用 ResizeObserver 監聽容器)
        const resizeObserver = new ResizeObserver(() => {
            calendar.updateSize();
        });
        resizeObserver.observe(calendarEl);
    }

    await refreshGlobalData();
    renderTemplates();
    await renderCalendar();
}

// 🔥 新增：只更新全域資產 (總資產、投資總值)，不受篩選影響
export async function refreshGlobalData() {
    try {
        const [transactions, accounts, holdings] = await Promise.all([
            getTransactions(),
            getAccounts(),
            getHoldings()
        ]);

        // 計算現金資產
        let cashTotal = accounts.reduce((sum, acc) => sum + acc.initial, 0);
        transactions.forEach(tx => {
            if (tx.type === "收入") cashTotal += parseFloat(tx.amount);
            else if (tx.type === "支出") cashTotal -= parseFloat(tx.amount);
        });

        // 計算投資資產
        let portfolioTotal = 0;
        holdings.forEach(h => {
            portfolioTotal += (h.quantity * h.currentPrice);
        });

        const totalAssets = cashTotal + portfolioTotal;

        // 更新上方卡片
        const assetDisplay = document.getElementById("total-assets-display");
        if(assetDisplay) assetDisplay.textContent = `$ ${Math.round(totalAssets).toLocaleString()}`;
        
        const pfDisplay = document.getElementById("portfolio-total-value");
        if(pfDisplay) pfDisplay.textContent = `$ ${Math.round(portfolioTotal).toLocaleString()}`;

        // 記錄歷史並更新資產趨勢圖 (這張圖通常顯示長期的，所以獨立處理)
        await recordDailySnapshot(totalAssets);
        renderNetWorthChart();
        renderAccountList(accounts, transactions); // 帳戶列表通常顯示當下餘額，也不受日期篩選影響

    } catch (e) {
        console.error("Global data refresh failed", e);
    }
}

// 🔥 新增：接收「篩選後」的交易資料，重繪統計與圖表
export function updateDashboardCharts(filteredTransactions) {
    if (!filteredTransactions) return;

    renderStats(filteredTransactions);
    renderTrendChart(filteredTransactions);
    renderPieChart(filteredTransactions);
    renderTagAnalytics(filteredTransactions);
    renderCalendar();
}

async function renderCalendar() {
    if (!calendar) return;

    // 1. 重新抓取所有交易 (忽略外部傳入的 filteredTransactions)
    const allTransactions = await getTransactions();

    // 2. 依日期加總
    const dailyStats = {}; 
    
    allTransactions.forEach(tx => {
        const date = tx.dateStr; 
        if (!dailyStats[date]) dailyStats[date] = { income: 0, expense: 0 };
        
        if (tx.type === '收入') dailyStats[date].income += parseFloat(tx.amount);
        else if (tx.type === '支出') dailyStats[date].expense += parseFloat(tx.amount);
    });

    // 3. 轉換為 Events
    const events = [];
    for (const [date, stats] of Object.entries(dailyStats)) {
        if (stats.income > 0) {
            events.push({
                title: `+${Math.round(stats.income)}`,
                start: date,
                backgroundColor: 'transparent',
                borderColor: 'transparent',
                textColor: '#198754', 
                classNames: ['fw-bold', 'small']
            });
        }
        if (stats.expense > 0) {
            events.push({
                title: `-${Math.round(stats.expense)}`,
                start: date,
                backgroundColor: 'transparent',
                borderColor: 'transparent',
                textColor: '#dc3545', 
                classNames: ['fw-bold', 'small']
            });
        }
    }

    // 4. 更新 Calendar
    calendar.removeAllEvents();
    calendar.addEventSource(events);
}

// 🔥 顯示當日交易明細 Modal
async function showDateDetails(dateStr) {
    if (!dateDetailsModal) return;

    // 取得當日所有交易 (需重新 fetch 以確保完整性，或傳遞當下 filter 結果)
    // 這裡簡單起見，讀取所有交易再 filter date
    // 若要支援篩選器連動，可以改用全域變數存當下的 filteredTransactions
    // 但通常點擊日期就是想看那天發生什麼事，所以讀取「該日所有交易」較直覺
    
    const transactions = await getTransactions();
    const dayTxs = transactions.filter(tx => tx.dateStr === dateStr);

    const title = document.getElementById("date-details-title");
    const list = document.getElementById("date-details-list");
    
    if(title) title.textContent = `${dateStr} 交易明細`;
    
    list.innerHTML = "";
    if (dayTxs.length === 0) {
        list.innerHTML = '<div class="text-center text-muted py-3">無交易紀錄</div>';
    } else {
        dayTxs.forEach(tx => {
            const isExpense = tx.type === "支出";
            const colorClass = isExpense ? "text-danger" : "text-success";
            const sign = isExpense ? "-" : "+";
            
            list.innerHTML += `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <div class="fw-bold">${tx.item}</div>
                        <small class="text-muted">${tx.category} | ${tx.account}</small>
                    </div>
                    <div class="${colorClass} fw-bold">
                        ${sign}$${parseFloat(tx.amount).toLocaleString()}
                    </div>
                </div>
            `;
        });
    }

    dateDetailsModal.show();
}

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
                await refreshGlobalData(); // 更新資產
                document.dispatchEvent(new Event("zenwallet:dataChanged")); // 通知列表更新
            } catch (e) { alert(e.message); }
        };
        container.appendChild(btn);
    });
}

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
            datasets: [{ label: '總資產', data: data, borderColor: '#0d6efd', backgroundColor: 'rgba(13, 110, 253, 0.1)', fill: true, tension: 0.4 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false } } }
    });
}

function renderAccountList(accounts, transactions) {
    const list = document.getElementById("account-balance-list");
    if(!list) return;
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

// 統計卡片 (使用篩選後資料)
function renderStats(transactions) {
    const income = transactions.filter(t => t.type === '收入').reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const expense = transactions.filter(t => t.type === '支出').reduce((sum, t) => sum + parseFloat(t.amount), 0);
    
    const incEl = document.getElementById("stat-income");
    const expEl = document.getElementById("stat-expense");
    if(incEl) incEl.textContent = `$ ${income.toLocaleString()}`;
    if(expEl) expEl.textContent = `$ ${expense.toLocaleString()}`;
}

// 收支趨勢圖 (動態適應篩選範圍)
function renderTrendChart(transactions) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;

    // 1. 決定 X 軸範圍 (根據資料的最小與最大日期)
    if (transactions.length === 0) {
        if(trendChart) trendChart.destroy();
        return;
    }

    // 排序日期
    const sortedTx = [...transactions].sort((a,b) => a.dateStr.localeCompare(b.dateStr));
    const minDate = new Date(sortedTx[0].dateStr);
    const maxDate = new Date(sortedTx[sortedTx.length - 1].dateStr);
    
    // 產生月份標籤 (YYYY-MM)
    const labels = [];
    const incomeData = [];
    const expenseData = [];
    const dataMap = {}; // key: "YYYY-MM", val: {inc:0, exp:0}

    let curr = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    const end = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);

    // 若範圍太小(同月份)，至少顯示該月
    if (curr > end) { 
        const k = `${curr.getFullYear()}-${String(curr.getMonth()+1).padStart(2,'0')}`;
        dataMap[k] = {inc:0, exp:0};
        labels.push(k);
    } else {
        while (curr <= end) {
            const k = `${curr.getFullYear()}-${String(curr.getMonth()+1).padStart(2,'0')}`;
            dataMap[k] = {inc:0, exp:0};
            labels.push(k);
            curr.setMonth(curr.getMonth() + 1);
        }
    }

    // 填入數據
    transactions.forEach(tx => {
        const k = tx.dateStr.substring(0, 7);
        if (dataMap[k]) {
            if(tx.type === '收入') dataMap[k].inc += parseFloat(tx.amount);
            else dataMap[k].exp += parseFloat(tx.amount);
        }
    });

    labels.forEach(k => {
        incomeData.push(dataMap[k].inc);
        expenseData.push(dataMap[k].exp);
    });

    if(trendChart) trendChart.destroy();
    trendChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: '收入', data: incomeData, backgroundColor: '#198754' },
                { label: '支出', data: expenseData, backgroundColor: '#dc3545' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { grid: {display: false} } } }
    });
}

// 圓餅圖 (使用篩選後資料)
function renderPieChart(transactions) {
    const ctx = document.getElementById('categoryPieChart');
    const noDataMsg = document.getElementById('pie-chart-no-data');
    if (!ctx) return;
    
    const expenses = transactions.filter(t => t.type === '支出' && t.category !== '轉帳支出' && t.category !== '帳目調整');
    
    if (expenses.length === 0) {
        ctx.style.display = 'none'; 
        if(noDataMsg) noDataMsg.classList.remove('d-none'); 
        return;
    }
    ctx.style.display = 'block'; 
    if(noDataMsg) noDataMsg.classList.add('d-none');

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

// 標籤分析 (使用篩選後資料)
function renderTagAnalytics(transactions) {
    const list = document.getElementById("tag-analytics-list");
    if (!list) return;

    const tagStats = {};
    transactions.forEach(tx => {
        if (tx.type === '支出' && tx.tags && tx.tags.length > 0) {
            tx.tags.forEach(tag => {
                const cleanTag = tag.trim();
                tagStats[cleanTag] = (tagStats[cleanTag] || 0) + parseFloat(tx.amount);
            });
        }
    });

    const sortedTags = Object.entries(tagStats).sort(([, amountA], [, amountB]) => amountB - amountA);

    list.innerHTML = "";
    if (sortedTags.length === 0) {
        list.innerHTML = '<div class="text-center text-muted py-3">無標籤資料</div>';
        return;
    }

    sortedTags.forEach(([tag, amount], index) => {
        const item = document.createElement("div");
        item.className = "list-group-item tag-stat-item d-flex justify-content-between align-items-center";
        item.style.cursor = "pointer";
        item.onclick = () => showTagTrend(tag, transactions); // 點擊時使用當下的資料集
        item.innerHTML = `
            <div><span class="badge bg-light text-dark border me-2">${index + 1}</span><span class="badge rounded-pill bg-secondary">${tag}</span></div>
            <span class="text-expense fw-bold sensitive">$${Math.round(amount).toLocaleString()}</span>
        `;
        list.appendChild(item);
    });
}

function showTagTrend(tagName, allTransactions) {
    const title = document.getElementById('tag-trend-title');
    const totalDisplay = document.getElementById('tag-trend-total');
    const ctx = document.getElementById('tagTrendChart');

    if (!tagModal || !ctx) return;

    const tagTransactions = allTransactions
        .filter(tx => tx.type === '支出' && tx.tags && tx.tags.includes(tagName))
        .sort((a, b) => a.dateStr.localeCompare(b.dateStr));

    const total = tagTransactions.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
    
    // 簡單以日或月繪製趨勢 (這裡簡化為交易點)
    const labels = tagTransactions.map(t => t.dateStr);
    const data = tagTransactions.map(t => parseFloat(t.amount));

    if(title) title.textContent = `${tagName} 支出分佈`;
    if(totalDisplay) totalDisplay.textContent = `$ ${Math.round(total).toLocaleString()}`;

    if (tagTrendChart) tagTrendChart.destroy();
    tagTrendChart = new Chart(ctx, {
        type: 'bar', // 改用長條圖顯示每筆支出
        data: {
            labels: labels,
            datasets: [{
                label: '支出金額', data: data, backgroundColor: '#dc3545'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });

    tagModal.show();
}