// js/app.js
import { db } from "./config.js";
import { showLoader, hideLoader, showApp } from "./utils/ui.js";
import { collection, getDocs, limit, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { initSettings } from "./settingsController.js";
import { initTransactionModule } from "./transactionController.js"; 
import { initDashboard } from "./dashboardController.js";

document.addEventListener("DOMContentLoaded", async () => {
    showLoader();
    console.log("應用程式啟動中...");

    const isConnected = await testConnection();
    
    if (isConnected) {
        console.log("連線成功，初始化模組...");
        
        // 平行載入設定和交易模組
        await Promise.all([
            initSettings(),
            initTransactionModule(),
            initDashboard()
        ]);
    }

    hideLoader();
    showApp();
});

async function testConnection() {
    const statusEl = document.getElementById("system-status");
    if (!db) {
        statusEl.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle-fill"></i> Firebase 設定錯誤</span>';
        return false;
    }
    try {
        const q = query(collection(db, "test_connection"), limit(1));
        await getDocs(q);
        // 這裡不需要特別顯示連線成功，因為畫面馬上就會顯示內容了
        // statusEl.innerHTML = '<span class="text-success"><i class="bi bi-check-circle-fill"></i> 連線成功</span>';
        return true;
    } catch (error) {
        console.error("Firebase 連線測試失敗:", error);
        statusEl.innerHTML = `<span class="text-danger"><i class="bi bi-wifi-off"></i> 連線失敗: ${error.message}</span>`;
        return false;
    }
}