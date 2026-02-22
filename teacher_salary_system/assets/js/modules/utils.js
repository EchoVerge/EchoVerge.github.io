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

// 根據班級名稱的字串計算出固定的顏色
const classColors = [
    '#dc3545', // 紅色系 (Red)
    '#fd7e14', // 橘色系 (Orange)
    '#ffc107', // 黃色系 (Yellow)
    '#198754', // 綠色系 (Green)
    '#0d6efd', // 藍色系 (Blue)
    '#6f42c1', // 紫色系 (Purple)
    '#6c757d'  // 灰色系 (Gray)
];

export function getClassColor(className) {
    if (!className) return "#6c757d"; // 空白班級預設為灰色
    let hash = 0;
    for (let i = 0; i < className.length; i++) {
        hash = className.charCodeAt(i) + ((hash << 5) - hash);
    }
    // 根據字串 hash 值從色卡中挑選一個顏色
    return classColors[Math.abs(hash) % classColors.length];
}

// 計算標籤的衍生顏色 (改變色相與亮度)
export function getTagColorVariation(hex, tag) {
    if (!tag) return hex;

    // 將標籤字串轉為數字 Hash
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
        hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }

    // HEX 轉 RGB
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;

    // RGB 轉 HSL
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max !== min) {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    } else {
        h = s = 0;
    }

    // 依據 Hash 微調色相 (Hue) +/- 20度，產生同色系但不同的視覺
    let hueOffset = (Math.abs(hash) % 40) - 20;
    h = (h * 360 + hueOffset) % 360;
    if (h < 0) h += 360;

    // 依據 Hash 微調亮度 (Lightness) +/- 15%，限制在 25%~75% 確保字體可見
    let lightOffset = ((Math.abs(hash >> 2) % 30) - 15) / 100;
    l = Math.max(0.25, Math.min(0.75, l + lightOffset));

    return `hsl(${h}, ${s * 100}%, ${l * 100}%)`;
}