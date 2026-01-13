// js/services/history.js
import { LocalDB } from "./storage/localDB.js";

const STORE = 'asset_history';

// 記錄今日資產快照 (Upsert: 同一天重複呼叫會更新數值)
export async function recordDailySnapshot(totalAmount) {
    const today = new Date().toISOString().split('T')[0];
    // 檢查是否已有今日紀錄，若有則更新，若無則新增
    // 雖然 LocalDB.update 會處理，但這裡確保資料完整性
    await LocalDB.update(STORE, today, { date: today, total: totalAmount });
}

// 取得最近 N 筆 (預設，給首頁圖表用)
export async function getHistory(limit = 30) {
    const all = await LocalDB.getAll(STORE);
    all.sort((a, b) => a.date.localeCompare(b.date));
    return all.slice(-limit);
}

// 🔥 新增：取得指定日期範圍的歷史紀錄 (給篩選器用)
export async function getHistoryByRange(startDate, endDate) {
    const all = await LocalDB.getAll(STORE);
    
    // 排序
    all.sort((a, b) => a.date.localeCompare(b.date));

    // 如果沒有指定範圍，回傳全部
    if (!startDate || !endDate) {
        return all;
    }

    // 篩選範圍
    return all.filter(h => h.date >= startDate && h.date <= endDate);
}