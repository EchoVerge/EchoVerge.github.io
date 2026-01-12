// js/services/report.js

/**
 * 計算各帳戶餘額與總資產
 * 邏輯：初始金額 + 所有收入 - 所有支出 (不論是否有 #不納入統計 標籤，真實金流都要算)
 */
export function calculateBalances(accounts, transactions) {
    const balances = {};
    let totalAssets = 0;

    // 1. 初始化：填入帳戶初始金額
    accounts.forEach(acc => {
        balances[acc.name] = acc.initial || 0;
    });

    // 2. 遍歷所有交易計算流水
    transactions.forEach(tx => {
        const amount = parseFloat(tx.amount) || 0;
        const accName = tx.account;

        // 如果該帳戶存在於我們的設定中
        if (balances.hasOwnProperty(accName)) {
            if (tx.type === "收入") {
                balances[accName] += amount;
            } else if (tx.type === "支出") {
                balances[accName] -= amount;
            }
        }
    });

    // 3. 計算總資產 (排除負債帳戶，或者也可以全部加總，視需求而定)
    // 這裡我們先簡單加總所有帳戶餘額
    for (const name in balances) {
        totalAssets += balances[name];
    }

    return { balances, totalAssets };
}

/**
 * 計算期間統計數據 (收入、支出)
 * 邏輯：需排除包含 "#不納入統計" 標籤的交易
 */
export function calculatePeriodStats(transactions) {
    let totalIncome = 0;
    let totalExpense = 0;

    transactions.forEach(tx => {
        // 檢查是否有排除標籤
        if (tx.tags && tx.tags.includes("#不納入統計")) return;

        const amount = parseFloat(tx.amount) || 0;

        // 排除內部轉帳 (通常轉帳不應計入真正的收支統計，除非你想看金流)
        // 這裡簡單判定：如果類別是 "轉帳支出" 或 "轉帳收入" 則不計入淨收支
        if (["轉帳支出", "轉帳收入", "帳目調整"].includes(tx.category)) return;

        if (tx.type === "收入") {
            totalIncome += amount;
        } else if (tx.type === "支出") {
            totalExpense += amount;
        }
    });

    return { totalIncome, totalExpense };
}

/**
 * 準備圖表資料
 */
export function prepareChartData(transactions) {
    const categoryMap = {};
    const dateMap = {};

    // 反轉陣列，讓趨勢圖從舊到新
    const reversedTxs = [...transactions].reverse(); 

    reversedTxs.forEach(tx => {
        if (tx.tags && tx.tags.includes("#不納入統計")) return;
        if (["轉帳支出", "轉帳收入", "帳目調整"].includes(tx.category)) return;

        const amount = parseFloat(tx.amount) || 0;

        // 1. 圓餅圖資料 (只算支出)
        if (tx.type === "支出") {
            categoryMap[tx.category] = (categoryMap[tx.category] || 0) + amount;
        }

        // 2. 趨勢圖資料 (依日期分組)
        const date = tx.dateStr;
        if (!dateMap[date]) dateMap[date] = { income: 0, expense: 0 };
        
        if (tx.type === "收入") dateMap[date].income += amount;
        else if (tx.type === "支出") dateMap[date].expense += amount;
    });

    return {
        pieData: categoryMap,
        trendData: dateMap
    };
}