// js/services/storage/cloudDB.js
import { db } from "../../config.js";
import { collection, doc, getDocs, writeBatch, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export const CloudDB = {
    // 取得資料 (支援動態主鍵)
    async getAll(uid, storeName, keyField = 'id') {
        if (!uid) throw new Error("User not authenticated");
        
        // 🔥 修改路徑：users -> uid -> data -> ZenWalletPro -> storeName
        const q = query(collection(db, "users", uid, "data", "ZenWalletPro", storeName));
        const snapshot = await getDocs(q);
        
        // 確保回傳的資料一定包含主鍵
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                [keyField]: doc.id
            };
        });
    },

    // 批量覆蓋上傳 (支援動態主鍵)
    async overwriteStore(uid, storeName, items, keyField = 'id') {
        if (!uid) throw new Error("User not authenticated");
        
        const BATCH_SIZE = 450; 
        const chunks = [];
        
        for (let i = 0; i < items.length; i += BATCH_SIZE) {
            chunks.push(items.slice(i, i + BATCH_SIZE));
        }

        for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach(item => {
                const docId = item[keyField];
                if (!docId) return;

                // 🔥 修改路徑：users -> uid -> data -> ZenWalletPro -> storeName -> docId
                const docRef = doc(db, "users", uid, "data", "ZenWalletPro", storeName, String(docId));
                batch.set(docRef, item);
            });
            await batch.commit();
        }
    }
};