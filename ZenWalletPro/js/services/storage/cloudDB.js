// js/services/storage/cloudDB.js
import { db } from "../../config.js";
import { collection, doc, getDocs, writeBatch, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export const CloudDB = {
    // 取得某個集合的所有資料
    async getAll(uid, storeName) {
        if (!uid) throw new Error("User not authenticated");
        const q = query(collection(db, "users", uid, storeName));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data());
    },

    // 批量覆蓋上傳 (Sync Up)
    // 策略：直接用 Local 資料覆蓋 Cloud 資料 (簡單且避免衝突)
    async overwriteStore(uid, storeName, items) {
        if (!uid) throw new Error("User not authenticated");
        
        // Firestore Batch 最多 500 筆，需分批處理
        const BATCH_SIZE = 450; 
        const chunks = [];
        
        for (let i = 0; i < items.length; i += BATCH_SIZE) {
            chunks.push(items.slice(i, i + BATCH_SIZE));
        }

        for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach(item => {
                const docRef = doc(db, "users", uid, storeName, item.id);
                batch.set(docRef, item);
            });
            await batch.commit();
        }
    }
};