// js/services/repository.js
import { LocalDB } from "./storage/localDB.js";
import { CloudDB } from "./storage/cloudDB.js";
import { AuthState } from "./auth.js";

// 🔥 新增 'budgets'
const STORE_CONFIG = {
    'transactions': 'id',
    'accounts': 'id',
    'categories': 'id',
    'tags': 'id',
    'portfolio': 'id',
    'recurring_rules': 'id',
    'templates': 'id',
    'asset_history': 'date',
    'budgets': 'id' 
};

const LAYOUT_KEYS = ['dashboard_current_layout', 'dashboard_custom_layouts'];

export async function syncUp() {
    const { user, isPremium } = AuthState;
    if (!user || !isPremium) throw new Error("僅限 PRO 會員使用雲端同步功能");

    console.log("開始上傳至雲端...");
    for (const store of Object.keys(STORE_CONFIG)) {
        const keyField = STORE_CONFIG[store];
        const localData = await LocalDB.getAll(store);
        if (localData.length > 0) {
            await CloudDB.overwriteStore(user.uid, store, localData, keyField);
            console.log(`[${store}] 已上傳 ${localData.length} 筆`);
        }
    }

    const layoutItems = [];
    for (const key of LAYOUT_KEYS) {
        const rawValue = localStorage.getItem(key);
        if (rawValue) layoutItems.push({ id: key, data: JSON.parse(rawValue) });
    }
    if (layoutItems.length > 0) {
        await CloudDB.overwriteStore(user.uid, 'layouts', layoutItems, 'id');
    }
    
    localStorage.setItem('last_sync_time', new Date().toLocaleString());
    return true;
}

export async function syncDown() {
    const { user, isPremium } = AuthState;
    if (!user || !isPremium) throw new Error("僅限 PRO 會員使用雲端同步功能");

    console.log("開始從雲端下載...");
    for (const store of Object.keys(STORE_CONFIG)) {
        const keyField = STORE_CONFIG[store];
        const cloudData = await CloudDB.getAll(user.uid, store, keyField);
        
        await LocalDB.clearStore(store);
        
        if (cloudData.length > 0) {
            await LocalDB.importStore(store, cloudData);
            console.log(`[${store}] 已下載 ${cloudData.length} 筆`);
        }
    }

    const cloudLayouts = await CloudDB.getAll(user.uid, 'layouts', 'id');
    cloudLayouts.forEach(item => {
        if (LAYOUT_KEYS.includes(item.id) && item.data) {
            localStorage.setItem(item.id, JSON.stringify(item.data));
        }
    });

    localStorage.setItem('last_sync_time', new Date().toLocaleString());
    return true;
}