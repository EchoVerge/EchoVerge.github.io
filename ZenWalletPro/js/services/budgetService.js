// js/services/budgetService.js
import { LocalDB } from "./storage/localDB.js";
import { getTransactions } from "./transaction.js"; // 需讀取交易來計算
import { uuidv4 } from "../utils/helpers.js";

const STORE = 'budgets';

// 取得所有預算設定
export async function getBudgets() {
    return await LocalDB.getAll(STORE);
}

// 新增預算
export async function addBudget(data) {
    const budget = {
        id: uuidv4(),
        name: data.name,
        targetCategory: data.targetCategory, // "ALL" 或 特定類別名稱
        amount: parseFloat(data.amount),
        period: 'monthly', // 目前鎖定每月
        createdAt: new Date().toISOString()
    };
    return await LocalDB.add(STORE, budget);
}

// 刪除預算
export async function deleteBudget(id) {
    return await LocalDB.delete(STORE, id);
}

/**
 * 🔥 核心運算：計算每個預算的目前狀態
 * 回傳陣列：[{ name, limit, spent, remaining, percent, status }, ...]
 */
export async function calculateBudgetStatus() {
    const [budgets, transactions] = await Promise.all([
        getBudgets(),
        getTransactions()
    ]);

    if (budgets.length === 0) return [];

    // 1. 定義時間範圍 (本月 1 號 ~ 月底)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    // 2. 篩選本月支出交易 (排除轉帳與調整)
    const monthlyExpenses = transactions.filter(tx => 
        tx.type === '支出' && 
        tx.category !== '轉帳支出' && 
        tx.category !== '帳目調整' &&
        tx.dateStr >= startOfMonth.split('T')[0] && 
        tx.dateStr <= endOfMonth.split('T')[0]
    );

    // 3. 計算每個預算的執行狀況
    return budgets.map(b => {
        let spent = 0;

        if (b.targetCategory === 'ALL') {
            // 總預算：加總所有支出
            spent = monthlyExpenses.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
        } else {
            // 單項預算：只加總該類別
            spent = monthlyExpenses
                .filter(tx => tx.category === b.targetCategory)
                .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
        }

        const percent = (spent / b.amount) * 100;
        let status = 'success'; // 綠色
        if (percent >= 100) status = 'danger'; // 紅色 (超支)
        else if (percent >= 80) status = 'warning'; // 黃色 (警戒)

        return {
            id: b.id,
            name: b.name,
            limit: b.amount,
            spent: spent,
            remaining: b.amount - spent,
            percent: Math.min(percent, 100), // 進度條不超過 100%
            rawPercent: percent,
            status: status
        };
    });
}