// js/services/transaction.js
import { db } from "../config.js";
import { collection, addDoc, getDocs, deleteDoc, updateDoc, doc, query, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COLLECTION_NAME = "transactions";

/**
 * 新增交易
 * @param {Object} data - 交易資料表單物件
 */
export async function addTransaction(data) {
    try {
        const docRef = await addDoc(collection(db, COLLECTION_NAME), {
            date: Timestamp.fromDate(new Date(data.date)), // 轉為 Firestore Timestamp
            type: data.type,
            category: data.category,
            account: data.account,
            item: data.item,
            amount: parseFloat(data.amount),
            notes: data.notes || "",
            tags: data.tags || [], // 儲存為陣列
            createdAt: Timestamp.now()
        });
        return { success: true, id: docRef.id };
    } catch (e) {
        console.error("新增交易失敗:", e);
        throw e;
    }
}

/**
 * 讀取交易列表 (預設抓取全部，按日期降序)
 * 未來可以在這裡加入日期範圍篩選
 */
export async function getTransactions(filters = {}) {
    try {
        let q = query(collection(db, COLLECTION_NAME), orderBy("date", "desc"));
        
        // 如果有傳入 filters (例如篩選帳戶或類別)，可以在這裡擴充 where 條件
        // 目前先做基礎讀取
        
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                // 將 Timestamp 轉回 JS Date 物件方便前端處理
                jsDate: data.date.toDate(), 
                // 格式化日期字串 YYYY-MM-DD
                dateStr: data.date.toDate().toISOString().split('T')[0]
            };
        });
    } catch (e) {
        console.error("讀取交易失敗:", e);
        throw e;
    }
}

/**
 * 刪除交易
 */
export async function deleteTransaction(id) {
    try {
        await deleteDoc(doc(db, COLLECTION_NAME, id));
        return { success: true };
    } catch (e) {
        console.error("刪除交易失敗:", e);
        throw e;
    }
}

/**
 * 更新交易
 */
export async function updateTransaction(id, data) {
    try {
        const docRef = doc(db, COLLECTION_NAME, id);
        await updateDoc(docRef, {
            date: Timestamp.fromDate(new Date(data.date)),
            type: data.type,
            category: data.category,
            account: data.account,
            item: data.item,
            amount: parseFloat(data.amount),
            notes: data.notes || "",
            tags: data.tags || []
            // 注意：我們不更新 createdAt，保留原始建立時間
        });
        return { success: true };
    } catch (e) {
        console.error("更新交易失敗:", e);
        throw e;
    }
}