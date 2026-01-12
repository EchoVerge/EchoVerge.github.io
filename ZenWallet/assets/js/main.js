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
        btn.disabled = true;
        btn.textContent = "儲存中...";

        const formData = {
            date: document.getElementById('add-date').value,
            type: document.getElementById('add-type').value,
            // 暫時寫死或從 accounts 下拉選單取得
            category: "未分類", 
            account: "現金", 
            item: document.getElementById('add-item').value,
            amount: document.getElementById('add-amount').value,
            tags: "" // 可增加 tags 輸入欄位
        };

        const result = await dbManager.addTransaction(formData);
        if (result.success) {
            e.target.reset();
            // 重設日期為今天
            document.getElementById('add-date').valueAsDate = new Date();
        } else {
            alert("新增失敗: " + result.error);
        }
        btn.disabled = false;
        btn.textContent = "新增紀錄";
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