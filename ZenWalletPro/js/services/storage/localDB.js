// js/services/storage/localDB.js
import { uuidv4 } from '../../utils/helpers.js';

const DB_NAME = 'ZenWalletDB';
const DB_VERSION = 2; // 🔥 升級版本號

const dbPromise = idb.openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
        // 既有的 store
        const stores = [
            'transactions', 'accounts', 'categories', 'tags', 'portfolio', 'recurring_rules',
            'templates',      // 🔥 新增：快速記帳模版
            'asset_history'   // 🔥 新增：資產淨值歷史
        ];
        
        stores.forEach(name => {
            if (!db.objectStoreNames.contains(name)) {
                // asset_history 使用 date (YYYY-MM-DD) 作為 key 可能更好，但為了統一用 id 也可以
                // 這裡我們用 date 作為 keyPath 方便查詢
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
        if (storeName !== 'asset_history' && !data.id) data.id = uuidv4();
        if (!data.createdAt) data.createdAt = new Date().toISOString();
        await db.put(storeName, data);
        return data.id || data.date;
    },
    async update(storeName, id, data) {
        const db = await dbPromise;
        const item = await db.get(storeName, id);
        if (!item) {
            // 如果是 history，允許直接寫入 (Upsert)
            if (storeName === 'asset_history') {
                await db.put(storeName, data);
                return data;
            }
            throw new Error(`Item ${id} not found in ${storeName}`);
        }
        const updatedItem = { ...item, ...data };
        await db.put(storeName, updatedItem);
        return updatedItem;
    },
    async delete(storeName, id) { return (await dbPromise).delete(storeName, id); },
    async importStore(storeName, items) {
        const db = await dbPromise;
        const tx = db.transaction(storeName, 'readwrite');
        await Promise.all(items.map(item => tx.store.put(item)));
        await tx.done;
    },
    async clearStore(storeName) { return (await dbPromise).clear(storeName); }
};