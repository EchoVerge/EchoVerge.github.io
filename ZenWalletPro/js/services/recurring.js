import { LocalDB } from "./storage/localDB.js";
import { addTransaction } from "./transaction.js"; // 呼叫本地交易 Service

const STORE = 'recurring_rules';

export async function getRecurringRules() {
    return LocalDB.getAll(STORE);
}

export async function addRecurringRule(rule) {
    return LocalDB.add(STORE, {
        ...rule,
        active: true
    });
}

export async function deleteRecurringRule(id) {
    // 軟刪除
    return LocalDB.update(STORE, id, { active: false });
}

export async function processDueRecurringTransactions() {
    const rules = await getRecurringRules();
    const today = new Date().toISOString().split('T')[0];
    let processCount = 0;

    for (const rule of rules) {
        if (!rule.active) continue;

        if (rule.nextDueDate <= today) {
            // 寫入交易
            await addTransaction({
                date: rule.nextDueDate,
                type: rule.type,
                category: rule.category,
                account: rule.account,
                item: rule.name + " (定期)",
                amount: parseFloat(rule.amount),
                notes: rule.notes || "系統自動產生",
                tags: rule.tags ? rule.tags.split(/[,，]/).map(t=>t.trim()).concat(["#定期"]) : ["#定期"]
            });

            // 計算下次
            let nextDate = new Date(rule.nextDueDate);
            if (rule.frequency === "monthly") nextDate.setMonth(nextDate.getMonth() + 1);
            else if (rule.frequency === "weekly") nextDate.setDate(nextDate.getDate() + 7);
            else if (rule.frequency === "yearly") nextDate.setFullYear(nextDate.getFullYear() + 1);

            // 更新規則
            await LocalDB.update(STORE, rule.id, {
                nextDueDate: nextDate.toISOString().split('T')[0]
            });
            processCount++;
        }
    }
    return { processed: processCount > 0, count: processCount };
}