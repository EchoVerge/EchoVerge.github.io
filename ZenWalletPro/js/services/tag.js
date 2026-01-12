import { LocalDB } from "./storage/localDB.js";

const STORE = 'tags';

export async function getTags() {
    return LocalDB.getAll(STORE);
}

export async function addTag(name) {
    return LocalDB.add(STORE, { name });
}

export async function deleteTag(id) {
    return LocalDB.delete(STORE, id);
}