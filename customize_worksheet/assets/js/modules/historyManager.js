/**
 * assets/js/modules/historyManager.js
 * V2.0: 管理出題歷史紀錄 (新增：重新命名功能)
 */

const HISTORY_KEY = 'worksheet_history';

export function saveHistory(questions, title) {
    if (!questions || !questions.length) return;
    
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

// [新增] 改名功能
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