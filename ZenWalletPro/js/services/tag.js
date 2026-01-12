// js/services/tag.js
import { db } from "../config.js";
import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COLLECTION_NAME = "tags";

export async function getTags() {
    try {
        const q = query(collection(db, COLLECTION_NAME), orderBy("createdAt", "asc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("讀取標籤失敗:", e);
        throw e;
    }
}

export async function addTag(name) {
    if (!name) throw new Error("標籤名稱不可為空");
    try {
        const docRef = await addDoc(collection(db, COLLECTION_NAME), {
            name,
            createdAt: serverTimestamp()
        });
        return docRef.id;
    } catch (e) {
        console.error("新增標籤失敗:", e);
        throw e;
    }
}

export async function deleteTag(id) {
    try {
        await deleteDoc(doc(db, COLLECTION_NAME, id));
    } catch (e) {
        console.error("刪除標籤失敗:", e);
        throw e;
    }
}