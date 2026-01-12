// js/services/repository.js
import { LocalDB } from "./storage/localDB.js";
import { CloudDB } from "./storage/cloudDB.js";
import { AuthState } from "./auth.js";

const STORES = ['transactions', 'accounts', 'categories', 'tags', 'portfolio', 'recurring_rules'];

// 上傳：本地 -> 雲端 (覆蓋)
export async function syncUp() {
    const { user, isPremium } = AuthState;
    if (!user || !isPremium) throw new Error("僅限 PRO 會員使用雲端同步功能");

    console.log("開始上傳至雲端...");
    
    // 依序上傳每個 Store
    for (const store of STORES) {
        const localData = await LocalDB.getAll(store);
        if (localData.length > 0) {
            await CloudDB.overwriteStore(user.uid, store, localData);
            console.log(`[${store}] 已上傳 ${localData.length} 筆`);
        }
    }
    
    // 更新同步時間
    localStorage.setItem('last_sync_time', new Date().toLocaleString());
    return true;
}

// 下載：雲端 -> 本地 (覆蓋)
export async function syncDown() {
    const { user, isPremium } = AuthState;
    if (!user || !isPremium) throw new Error("僅限 PRO 會員使用雲端同步功能");

    console.log("開始從雲端下載...");

    for (const store of STORES) {
        const cloudData = await CloudDB.getAll(user.uid, store);
        
        // 只有當雲端有資料時才覆蓋本地，避免誤刪
        if (cloudData.length > 0) {
            await LocalDB.clearStore(store);
            await LocalDB.importStore(store, cloudData);
            console.log(`[${store}] 已下載 ${cloudData.length} 筆`);
        }
    }

    localStorage.setItem('last_sync_time', new Date().toLocaleString());
    return true;
}