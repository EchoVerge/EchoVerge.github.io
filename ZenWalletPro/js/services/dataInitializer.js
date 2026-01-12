// js/services/dataInitializer.js
import { db } from "../config.js";
import { collection, writeBatch, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS, DEFAULT_TAGS } from "../constants.js";

export async function initializeDefaultData() {
    const batch = writeBatch(db);

    // 準備寫入類別
    DEFAULT_CATEGORIES.forEach(cat => {
        const docRef = doc(collection(db, "categories"));
        batch.set(docRef, { ...cat, createdAt: new Date() });
    });

    // 準備寫入帳戶
    DEFAULT_ACCOUNTS.forEach(acc => {
        const docRef = doc(collection(db, "accounts"));
        batch.set(docRef, { ...acc, createdAt: new Date() });
    });

    // 準備寫入標籤
    DEFAULT_TAGS.forEach(tag => {
        const docRef = doc(collection(db, "tags"));
        batch.set(docRef, { ...tag, createdAt: new Date() });
    });

    // 一次性提交所有寫入 (Transaction)
    await batch.commit();
}