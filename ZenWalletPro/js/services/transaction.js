// js/services/transaction.js
import { db } from "../config.js";
import { collection, addDoc, getDocs, query, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COLLECTION_NAME = "transactions";

// 讀取交易
export async function getTransactions() {
    try {
        // 建立查詢：依照日期降序排列
        const q = query(collection(db, COLLECTION_NAME), orderBy("date", "desc"));
        const querySnapshot = await getDocs(q);
        
        const transactions = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Firestore 的 Timestamp 需要轉換回 Date 物件或字串
            transactions.push({
                id: doc.id,
                ...data,
                date: data.date.toDate().toISOString().split('T')[0] // 轉為 YYYY-MM-DD
            });
        });
        return transactions;
    } catch (e) {
        console.error("讀取交易失敗: ", e);
        return [];
    }
}

// 新增交易
export async function addTransaction(formData) {
    try {
        const docRef = await addDoc(collection(db, COLLECTION_NAME), {
            date: Timestamp.fromDate(new Date(formData.date)), // 轉為 Firestore Timestamp
            type: formData.type,
            category: formData.category,
            account: formData.account,
            item: formData.item,
            amount: parseFloat(formData.amount),
            notes: formData.notes,
            tags: formData.tags,
            createdAt: Timestamp.now()
        });
        return { success: true, id: docRef.id };
    } catch (e) {
        console.error("新增失敗: ", e);
        return { success: false, error: e.message };
    }
}