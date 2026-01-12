/**
 * assets/js/main.js
 * 整合：日期篩選、編輯功能、動態總資產計算
 */
import { authManager } from './modules/authManager.js';
import { dbManager } from './modules/dbManager.js';
import { uiController } from './modules/uiController.js';
import { state } from './modules/state.js';

// 全域狀態
let allTransactions = [];      // 所有交易 (用於計算餘額)
let filteredTransactions = []; // 篩選後的交易 (用於列表與圖表)
let currentAccounts = [];
let portfolioValue = 0;
let isEditMode = false;        // 是否為編輯模式
let editingTxId = null;        // 正在編輯的 ID

document.addEventListener('DOMContentLoaded', () => {
    // 1. 初始化模組
    authManager.init();
    dbManager.init();
    uiController.init();
    
    // 初始化篩選器預設值 (本月)
    initDateFilter();

    bindEvents();

    // 2. 監聽登入
    window.addEventListener('auth-status-changed', async (e) => {
        const user = e.detail;
        if (user) {
            document.getElementById('app-container').style.display = 'block';
            document.getElementById('login-section').style.display = 'none';
            
            await dbManager.initDefaultSettings();
            
            // 載入選單資料
            currentAccounts = await dbManager.getAccounts();
            const currentCategories = await dbManager.getCategories();
            populateDropdowns(currentAccounts, currentCategories);
            
            startDataListeners();
        } else {
            document.getElementById('app-container').style.display = 'none';
            document.getElementById('login-section').style.display = 'block';
        }
    });

    // 3. 監聽編輯事件
    window.addEventListener('edit-transaction', (e) => {
        const tx = e.detail;
        enterEditMode(tx);
    });
});

function initDateFilter() {
    // 預設為本月 1 號到今天
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    // 為了使用者體驗，結束日期可設為今天或月底
    document.getElementById('filter-start').valueAsDate = firstDay;
    document.getElementById('filter-end').valueAsDate = now;
}

function bindEvents() {
    // 登入登出
    document.getElementById('btn-login')?.addEventListener('click', () => authManager.login());
    const logoutBtn = document.querySelector('.user-controls .btn-outline-danger') || document.getElementById('btn-logout');
    logoutBtn?.addEventListener('click', () => authManager.logout());

    // 篩選器按鈕
    document.getElementById('btn-apply-filter')?.addEventListener('click', () => {
        applyFiltersAndRender();
    });

    document.getElementById('btn-quick-month')?.addEventListener('click', () => {
        initDateFilter(); // 重設為本月
        applyFiltersAndRender();
    });

    // 交易表單提交 (支援 新增 與 更新)
    document.getElementById('addTransactionForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 處理中...';

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

        let result;
        if (isEditMode && editingTxId) {
            // 執行更新
            result = await dbManager.updateTransaction(editingTxId, formData);
        } else {
            // 執行新增
            result = await dbManager.addTransaction(formData);
        }

        if (result.success) {
            if (isEditMode) {
                exitEditMode(); // 退出編輯模式
                // 提示成功
                console.log("Updated successfully");
            } else {
                // 新增模式：重設表單但保留日期與帳戶
                const lastDate = formData.date;
                const lastAccount = formData.account;
                e.target.reset();
                document.getElementById('add-date').value = lastDate;
                document.getElementById('add-account').value = lastAccount;
            }
        } else {
            alert((isEditMode ? "更新" : "新增") + "失敗: " + result.error);
        }

        // 恢復按鈕狀態 (如果是新增模式)
        if (!isEditMode) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-plus-lg"></i> 新增紀錄';
        }
    });

    // 投資組合表單
    document.getElementById('portfolioForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        btn.disabled = true; btn.textContent = "更新中...";
        
        const ticker = document.getElementById('pf-ticker').value.toUpperCase().trim();
        const qty = document.getElementById('pf-qty').value;
        
        const result = await dbManager.updateHolding(ticker, qty);
        
        if (result.success) {
            if (typeof bootstrap !== 'undefined') {
                const modalEl = document.getElementById('portfolioModal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            } else {
                // Fallback
                document.getElementById('portfolioModal').classList.remove('show');
                document.querySelector('.modal-backdrop')?.remove();
                document.body.classList.remove('modal-open');
            }
            e.target.reset();
        } else { 
            alert("更新失敗: " + result.error); 
        }
        btn.disabled = false; btn.textContent = originalText;
    });
}

