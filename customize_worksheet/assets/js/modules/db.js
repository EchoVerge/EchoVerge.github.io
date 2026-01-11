/**
 * assets/js/modules/db.js
 * 使用 Dexie.js 管理 IndexedDB，解決 LocalStorage 容量限制問題
 */

export const db = new Dexie('WorksheetDB');

// 定義資料庫版本與結構
db.version(1).stores({
    history: '++id, title, date' // id 自動遞增, 索引 title 和 date
});

export async function saveHistoryToDB(questions, title) {
    const record = {
        title: title || '未命名試卷',
        date: Date.now(),
        dateStr: new Date().toLocaleString('zh-TW', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }),
        count: questions.length,
        data: questions // 這裡可以存入包含 Base64 圖片的大型物件
    };
    return await db.history.add(record);
}

export async function updateHistoryInDB(id, questions, title) {
    // 確保 id 是數字 (Dexie 預設 id 為數字)
    const numericId = Number(id);
    return await db.history.update(numericId, {
        title: title,
        data: questions,
        count: questions.length,
        date: Date.now(),
        dateStr: new Date().toLocaleString('zh-TW', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })
    });
}

export async function getHistoryFromDB() {
    return await db.history.orderBy('date').reverse().toArray();
}

export async function loadHistoryFromDB(id) {
    return await db.history.get(Number(id));
}

export async function deleteHistoryFromDB(id) {
    return await db.history.delete(Number(id));
}

export async function renameHistoryInDB(id, newTitle) {
    return await db.history.update(Number(id), { title: newTitle });
}