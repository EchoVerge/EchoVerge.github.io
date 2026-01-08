// 強制使用本地時間格式化日期 (YYYY-MM-DD)
// 解決 UTC 時區導致早上 8 點前日期會少一天的問題
export function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 取得 ISO 週次 (以週四為基準)
export function getWeekNumber(d) {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    // January 4th is always in week 1 (ISO 8601)
    const week1 = new Date(date.getFullYear(), 0, 4);
    // Calculate full weeks to nearest Thursday
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

// 取得該週的鍵值 (YYYY-MM-DD)，用於統計歸類
// 邏輯：將日期推回該週的週日，並格式化為字串
export function getWeekKey(d) {
    const target = new Date(d);
    // 這裡也要確保不會因為時區問題跑掉，使用 setDate 操作本地時間是安全的
    target.setDate(target.getDate() - target.getDay());
    return formatDate(target);
}