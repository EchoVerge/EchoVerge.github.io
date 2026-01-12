import { LocalDB } from "./storage/localDB.js";

const STORE = 'transactions';

export async function getTransactions() {
    const data = await LocalDB.getAll(STORE);
    // 轉換日期格式以符合 Controller 預期
    return data.map(item => ({
        ...item,
        date: item.date, // LocalDB 存 ISO string
        jsDate: new Date(item.date),
        dateStr: typeof item.date === 'string' ? item.date.split('T')[0] : new Date(item.date).toISOString().split('T')[0]
    })).sort((a, b) => b.dateStr.localeCompare(a.dateStr)); // 預設降序
}

export async function addTransaction(data) {
    // 確保日期是 ISO 字串
    const dateObj = new Date(data.date);
    const saveData = {
        ...data,
        date: dateObj.toISOString(),
        amount: parseFloat(data.amount)
    };
    return LocalDB.add(STORE, saveData);
}

export async function updateTransaction(id, data) {
    const dateObj = new Date(data.date);
    const saveData = {
        ...data,
        date: dateObj.toISOString(),
        amount: parseFloat(data.amount)
    };
    return LocalDB.update(STORE, id, saveData);
}

export async function deleteTransaction(id) {
    return LocalDB.delete(STORE, id);
}

// 轉帳 (Batch 模擬)
export async function addTransfer(data) {
    const dateIso = new Date(data.date).toISOString();
    
    // 支出
    await LocalDB.add(STORE, {
        date: dateIso,
        type: "支出",
        category: "轉帳支出",
        account: data.fromAccount,
        item: `轉帳至 ${data.toAccount}`,
        amount: parseFloat(data.amount),
        notes: data.notes || "",
        tags: ["#轉帳"]
    });

    // 收入
    await LocalDB.add(STORE, {
        date: dateIso,
        type: "收入",
        category: "轉帳收入",
        account: data.toAccount,
        item: `從 ${data.fromAccount} 轉入`,
        amount: parseFloat(data.amount),
        notes: data.notes || "",
        tags: ["#轉帳"]
    });
    
    return { success: true };
}

// 核對
export async function addAdjustment(data) {
    const diff = parseFloat(data.actualBalance) - parseFloat(data.currentBalance);
    if (Math.abs(diff) < 0.01) return { success: true, message: "餘額正確" };

    const type = diff > 0 ? "收入" : "支出";
    await LocalDB.add(STORE, {
        date: new Date().toISOString(),
        type: type,
        category: "帳目調整",
        account: data.account,
        item: "帳目核對調整",
        amount: Math.abs(diff),
        notes: `系統: ${data.currentBalance}, 實際: ${data.actualBalance}`,
        tags: ["#調整"]
    });

    return { success: true, message: "已新增調整紀錄" };
}