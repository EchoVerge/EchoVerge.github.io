// js/services/history.js
import { LocalDB } from "./storage/localDB.js";

const STORE = 'asset_history';

// 記錄今天的總資產 (若存在則覆蓋)
export async function recordDailySnapshot(totalAmount) {
    const today = new Date().toISOString().split('T')[0];
    await LocalDB.update(STORE, today, {
        date: today,
        total: parseFloat(totalAmount),
        updatedAt: new Date().toISOString()
    });
}

// 取得最近 N 天的歷史資料 (用於畫圖)
export async function getHistory(days = 30) {
    const all = await LocalDB.getAll(STORE);
    // 排序 date ASC
    return all.sort((a, b) => a.date.localeCompare(b.date)).slice(-days);
}