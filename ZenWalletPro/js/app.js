// js/app.js
import { db } from "./config.js";
import { showLoader, hideLoader, showApp } from "./utils/ui.js";
import { collection, getDocs, limit, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { initSettings } from "./settingsController.js";
import { initTransactionModule } from "./transactionController.js"; 
import { initDashboard } from "./dashboardController.js";
import { initPortfolioModule } from "./portfolioController.js";

document.addEventListener("DOMContentLoaded", async () => {
    showLoader();
    console.log("應用程式啟動中...");

    const isConnected = await testConnection();
    
    if (isConnected) {
        console.log("連線成功，初始化模組...");
        
        // 平行載入所有模組
        await Promise.all([
            initSettings(),
            initTransactionModule(),
            initDashboard(),
            initPortfolioModule(),
            initLayout()
        ]);
    }

    hideLoader();
    showApp();
});

async function testConnection() {
    const statusEl = document.getElementById("system-status");
    if (!db) {
        if(statusEl) statusEl.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle-fill"></i> Firebase 設定錯誤</span>';
        return false;
    }
    try {
        const q = query(collection(db, "test_connection"), limit(1));
        await getDocs(q);
        return true;
    } catch (error) {
        console.error("Firebase 連線測試失敗:", error);
        if(statusEl) statusEl.innerHTML = `<span class="text-danger"><i class="bi bi-wifi-off"></i> 連線失敗: ${error.message}</span>`;
        return false;
    }
}

// 🔥 Gridstack 初始化設定
function initLayout() {
    const gridEl = document.querySelector('.grid-stack');
    if (!gridEl) return;

    const options = {
        column: 12,        // 12欄位網格
        cellHeight: 80,    // 每個格子的基礎高度 (px)
        minRow: 1,         // 最小行數
        margin: 15,        // 🔥 設定間距為 15px (這裡控制 margin)
        animate: true,     // 開啟動畫
        float: false,      // false = 重力模式 (自動向上對齊)
        handle: '.module-title', // 限制只能拖曳標題
        disableOneColumnMode: false, // 手機版自動切換單欄
        alwaysShowResizeHandle: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? true : false // 手機版常駐顯示縮放手把
    };

    const grid = GridStack.init(options);
    console.log("Gridstack initialized with margin 15px");
}