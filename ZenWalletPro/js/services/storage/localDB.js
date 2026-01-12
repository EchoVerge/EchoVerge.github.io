// js/services/storage/localDB.js
import { uuidv4 } from '../../utils/helpers.js';

const DB_NAME = 'ZenWalletDB';
const DB_VERSION = 2;

const dbPromise = idb.openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
        const stores = [
            'transactions', 'accounts', 'categories', 'tags', 'portfolio', 'recurring_rules',
            'templates',
            'asset_history'
        ];
        
        stores.forEach(name => {
            if (!db.objectStoreNames.contains(name)) {
                // 🔥 確保 asset_history 使用 date 作為主鍵
                if (name === 'asset_history') {
                    db.createObjectStore(name, { keyPath: 'date' });
                } else {
                    db.createObjectStore(name, { keyPath: 'id' });
                }
            }
        });
    }
});

export const LocalDB = {
    async getAll(storeName) { return (await dbPromise).getAll(storeName); },
    
    async get(storeName, id) { return (await dbPromise).get(storeName, id); },
    
    async add(storeName, data) {
        const db = await dbPromise;
        // 自動產生 ID (除了 asset_history)
        if (storeName !== 'asset_history' && !data.id) data.id = uuidv4();
        
        if (!data.createdAt) data.createdAt = new Date().toISOString();
        
        await db.put(storeName, data);
        return data.id || data.date;
    },
    
    async update(storeName, id, data) {
        const db = await dbPromise;
        const item = await db.get(storeName, id);
        
        // 針對 asset_history 的特殊處理 (允許 upsert)
        if (!item && storeName === 'asset_history') {
            await db.put(storeName, data);
            return data;
        }
        
        if (!item) throw new Error(`Item ${id} not found in ${storeName}`);
        
        const updatedItem = { ...item, ...data };
        await db.put(storeName, updatedItem);
        return updatedItem;
    },
    
    async delete(storeName, id) { return (await dbPromise).delete(storeName, id); },
    
    async importStore(storeName, items) {
        const db = await dbPromise;
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.store;
        
        // 平行寫入，但如果有錯會捕捉
        await Promise.all(items.map(item => {
            try {
                return store.put(item);
            } catch (e) {
                console.error(`[LocalDB] Import failed for item in ${storeName}:`, item, e);
                throw e; // 拋出錯誤以中斷 Promise
            }
        }));
        await tx.done;
    },
    
    async clearStore(storeName) { return (await dbPromise).clear(storeName); }
};