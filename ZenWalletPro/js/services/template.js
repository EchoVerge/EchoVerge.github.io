// js/services/template.js
import { LocalDB } from "./storage/localDB.js";

const STORE = 'templates';

export async function getTemplates() {
    return LocalDB.getAll(STORE);
}

export async function addTemplate(data) {
    return LocalDB.add(STORE, {
        name: data.name,
        type: data.type,
        category: data.category,
        account: data.account,
        amount: data.amount,
        item: data.item || data.name,
        tags: data.tags || []
    });
}

export async function deleteTemplate(id) {
    return LocalDB.delete(STORE, id);
}