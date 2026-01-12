// js/services/repository.js
import { LocalDB } from "./storage/localDB.js";
import { CloudDB } from "./storage/cloudDB.js";
import { AuthState } from "./auth.js";

// 🔥 加入新 Store
const STORES = ['transactions', 'accounts', 'categories', 'tags', 'portfolio', 'recurring_rules', 'templates', 'asset_history'];

export async function syncUp() {
    const { user, isPremium } = AuthState;
    if (!user || !isPremium) throw new Error("僅限 PRO 會員使用雲端同步功能");

    console.log("開始上傳至雲端...");
    for (const store of STORES) {
        const localData = await LocalDB.getAll(store);
        if (localData.length > 0) {
            await CloudDB.overwriteStore(user.uid, store, localData);
            console.log(`[${store}] 已上傳 ${localData.length} 筆`);
        }
    }
    localStorage.setItem('last_sync_time', new Date().toLocaleString());
    return true;
}

export async function syncDown() {
    const { user, isPremium } = AuthState;
    if (!user || !isPremium) throw new Error("僅限 PRO 會員使用雲端同步功能");

    console.log("開始從雲端下載...");
    for (const store of STORES) {
        const cloudData = await CloudDB.getAll(user.uid, store);
        if (cloudData.length > 0) {
            await LocalDB.clearStore(store);
            await LocalDB.importStore(store, cloudData);
            console.log(`[${store}] 已下載 ${cloudData.length} 筆`);
        }
    }
    localStorage.setItem('last_sync_time', new Date().toLocaleString());
    return true;
}