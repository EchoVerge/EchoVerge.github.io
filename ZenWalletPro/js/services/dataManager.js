// js/services/dataManager.js
import { LocalDB } from "./storage/localDB.js";

// 定義要備份的 IndexedDB Stores
const STORES = [
    'transactions', 
    'accounts', 
    'categories', 
    'tags', 
    'portfolio', 
    'recurring_rules',
    'templates',
    'asset_history'
];

// 定義要備份的 LocalStorage Keys (版面配置)
const STORAGE_KEYS = [
    'dashboard_current_layout',
    'dashboard_custom_layouts'
];

// 匯出所有資料 (含版面)
export async function exportAllData() {
    const exportData = {};
    
    // 1. 抓取資料庫內容
    for (const store of STORES) {
        exportData[store] = await LocalDB.getAll(store);
    }
    
    // 2. 抓取版面配置 (LocalStorage)
    exportData.layouts = {};
    STORAGE_KEYS.forEach(key => {
        const value = localStorage.getItem(key);
        if (value) {
            exportData.layouts[key] = JSON.parse(value);
        }
    });
    
    // 3. 加入 Metadata
    exportData.meta = {
        version: 2, // 升級版本號
        exportedAt: new Date().toISOString(),
        platform: 'ZenWalletPro'
    };

    // 4. 下載檔案
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `zenwallet_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// 匯入資料 (含版面)
export async function importData(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.meta) throw new Error("無效的備份檔案");

                // 1. 還原資料庫
                for (const store of STORES) {
                    if (data[store]) {
                        await LocalDB.clearStore(store);
                        await LocalDB.importStore(store, data[store]);
                    }
                }

                // 2. 還原版面配置 (如果有)
                if (data.layouts) {
                    Object.keys(data.layouts).forEach(key => {
                        // 確保是我們允許的 key
                        if (STORAGE_KEYS.includes(key)) {
                            localStorage.setItem(key, JSON.stringify(data.layouts[key]));
                        }
                    });
                }

                resolve(true);
            } catch (err) {
                reject(err);
            }
        };
        reader.readAsText(file);
    });
}