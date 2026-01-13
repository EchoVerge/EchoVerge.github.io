/**
 * assets/js/modules/historyManager.js
 * V3.1: 支援備份與還原 (修正 db 未定義問題)
 */
import { db, saveHistoryToDB, getHistoryFromDB, loadHistoryFromDB, deleteHistoryFromDB, renameHistoryInDB, updateHistoryInDB } from './db.js';

// 1. 儲存新紀錄
export async function saveHistory(questions, title) {
    if (!questions || !questions.length) return null;
    return await saveHistoryToDB(questions, title);
}

// 2. 更新現有紀錄
export async function updateHistory(id, questions, title) {
    if(!id) return false;
    try {
        await updateHistoryInDB(id, questions, title);
        return true;
    } catch(e) {
        console.error("Update failed:", e);
        return false;
    }
}

// 3. 取得歷史列表
export async function getHistoryList() {
    return await getHistoryFromDB();
}

// 4. 讀取單一紀錄
export async function loadHistory(id) {
    return await loadHistoryFromDB(id);
}

// 5. 刪除紀錄
export async function deleteHistory(id) {
    return await deleteHistoryFromDB(id);
}

// 6. 重新命名
export async function renameHistory(id, newTitle) {
    return await renameHistoryInDB(id, newTitle);
}

// --- [新增] 供 jsonBackupManager 使用的介面 ---

// 7. 取得所有歷史紀錄 (備份用)
export async function getAllHistoryForBackup() {
    // 這裡使用到了 db，所以上方必須 import { db ... }
    return await db.history.toArray();
}

// 8. 還原歷史紀錄 (匯入用)
export async function restoreHistoryFromBackup(historyList) {
    if (!historyList || !Array.isArray(historyList) || historyList.length === 0) return;
    
    // 過濾掉格式不正確的資料
    const validRecords = historyList.filter(item => item.title && item.data);
    
    try {
        // 使用 bulkPut：若 ID 衝突則覆蓋 (更新)，若無 ID 則新增
        await db.history.bulkPut(validRecords);
        console.log(`成功還原 ${validRecords.length} 筆資料`);
    } catch (error) {
        console.error("還原失敗:", error);
        throw error;
    }
}