// js/services/category.js
import { LocalDB } from "./storage/localDB.js";

const STORE = 'categories';

export async function getCategories() {
    return LocalDB.getAll(STORE);
}

export async function addCategory(name, type) {
    return LocalDB.add(STORE, { name, type });
}

export async function deleteCategory(id) {
    // 🔥 保護「投資」類別不可刪除
    const cat = await LocalDB.get(STORE, id);
    if (cat && cat.name === '投資') {
        throw new Error("「投資」為系統預設類別，不可刪除");
    }
    return LocalDB.delete(STORE, id);
}