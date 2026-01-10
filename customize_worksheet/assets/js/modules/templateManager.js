/**
 * 範本管理模組：負責生成並下載範本檔案
 */

export function downloadStudentTemplate() {
    // 定義範本資料
    const data = [
        { "座號": "1", "姓名": "王小明", "錯題列表": "1, 3, 5" },
        { "座號": "2", "姓名": "李大華", "錯題列表": "2, 4, 6" },
        { "座號": "3", "姓名": "張三",   "錯題列表": "10" }
    ];

    generateAndDownloadExcel(data, "範本_學生選題表.xlsx");
}

export function downloadQuestionTemplate() {
    // 定義範本資料
    const data = [
        { "題號": "1", "題目": "1+1=?", "解析": "答案是2" },
        { "題號": "2", "題目": "計算 $$x^2=4$$", "解析": "$$x=\\pm 2$$" },
        { "題號": "3", "題目": "台灣最高的山?", "解析": "玉山" }
    ];

    generateAndDownloadExcel(data, "範本_題庫總表.xlsx");
}

/**
 * 通用工具：將 JSON 轉為 Excel 並觸發下載
 */
function generateAndDownloadExcel(jsonData, fileName) {
    if (!window.XLSX) {
        alert("Excel 元件尚未載入，請重新整理頁面。");
        return;
    }

    // 1. 建立工作表
    const worksheet = XLSX.utils.json_to_sheet(jsonData);
    
    // 2. 建立活頁簿
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

    // 3. 寫入檔案並下載
    XLSX.writeFile(workbook, fileName);
}