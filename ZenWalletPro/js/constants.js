// js/constants.js

export const DEFAULT_CATEGORIES = [
    { name: "餐飲", type: "支出" },
    { name: "交通", type: "支出" },
    { name: "薪資", type: "收入" },
    { name: "轉帳支出", type: "支出" }, // 系統必要
    { name: "轉帳收入", type: "收入" }, // 系統必要
    { name: "帳目調整", type: "支出" }, // 系統必要 (其實可雙向，暫定支出或動態判斷)
    { name: "投資支出", type: "支出" }, // 系統必要
    { name: "投資收入", type: "收入" }  // 系統必要
];

export const DEFAULT_ACCOUNTS = [
    { name: "現金", initial: 0 },
    { name: "銀行轉帳", initial: 10000 }
    // 投資帳戶將由 Portfolio 模組獨立管理，不在此建立
];

export const DEFAULT_TAGS = [
    { name: "#出差" },
    { name: "#家庭" },
    { name: "#個人" },
    { name: "#不納入統計" } // 系統必要
];