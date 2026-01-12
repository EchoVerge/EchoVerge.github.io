import { LocalDB } from "./storage/localDB.js";

const STORE = 'categories';

export async function getCategories() {
    return LocalDB.getAll(STORE);
}

export async function addCategory(name, type) {
    return LocalDB.add(STORE, { name, type });
}

export async function deleteCategory(id) {
    return LocalDB.delete(STORE, id);
}