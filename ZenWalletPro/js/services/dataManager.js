import { LocalDB } from "./storage/localDB.js";

const STORES = ['transactions', 'accounts', 'categories', 'tags', 'portfolio', 'recurring_rules'];

// 匯出所有資料
export async function exportAllData() {
    const exportData = {};
    for (const store of STORES) {
        exportData[store] = await LocalDB.getAll(store);
    }
    
    // 加入 metadata
    exportData.meta = {
        version: 1,
        exportedAt: new Date().toISOString()
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `zenwallet_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// 匯入資料 (覆蓋模式)
export async function importData(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.meta) throw new Error("無效的備份檔案");

                // 清空並寫入
                for (const store of STORES) {
                    if (data[store]) {
                        await LocalDB.clearStore(store);
                        await LocalDB.importStore(store, data[store]);
                    }
                }
                resolve(true);
            } catch (err) {
                reject(err);
            }
        };
        reader.readAsText(file);
    });
}