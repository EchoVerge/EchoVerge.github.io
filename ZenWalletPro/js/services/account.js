import { LocalDB } from "./storage/localDB.js";

const STORE = 'accounts';

export async function getAccounts() {
    return LocalDB.getAll(STORE);
}

export async function addAccount(name, initial) {
    return LocalDB.add(STORE, {
        name,
        initial: parseFloat(initial)
    });
}

export async function deleteAccount(id) {
    return LocalDB.delete(STORE, id);
}