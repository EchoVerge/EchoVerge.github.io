/**
 * assets/js/modules/historyManager.js
 * 負責管理歷史紀錄：存檔、讀檔、刪除
 * 使用 localStorage 作為儲存媒介
 */

const STORAGE_KEY = 'worksheet_history_v1';

// 1. 儲存紀錄 (自動或手動)
export function saveHistory(questions, title = '未命名存檔') {
    if (!questions || questions.length === 0) return;

    const record = {
        id: 'hist_' + Date.now(), // 使用時間戳記當作唯一 ID
        timestamp: Date.now(),
        dateStr: new Date().toLocaleString(),
        title: title,
        count: questions.length,
        data: questions // 完整題目資料
    };

    // 讀取舊資料 -> 加入新資料 -> 存回
    const list = getHistoryList();
    list.unshift(record); // 新的放最前面
    
    // 限制只留最近 20 筆 (避免吃光瀏覽器容量)
    if (list.length > 20) list.pop();

    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    console.log(`[History] Saved: ${title}`);
}

// 2. 取得紀錄列表 (不含詳細 data 以節省記憶體，若資料量大可拆開存)
// 這裡為了簡單，我們假設資料量不大，直接存一起
export function getHistoryList() {
    const json = localStorage.getItem(STORAGE_KEY);
    return json ? JSON.parse(json) : [];
}

// 3. 讀取特定紀錄 (在這裡跟 getHistoryList 一樣，因為我們是存整包)
export function loadHistory(id) {
    const list = getHistoryList();
    return list.find(item => item.id === id);
}

// 4. 刪除紀錄
export function deleteHistory(id) {
    let list = getHistoryList();
    list = list.filter(item => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}