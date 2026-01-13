/**
 * assets/js/modules/historyManager.js
 * V3.0: 升級為 IndexedDB (Dexie) 存取，支援圖片儲存
 */
import { saveHistoryToDB, getHistoryFromDB, loadHistoryFromDB, deleteHistoryFromDB, renameHistoryInDB, updateHistoryInDB } from './db.js';

// 為了保持與 EditorController 的相容性，我們維持函式名稱不變
// 但請注意：現在這些函式都是 async (非同步)，回傳的是 Promise

// 1. 儲存新紀錄
export async function saveHistory(questions, title) {
    if (!questions || !questions.length) return null;
    // 轉發給 db.js 處理
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

// 4. 讀取單一紀錄 (含完整資料/圖片)
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

// 7. 取得所有歷史紀錄 (供備份用)
export async function getAllHistoryForBackup() {
    // 假設 db.history 是您的 Table 名稱
    return await db.history.toArray();
}

// 8. 還原歷史紀錄 (供匯入用)
export async function restoreHistoryFromBackup(historyList) {
    // 策略：使用 bulkPut (如果 ID 相同則覆蓋，不同則新增)
    // 為了安全起見，也可以選擇先清空再寫入 (db.history.clear())，視您的需求而定
    // 這裡採用「合併/覆蓋」模式
    if (!historyList || historyList.length === 0) return;
    
    // 過濾掉不合法的資料
    const validRecords = historyList.filter(item => item.id && item.data);
    
    await db.history.bulkPut(validRecords);
}