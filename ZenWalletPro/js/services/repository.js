// js/services/repository.js
import { LocalDB } from "./storage/localDB.js";
import { CloudDB } from "./storage/cloudDB.js";
import { AuthState } from "./auth.js";

const STORE_CONFIG = {
    'transactions': 'id',
    'accounts': 'id',
    'categories': 'id',
    'tags': 'id',
    'portfolio': 'id',
    'recurring_rules': 'id',
    'templates': 'id',
    'asset_history': 'date'
};

const LAYOUT_KEYS = ['dashboard_current_layout', 'dashboard_custom_layouts'];

// 上傳：本地 -> 雲端 (包含資料庫與版面配置)
export async function syncUp() {
    const { user, isPremium } = AuthState;
    if (!user || !isPremium) throw new Error("僅限 PRO 會員使用雲端同步功能");

    console.log("開始上傳至雲端...");
    
    // 1. 同步 IndexedDB 資料
    const stores = Object.keys(STORE_CONFIG);
    for (const store of stores) {
        const keyField = STORE_CONFIG[store];
        const localData = await LocalDB.getAll(store);
        
        if (localData.length > 0) {
            await CloudDB.overwriteStore(user.uid, store, localData, keyField);
            console.log(`[${store}] 已上傳 ${localData.length} 筆`);
        }
    }

    // 2. 同步 LocalStorage 版面配置
    const layoutItems = [];
    for (const key of LAYOUT_KEYS) {
        const rawValue = localStorage.getItem(key);
        if (rawValue) {
            try {
                layoutItems.push({ id: key, data: JSON.parse(rawValue) });
            } catch (e) { console.warn(`[Layout] Parse error for ${key}`, e); }
        }
    }
    if (layoutItems.length > 0) {
        await CloudDB.overwriteStore(user.uid, 'layouts', layoutItems, 'id');
        console.log(`[layouts] 已上傳 ${layoutItems.length} 筆版面設定`);
    }
    
    localStorage.setItem('last_sync_time', new Date().toLocaleString());
    return true;
}

// 下載：雲端 -> 本地 (強制覆蓋)
export async function syncDown() {
    const { user, isPremium } = AuthState;
    if (!user || !isPremium) throw new Error("僅限 PRO 會員使用雲端同步功能");

    console.log("開始從雲端下載...");

    const stores = Object.keys(STORE_CONFIG);

    // 1. 資料庫部分
    for (const store of stores) {
        const keyField = STORE_CONFIG[store];
        const cloudData = await CloudDB.getAll(user.uid, store, keyField);
        
        // 🔥 關鍵修正：無論雲端有沒有資料，都先清空本地，確保是「覆蓋」而不是「合併」
        await LocalDB.clearStore(store);
        
        if (cloudData.length > 0) {
            await LocalDB.importStore(store, cloudData);
            console.log(`[${store}] 已下載 ${cloudData.length} 筆`);
        } else {
            console.log(`[${store}] 雲端無資料，本地已清空`);
        }
    }

    // 2. 版面配置部分
    const cloudLayouts = await CloudDB.getAll(user.uid, 'layouts', 'id');
    if (cloudLayouts.length > 0) {
        cloudLayouts.forEach(item => {
            if (LAYOUT_KEYS.includes(item.id) && item.data) {
                localStorage.setItem(item.id, JSON.stringify(item.data));
            }
        });
        console.log(`[layouts] 已下載 ${cloudLayouts.length} 筆版面設定`);
    }

    localStorage.setItem('last_sync_time', new Date().toLocaleString());
    return true;
}