function startDataListeners() {
    // 1. 監聽所有交易 (不帶篩選條件，取得全部歷史)
    dbManager.listenTransactions({}, (transactions) => {
        allTransactions = transactions;
        
        // 資料一更新，立刻重新套用目前的日期篩選並渲染
        applyFiltersAndRender();
        
        // 總資產計算永遠使用 allTransactions (確保餘額正確)
        recalculateTotalAssets();
    });

    // 2. 投資監聽
    dbManager.listenPortfolio((holdings, totalValue) => {
        portfolioValue = totalValue;
        uiController.renderPortfolioList(holdings);
        recalculateTotalAssets();
    });
}

// 核心篩選邏輯
function applyFiltersAndRender() {
    const startStr = document.getElementById('filter-start').value;
    const endStr = document.getElementById('filter-end').value;

    // 前端篩選
    filteredTransactions = allTransactions.filter(tx => {
        if (!startStr && !endStr) return true;
        const txDate = tx.date; // YYYY-MM-DD
        let pass = true;
        if (startStr && txDate < startStr) pass = false;
        if (endStr && txDate > endStr) pass = false;
        return pass;
    });

    // 渲染 UI (只顯示篩選後的)
    uiController.renderTransactionList(filteredTransactions);
    uiController.renderCategoryChart(filteredTransactions);
}

// 進入編輯模式
function enterEditMode(tx) {
    isEditMode = true;
    editingTxId = tx.id;

    // 填入表單
    document.getElementById('add-date').value = tx.date;
    document.getElementById('add-type').value = tx.type;
    document.getElementById('add-account').value = tx.account;
    document.getElementById('add-category').value = tx.category;
    document.getElementById('add-item').value = tx.item;
    document.getElementById('add-amount').value = tx.amount;
    document.getElementById('add-notes').value = tx.notes || '';
    
    if (Array.isArray(tx.tags)) {
        document.getElementById('add-tags').value = tx.tags.join(', ');
    } else {
        document.getElementById('add-tags').value = '';
    }

    // 變更 UI 狀態
    const titleEl = document.getElementById('form-title');
    const submitBtn = document.querySelector('#addTransactionForm button[type="submit"]');
    
    if (titleEl) {
        titleEl.innerHTML = `<i class="bi bi-pencil-fill text-primary"></i> 編輯紀錄 <button class="btn btn-sm btn-outline-secondary ms-2" onclick="cancelEditMode()">取消</button>`;
    }
    submitBtn.innerHTML = '<i class="bi bi-check-lg"></i> 更新紀錄';
    submitBtn.className = 'btn btn-success w-100 mt-2';
    
    // 捲動到表單
    document.getElementById('dashboard-col-right').scrollIntoView({ behavior: 'smooth' });
}

// 退出/取消編輯模式
window.cancelEditMode = function() {
    exitEditMode();
}

function exitEditMode() {
    isEditMode = false;
    editingTxId = null;
    
    document.getElementById('addTransactionForm').reset();
    document.getElementById('add-date').valueAsDate = new Date(); // 恢復今天
    
    const titleEl = document.getElementById('form-title');
    const submitBtn = document.querySelector('#addTransactionForm button[type="submit"]');
    
    if (titleEl) titleEl.innerHTML = '<i class="bi bi-pencil-square"></i> 新增紀錄';
    submitBtn.innerHTML = '<i class="bi bi-plus-lg"></i> 新增紀錄';
    submitBtn.className = 'btn btn-primary w-100 mt-2';
    submitBtn.disabled = false;
}

function recalculateTotalAssets() {
    let cashBalance = 0;
    
    // 初始金額
    currentAccounts.forEach(acc => {
        if (acc.name !== "投資帳戶 (Portfolio)") {
            cashBalance += (parseFloat(acc.initial) || 0);
        }
    });

    // 交易變動 (使用 allTransactions，確保篩選不會影響餘額)
    allTransactions.forEach(tx => {
        if (tx.account === "投資帳戶 (Portfolio)") return;
        const amount = parseFloat(tx.amount) || 0;
        if (tx.type === '收入') cashBalance += amount;
        else if (tx.type === '支出') cashBalance -= amount;
    });

    const grandTotal = cashBalance + portfolioValue;

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

function populateDropdowns(accounts, categories) {
    const accountSelect = document.getElementById('add-account');
    if (accountSelect && accounts.length > 0) {
        accountSelect.innerHTML = accounts.map(acc => `<option value="${acc.name}">${acc.name}</option>`).join('');
    }
    const categorySelect = document.getElementById('add-category');
    if (categorySelect && categories && categories.length > 0) {
        categorySelect.innerHTML = categories.map(cat => {
            const name = (typeof cat === 'object') ? cat.name : cat;
            return `<option value="${name}">${name}</option>`;
        }).join('');
    }
}