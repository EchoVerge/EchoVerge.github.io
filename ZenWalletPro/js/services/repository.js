// js/services/repository.js
import { LocalDB } from "./storage/localDB.js";
import { CloudDB } from "./storage/cloudDB.js";
import { AuthState } from "./auth.js";

// 定義每個 Store 的主鍵欄位
const STORE_CONFIG = {
    'transactions': 'id',
    'accounts': 'id',
    'categories': 'id',
    'tags': 'id',
    'portfolio': 'id',
    'recurring_rules': 'id',
    'templates': 'id',
    'asset_history': 'date' // 🔥 這是唯一不同的
};

// 上傳：本地 -> 雲端
export async function syncUp() {
    const { user, isPremium } = AuthState;
    if (!user || !isPremium) throw new Error("僅限 PRO 會員使用雲端同步功能");

    console.log("開始上傳至雲端...");
    
    const stores = Object.keys(STORE_CONFIG);

    for (const store of stores) {
        const keyField = STORE_CONFIG[store]; // 取得該表的主鍵名稱
        const localData = await LocalDB.getAll(store);
        
        if (localData.length > 0) {
            // 🔥 傳入 keyField
            await CloudDB.overwriteStore(user.uid, store, localData, keyField);
            console.log(`[${store}] 已上傳 ${localData.length} 筆`);
        }
    }
    
    localStorage.setItem('last_sync_time', new Date().toLocaleString());
    return true;
}

// 下載：雲端 -> 本地
export async function syncDown() {
    const { user, isPremium } = AuthState;
    if (!user || !isPremium) throw new Error("僅限 PRO 會員使用雲端同步功能");

    console.log("開始從雲端下載...");

    const stores = Object.keys(STORE_CONFIG);

    for (const store of stores) {
        const keyField = STORE_CONFIG[store]; // 取得該表的主鍵名稱
        
        // 🔥 傳入 keyField 以便正確還原資料結構
        const cloudData = await CloudDB.getAll(user.uid, store, keyField);
        
        if (cloudData.length > 0) {
            await LocalDB.clearStore(store);
            await LocalDB.importStore(store, cloudData);
            console.log(`[${store}] 已下載 ${cloudData.length} 筆`);
        }
    }

    localStorage.setItem('last_sync_time', new Date().toLocaleString());
    return true;
}