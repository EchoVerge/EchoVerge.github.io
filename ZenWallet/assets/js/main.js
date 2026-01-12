/**
 * assets/js/main.js
 * 修正：移除 onclick，實作總資產動態計算
 */
import { authManager } from './modules/authManager.js';
import { dbManager } from './modules/dbManager.js';
import { uiController } from './modules/uiController.js';
import { state } from './modules/state.js';

// 全域狀態暫存
let currentTransactions = [];
let currentAccounts = [];
let portfolioValue = 0;

document.addEventListener('DOMContentLoaded', () => {
    // 1. 初始化
    authManager.init();
    dbManager.init();
    uiController.init();

    // 2. 綁定按鈕事件 (取代 HTML onclick)
    bindEvents();

    // 3. 監聽登入狀態
    window.addEventListener('auth-status-changed', async (e) => {
        const user = e.detail;
        if (user) {
            document.getElementById('app-container').style.display = 'block';
            document.getElementById('login-section').style.display = 'none';
            
            // 初始化與載入資料
            await dbManager.initDefaultSettings();
            currentAccounts = await dbManager.getAccounts(); // 載入帳戶初始值
            populateDropdowns(currentAccounts);
            startDataListeners();
        } else {
            document.getElementById('app-container').style.display = 'none';
            document.getElementById('login-section').style.display = 'block';
        }
    });
});

function bindEvents() {
    // 登入/登出
    document.getElementById('btn-login')?.addEventListener('click', () => {
        authManager.login().catch(e => alert(e.message));
    });
    
    // 使用 querySelector 抓取登出按鈕 (假設它有 ID 或特定 class)
    // 建議在 HTML 給登出按鈕加 id="btn-logout"
    const logoutBtn = document.querySelector('.user-controls .btn-outline-danger') || document.getElementById('btn-logout');
    logoutBtn?.addEventListener('click', () => authManager.logout());

    // 新增交易表單
    document.getElementById('addTransactionForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const originalBtnText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 儲存中...';

        // 1. 收集表單資料
        const formData = {
            date: document.getElementById('add-date').value,
            type: document.getElementById('add-type').value,
            account: document.getElementById('add-account').value,   // [新增] 抓取帳戶
            category: document.getElementById('add-category').value, // [新增] 抓取類別
            item: document.getElementById('add-item').value,
            amount: document.getElementById('add-amount').value,
            tags: document.getElementById('add-tags').value,         // [新增] 抓取標籤
            notes: document.getElementById('add-notes').value        // [新增] 抓取備註
        };

        // 2. 傳送給 dbManager
        const result = await dbManager.addTransaction(formData);

        if (result.success) {
            // 3. 成功後重設表單 (保留日期與帳戶，方便連續記帳)
            const lastDate = formData.date;
            const lastAccount = formData.account;
            
            e.target.reset();
            
            // 恢復使用者習慣的設定
            document.getElementById('add-date').value = lastDate;
            document.getElementById('add-account').value = lastAccount;
            
            // 顯示成功提示 (可選)
            console.log("新增成功！");
        } else {
            alert("新增失敗: " + result.error);
        }

        btn.disabled = false;
        btn.innerHTML = originalBtnText;
    });
    document.getElementById('portfolioForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = "更新中...";

        const ticker = document.getElementById('pf-ticker').value.toUpperCase().trim();
        const qty = document.getElementById('pf-qty').value;

        const result = await dbManager.updateHolding(ticker, qty);
        
        if (result.success) {
            // 關閉 Modal
            const modalEl = document.getElementById('portfolioModal');
            const modal = bootstrap.Modal.getInstance(modalEl); // 取得 Bootstrap Modal 實例
            modal.hide();
            
            e.target.reset();
            // 提示成功 (可選)
        } else {
            alert("更新失敗: " + result.error);
        }

        btn.disabled = false;
        btn.textContent = originalText;
    });
}

function startDataListeners() {
    // 1. 交易監聽
    // 預設抓取當月資料，或抓取「全部」以計算總資產
    // 為了效能，這裡暫時抓取最近 365 天，或根據 UI filter
    const filters = {}; 
    
    dbManager.listenTransactions(filters, (transactions) => {
        currentTransactions = transactions;
        uiController.renderTransactionList(transactions);
        uiController.renderCategoryChart(transactions);
        recalculateTotalAssets();
    });

    // 2. 投資監聽
    dbManager.listenPortfolio((holdings, totalValue) => {
        portfolioValue = totalValue;
        // uiController.renderPortfolioList(holdings); // 若有實作列表渲染
        recalculateTotalAssets();
    });
}

/**
 * [修正] 動態計算總資產 (現金 + 投資)
 */
function recalculateTotalAssets() {
    // 1. 計算現金帳戶餘額 (初始值 + 收入 - 支出)
    // 注意：這只計算了「已載入」的交易。若要精確總額，需後端加總或載入所有歷史紀錄。
    let cashBalance = 0;
    
    // 加總初始金額
    currentAccounts.forEach(acc => {
        // 排除投資帳戶的初始值(通常由投資組合管理)
        if (acc.name !== "投資帳戶 (Portfolio)") {
            cashBalance += (parseFloat(acc.initial) || 0);
        }
    });

    // 加總交易變動
    currentTransactions.forEach(tx => {
        // 排除投資相關交易，避免重複計算 (視您的記帳邏輯而定)
        // 這裡假設所有收入支出都影響現金
        if (tx.account === "投資帳戶 (Portfolio)") return;

        const amount = parseFloat(tx.amount) || 0;
        if (tx.type === '收入') cashBalance += amount;
        else if (tx.type === '支出') cashBalance -= amount;
    });

    // 2. 總資產 = 現金 + 投資現值
    const grandTotal = cashBalance + portfolioValue;

    // 3. 更新 UI
    const totalEl = document.getElementById('total-assets-display');
    const breakdownEl = document.getElementById('total-assets-breakdown');

    if (totalEl) {
        totalEl.textContent = `$ ${grandTotal.toLocaleString(undefined, {minimumFractionDigits: 0})}`;
        totalEl.className = grandTotal >= 0 ? 'stat-value text-income' : 'stat-value text-expense';
    }
    if (breakdownEl) {
        breakdownEl.textContent = `現金: $${cashBalance.toLocaleString()} | 投資: $${portfolioValue.toLocaleString()}`;
    }
}

function populateDropdowns(accounts) {
    const accountSelect = document.getElementById('add-account');
    if (accountSelect && accounts.length > 0) {
        accountSelect.innerHTML = accounts.map(acc => 
            `<option value="${acc.name}">${acc.name}</option>`
        ).join('');
    }
    // 類別部分未來也可以從 dbManager.getCategories() 取得並動態填充
}