/**
 * assets/js/main.js
 * ZenWallet 入口文件：負責啟動模組與 UI 控制
 */
import { authManager } from './modules/authManager.js';
import { dbManager } from './modules/dbManager.js';
import { uiController } from './modules/uiController.js';
import { state } from './state.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. 初始化核心模組
    authManager.init(); // 啟動 Firebase 驗證與權限檢查
    dbManager.init();   // 啟動資料庫連接
    uiController.init(); // 初始化 UI 組件 (Split, Sortable)

    // 2. 全域事件監聽
    
    // 監聽身份與權限狀態變更
    window.addEventListener('auth-status-changed', async (e) => {
        const user = e.detail;
        
        if (user) {
            console.log("ZenWallet 啟動中...");
            
            // 初始化使用者雲端空間
            await dbManager.initDefaultSettings();
            
            // 開始實時監聽財務數據
            startDataListeners();
            
            // 更新 UI 狀態
            document.getElementById('app-container').style.display = 'block';
            document.getElementById('login-section').style.display = 'none';
        } else {
            document.getElementById('app-container').style.display = 'none';
            document.getElementById('login-section').style.display = 'block';
        }
    });
});

/**
 * 啟動實時數據監聽器
 */
let txUnsubscribe = null;
let pfUnsubscribe = null;

function startDataListeners() {
    // 若已有監聽器則先行關閉
    if (txUnsubscribe) txUnsubscribe();
    if (pfUnsubscribe) pfUnsubscribe();

    const filters = {
        startDate: document.getElementById('filter-start-date')?.value,
        endDate: document.getElementById('filter-end-date')?.value
    };

    // 1. 監聽交易紀錄
    txUnsubscribe = dbManager.listenTransactions(filters, (transactions) => {
        uiController.renderTransactionList(transactions);
        uiController.renderCategoryChart(transactions); // 重新繪製圓餅圖
        calculateGrandTotal();
    });

    // 2. 監聽持股組合
    pfUnsubscribe = dbManager.listenPortfolio((holdings, totalValue) => {
        state.portfolioTotal = totalValue;
        uiController.renderPortfolioList(holdings);
        calculateGrandTotal();
    });
}

/**
 * 計算並更新總資產看板 (現金 + 投資)
 */
function calculateGrandTotal() {
    // 此處需結合 dbManager 計算的現金餘額與 state.portfolioTotal
    const cashTotal = 12345; // 範例，應由 dbManager.calculateBalances 取得
    const investmentTotal = state.portfolioTotal || 0;
    
    const grandTotal = cashTotal + investmentTotal;
    
    // 更新 UI
    const totalEl = document.getElementById('total-assets-display');
    if (totalEl) {
        totalEl.textContent = `$ ${grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        totalEl.className = grandTotal >= 0 ? 'stat-value text-income' : 'stat-value text-expense';
    }
}

// 綁定按鈕事件 (全域範例)
window.handleLogin = () => {
    authManager.login()
        .then(() => console.log("Login success"))
        .catch(err => alert("登入失敗: " + err.message));
};

window.handleLogout = () => {
    authManager.logout();
};