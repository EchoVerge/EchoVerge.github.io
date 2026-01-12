/**
 * assets/js/main.js
 * 修正：移除 onclick，實作總資產動態計算，動態載入類別與帳戶，修復投資列表顯示
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
            
            // [修正] 同時載入帳戶與類別
            currentAccounts = await dbManager.getAccounts();
            const currentCategories = await dbManager.getCategories();
            
            // [修正] 傳入兩個參數以填充選單
            populateDropdowns(currentAccounts, currentCategories);
            
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
            account: document.getElementById('add-account').value,   
            category: document.getElementById('add-category').value, 
            item: document.getElementById('add-item').value,
            amount: document.getElementById('add-amount').value,
            tags: document.getElementById('add-tags').value,         
            notes: document.getElementById('add-notes').value        
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
            
            console.log("新增成功！");
        } else {
            alert("新增失敗: " + result.error);
        }

        btn.disabled = false;
        btn.innerHTML = originalBtnText;
    });

    // 投資組合表單提交
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
            // 如果使用 Bootstrap 5，建議用這種方式獲取並隱藏 Modal
            if (typeof bootstrap !== 'undefined') {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            } else {
                // Fallback (移除 backdrop 等)
                modalEl.classList.remove('show');
                document.body.classList.remove('modal-open');
                const backdrop = document.querySelector('.modal-backdrop');
                if (backdrop) backdrop.remove();
            }
            
            e.target.reset();
        } else {
            alert("更新失敗: " + result.error);
        }

        btn.disabled = false;
        btn.textContent = originalText;
    });
}

function startDataListeners() {
    // 1. 交易監聽
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
        
        // [修正] 解除註解，讓列表能正確顯示
        uiController.renderPortfolioList(holdings); 
        
        recalculateTotalAssets();
    });
}

/**
 * 動態計算總資產 (現金 + 投資)
 */
function recalculateTotalAssets() {
    let cashBalance = 0;
    
    // 加總初始金額
    currentAccounts.forEach(acc => {
        if (acc.name !== "投資帳戶 (Portfolio)") {
            cashBalance += (parseFloat(acc.initial) || 0);
        }
    });

    // 加總交易變動
    currentTransactions.forEach(tx => {
        if (tx.account === "投資帳戶 (Portfolio)") return;

        const amount = parseFloat(tx.amount) || 0;
        if (tx.type === '收入') cashBalance += amount;
        else if (tx.type === '支出') cashBalance -= amount;
    });

    // 總資產 = 現金 + 投資現值
    const grandTotal = cashBalance + portfolioValue;

    // 更新 UI
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

/**
 * [修正] 填充下拉選單 (支援帳戶與類別)
 */
function populateDropdowns(accounts, categories) {
    // 1. 填充帳戶
    const accountSelect = document.getElementById('add-account');
    if (accountSelect && accounts.length > 0) {
        accountSelect.innerHTML = accounts.map(acc => 
            `<option value="${acc.name}">${acc.name}</option>`
        ).join('');
    }

    // 2. [新增] 填充類別
    const categorySelect = document.getElementById('add-category');
    if (categorySelect && categories && categories.length > 0) {
        categorySelect.innerHTML = categories.map(cat => {
            // 如果 cat 是物件 {name: "餐飲", type: "支出"}，取 cat.name
            // 如果 cat 是字串 "餐飲"，直接用
            const name = (typeof cat === 'object') ? cat.name : cat;
            return `<option value="${name}">${name}</option>`;
        }).join('');
    }
}