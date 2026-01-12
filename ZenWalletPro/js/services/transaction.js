// js/services/transaction.js
import { db } from "../config.js";
import { collection, addDoc, getDocs, deleteDoc, updateDoc, doc, query, orderBy, Timestamp, writeBatch, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// 轉帳功能 (一次寫入兩筆：支出 + 收入)
export async function addTransfer(data) {
    const batch = writeBatch(db);
    const dateTs = Timestamp.fromDate(new Date(data.date));
    const createdTs = Timestamp.now();

    // 1. 支出紀錄 (從 A 帳戶扣款)
    const expenseRef = doc(collection(db, COLLECTION_NAME));
    batch.set(expenseRef, {
        date: dateTs,
        type: "支出",
        category: "轉帳支出",
        account: data.fromAccount,
        item: `轉帳至 ${data.toAccount}`,
        amount: parseFloat(data.amount),
        notes: data.notes || "",
        tags: ["#轉帳"],
        createdAt: createdTs
    });

    // 2. 收入紀錄 (存入 B 帳戶)
    const incomeRef = doc(collection(db, COLLECTION_NAME));
    batch.set(incomeRef, {
        date: dateTs,
        type: "收入",
        category: "轉帳收入",
        account: data.toAccount,
        item: `從 ${data.fromAccount} 轉入`,
        amount: parseFloat(data.amount),
        notes: data.notes || "",
        tags: ["#轉帳"],
        createdAt: createdTs
    });

    await batch.commit();
    return { success: true };
}

// 帳目核對功能 (自動產生一筆調整交易)
export async function addAdjustment(data) {
    // data 包含: account, currentBalance, actualBalance
    const diff = parseFloat(data.actualBalance) - parseFloat(data.currentBalance);
    
    // 如果差額極小，不處理
    if (Math.abs(diff) < 0.01) return { success: true, message: "餘額正確，無需調整" };

    const type = diff > 0 ? "收入" : "支出";
    const amount = Math.abs(diff);
    
    await addTransaction({
        date: new Date().toISOString().split('T')[0], // 今天
        type: type,
        category: "帳目調整",
        account: data.account,
        item: "帳目核對調整",
        amount: amount,
        notes: `系統計算: ${data.currentBalance}, 實際: ${data.actualBalance}`,
        tags: ["#調整"]
    });

    return { success: true, message: "已新增調整紀錄" };
}