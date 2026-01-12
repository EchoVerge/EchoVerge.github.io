// js/services/category.js
import { db } from "../config.js";
import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COLLECTION_NAME = "categories";

// 讀取所有類別
export async function getCategories() {
    try {
        const q = query(collection(db, COLLECTION_NAME), orderBy("createdAt", "asc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("讀取類別失敗:", e);
        throw e;
    }
}

// 新增類別
export async function addCategory(name, type) {
    if (!name || !type) throw new Error("名稱與類型不可為空");
    try {
        const docRef = await addDoc(collection(db, COLLECTION_NAME), {
            name,
            type,
            createdAt: serverTimestamp()
        });
        return docRef.id;
    } catch (e) {
        console.error("新增類別失敗:", e);
        throw e;
    }
}

// 刪除類別
export async function deleteCategory(id) {
    try {
        await deleteDoc(doc(db, COLLECTION_NAME, id));
    } catch (e) {
        console.error("刪除類別失敗:", e);
        throw e;
    }
}