// js/app.js
import { getTransactions } from "./services/transaction.js";

// 初始化
document.addEventListener("DOMContentLoaded", async () => {
    console.log("應用程式啟動...");
    loadData();
});

async function loadData() {
    const listEl = document.getElementById("transactionsList");
    
    // 呼叫 Service 層讀取資料
    const transactions = await getTransactions();
    
    if (transactions.length === 0) {
        listEl.innerHTML = '<div class="list-group-item">尚無交易紀錄</div>';
        return;
    }

    // 渲染畫面 (簡單範例)
    listEl.innerHTML = transactions.map(tx => `
        <div class="list-group-item d-flex justify-content-between align-items-center">
            <div>
                <strong>${tx.item}</strong>
                <small class="d-block text-muted">${tx.date} | ${tx.category}</small>
            </div>
            <span class="${tx.type === '支出' ? 'text-danger' : 'text-success'}">
                $${tx.amount.toLocaleString()}
            </span>
        </div>
    `).join('');
}