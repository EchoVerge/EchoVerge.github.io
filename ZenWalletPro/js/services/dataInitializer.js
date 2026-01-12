// js/services/dataInitializer.js
import { addAccount } from "./account.js";
import { addCategory } from "./category.js";
import { addTag } from "./tag.js";

export async function initializeDefaultData() {
    // 1. 預設帳戶
    const defaultAccounts = [
        { name: "現金", initial: 0 },
        { name: "銀行存款", initial: 0 },
        { name: "信用卡", initial: 0 },
        { name: "投資帳戶 (Portfolio)", initial: 0 }
    ];

    // 2. 預設類別
    const defaultCategories = [
        // 支出
        { name: "餐飲", type: "支出" },
        { name: "交通", type: "支出" },
        { name: "購物", type: "支出" },
        { name: "娛樂", type: "支出" },
        { name: "居住", type: "支出" },
        { name: "醫療", type: "支出" },
        { name: "教育", type: "支出" },
        { name: "投資支出", type: "支出" }, // 系統必要
        { name: "轉帳支出", type: "支出" }, // 系統必要
        { name: "帳目調整", type: "支出" }, // 系統必要
        
        // 收入
        { name: "薪資", type: "收入" },
        { name: "獎金", type: "收入" },
        { name: "投資收入", type: "收入" },
        { name: "兼職", type: "收入" },
        { name: "轉帳收入", type: "收入" }, // 系統必要
        { name: "帳目調整", type: "收入" }  // 系統必要
    ];

    // 3. 預設標籤
    const defaultTags = [
        { name: "#早餐" },
        { name: "#午餐" },
        { name: "#晚餐" },
        { name: "#飲料" },
        { name: "#必需品" }
    ];

    console.log("開始寫入預設資料...");

    // 使用 Promise.all 平行寫入加快速度
    const tasks = [];

    for (const acc of defaultAccounts) {
        tasks.push(addAccount(acc.name, acc.initial));
    }

    for (const cat of defaultCategories) {
        tasks.push(addCategory(cat.name, cat.type));
    }

    for (const tag of defaultTags) {
        tasks.push(addTag(tag.name));
    }

    await Promise.all(tasks);
    console.log("預設資料寫入完成");
    
    // 🔥 發送全域通知，讓下拉選單更新
    document.dispatchEvent(new Event("zenwallet:dataChanged"));
}