// js/services/storage/localDB.js
import { uuidv4 } from '../../utils/helpers.js';

const DB_NAME = 'ZenWalletDB';
const DB_VERSION = 1;

// 初始化 DB
const dbPromise = idb.openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
        // 建立所需的 Object Stores
        const stores = [
            'transactions', 
            'accounts', 
            'categories', 
            'tags', 
            'portfolio', 
            'recurring_rules'
        ];
        
        stores.forEach(name => {
            if (!db.objectStoreNames.contains(name)) {
                db.createObjectStore(name, { keyPath: 'id' });
            }
        });
    }
});

export const LocalDB = {
    async getAll(storeName) {
        const db = await dbPromise;
        return db.getAll(storeName);
    },

    async get(storeName, id) {
        const db = await dbPromise;
        return db.get(storeName, id);
    },

    async add(storeName, data) {
        const db = await dbPromise;
        // 如果資料沒有 ID，自動產生
        if (!data.id) {
            data.id = uuidv4();
        }
        // 加入 createdAt 時間戳記 (若無)
        if (!data.createdAt) {
            data.createdAt = new Date().toISOString();
        }
        await db.put(storeName, data);
        return data.id; // 回傳 ID 以符合原本 Service 的行為
    },

    async update(storeName, id, data) {
        const db = await dbPromise;
        const item = await db.get(storeName, id);
        if (!item) throw new Error(`Item ${id} not found in ${storeName}`);
        
        const updatedItem = { ...item, ...data };
        await db.put(storeName, updatedItem);
        return updatedItem;
    },

    async delete(storeName, id) {
        const db = await dbPromise;
        return db.delete(storeName, id);
    },

    // 批量寫入 (用於匯入)
    async importStore(storeName, items) {
        const db = await dbPromise;
        const tx = db.transaction(storeName, 'readwrite');
        await Promise.all(items.map(item => tx.store.put(item)));
        await tx.done;
    },

    // 清空 Store
    async clearStore(storeName) {
        const db = await dbPromise;
        return db.clear(storeName);
    }
};