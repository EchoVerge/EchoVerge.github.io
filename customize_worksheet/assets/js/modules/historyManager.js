/**
 * assets/js/modules/historyManager.js
 * V2.1: 支援 updateHistory (儲存) 與 saveHistory 回傳 ID
 */

const HISTORY_KEY = 'worksheet_history';

// [修改] 儲存新紀錄 (回傳新 ID)
export function saveHistory(questions, title) {
    if (!questions || !questions.length) return null;
    
    const newItem = {
        id: Date.now().toString(),
        title: title || '未命名試卷',
        date: Date.now(),
        dateStr: new Date().toLocaleString('zh-TW', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }),
        count: questions.length,
        data: questions
    };

    const list = getHistoryList();
    list.unshift(newItem); // 最新在最前
    
    // 限制只存最近 20 筆
    if (list.length > 20) list.pop();
    
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    return newItem.id; // [重要] 回傳 ID 供控制器追蹤
}

// [新增] 更新現有紀錄
export function updateHistory(id, questions, title) {
    let list = getHistoryList();
    const index = list.findIndex(item => item.id === id);
    
    if (index !== -1) {
        // 更新內容
        list[index].data = questions;
        list[index].title = title || list[index].title;
        list[index].count = questions.length;
        list[index].date = Date.now();
        list[index].dateStr = new Date().toLocaleString('zh-TW', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
        
        // 將更新的項目移到最上方
        const item = list.splice(index, 1)[0];
        list.unshift(item);
        
        localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
        return true;
    }
    return false; // 找不到 ID (可能已被刪除)
}

export function getHistoryList() {
    try {
        const str = localStorage.getItem(HISTORY_KEY);
        return str ? JSON.parse(str) : [];
    } catch (e) {
        return [];
    }
}

export function loadHistory(id) {
    const list = getHistoryList();
    return list.find(item => item.id === id);
}

export function deleteHistory(id) {
    let list = getHistoryList();
    list = list.filter(item => item.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

export function renameHistory(id, newTitle) {
    let list = getHistoryList();
    const index = list.findIndex(item => item.id === id);
    if (index !== -1) {
        list[index].title = newTitle;
        localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
        return true;
    }
    return false;
}