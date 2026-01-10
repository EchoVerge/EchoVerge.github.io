/**
 * 檔案處理模組：統一處理 CSV 與 Excel
 */

/**
 * 統一入口：讀取檔案並回傳 JSON 資料
 * @param {File} file 
 * @returns {Promise<Array>}
 */
export async function parseFile(file) {
    const filename = file.name.toLowerCase();
    
    if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
        return await readExcel(file);
    } else if (filename.endsWith('.csv')) {
        return await parseCSV(file);
    } else {
        throw new Error("不支援的檔案格式，請上傳 .xlsx 或 .csv");
    }
}

/**
 * 內部函式：使用 SheetJS 讀取 Excel
 */
function readExcel(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // 預設讀取第一個工作表
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // 轉為 JSON
                const jsonData = XLSX.utils.sheet_to_json(worksheet);
                resolve(jsonData);
            } catch (error) {
                reject(new Error("Excel 解析失敗：" + error.message));
            }
        };
        
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
}

/**
 * 內部函式：使用 PapaParse 讀取 CSV
 */
function parseCSV(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (results.errors.length > 0) {
                    console.warn("CSV 解析警告:", results.errors);
                }
                resolve(results.data);
            },
            error: (err) => reject(err)
        });
    });
}