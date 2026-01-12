// js/app.js
import { db } from "./config.js";
import { showLoader, hideLoader, showApp } from "./utils/ui.js";
import { collection, getDocs, limit, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { initSettings } from "./settingsController.js";
import { initTransactionModule } from "./transactionController.js"; 
import { initDashboard } from "./dashboardController.js";
import { initPortfolioModule } from "./portfolioController.js";
import { processDueRecurringTransactions } from "./services/recurring.js";

let grid = null;
let saveLayoutModal = null;
let isRestoringLayout = false; // 防止還原時觸發自動儲存

const LAYOUT_STORAGE_KEY = 'dashboard_current_layout';
const CUSTOM_LAYOUTS_KEY = 'dashboard_custom_layouts';

// 系統預設模板
const SYSTEM_TEMPLATES = {
    default: {
        name: "經典預設",
        icon: "bi-grid-fill",
        data: [
            {id: 'widget-total-assets', x: 0, y: 0, w: 5, h: 2},
            {id: 'widget-stats', x: 5, y: 0, w: 7, h: 2},
            {id: 'widget-cash-overview', x: 0, y: 2, w: 4, h: 5},
            {id: 'widget-trend', x: 4, y: 2, w: 8, h: 5},
            {id: 'widget-pie-chart', x: 0, y: 7, w: 4, h: 6},
            {id: 'widget-transactions', x: 4, y: 7, w: 8, h: 6}
        ]
    },
    charts: {
        name: "戰情室 (圖表優先)",
        icon: "bi-bar-chart-fill",
        data: [
            {id: 'widget-total-assets', x: 0, y: 0, w: 4, h: 2},
            {id: 'widget-stats', x: 4, y: 0, w: 8, h: 2},
            {id: 'widget-trend', x: 0, y: 2, w: 8, h: 5},
            {id: 'widget-pie-chart', x: 8, y: 2, w: 4, h: 5},
            {id: 'widget-transactions', x: 0, y: 7, w: 8, h: 6},
            {id: 'widget-cash-overview', x: 8, y: 7, w: 4, h: 6}
        ]
    },
    focus: {
        name: "記帳專注 (列表優先)",
        icon: "bi-pencil-square",
        data: [
            {id: 'widget-transactions', x: 0, y: 0, w: 7, h: 13},
            {id: 'widget-total-assets', x: 7, y: 0, w: 5, h: 2},
            {id: 'widget-stats', x: 7, y: 2, w: 5, h: 2},
            {id: 'widget-trend', x: 7, y: 4, w: 5, h: 4},
            {id: 'widget-pie-chart', x: 7, y: 8, w: 5, h: 5},
            {id: 'widget-cash-overview', x: 0, y: 13, w: 12, h: 4}
        ]
    }
};

document.addEventListener("DOMContentLoaded", async () => {
    showLoader();
    console.log("應用程式啟動中 (Local Mode)...");

    saveLayoutModal = new bootstrap.Modal(document.getElementById('saveLayoutModal'));

    // 不需要連網檢查了，直接初始化
    // 1. 定期交易檢查
    const result = await processDueRecurringTransactions();
    if (result.processed) {
        console.log(`已自動執行 ${result.count} 筆定期交易`);
    }

    // 2. 初始化模組
    await Promise.all([
        initSettings(),
        initTransactionModule(),
        initDashboard(),
        initPortfolioModule(),
        initLayout()
    ]);
    
    renderLayoutMenu();

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

// 🔥 Gridstack 初始化 (修正版)
function initLayout() {
    const gridEl = document.querySelector('.grid-stack');
    if (!gridEl) return;

    // 1. 在啟動 Gridstack 之前，先將儲存的位置寫入 DOM
    // 這一步至關重要！它避免了初始化後的動畫碰撞
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (saved) {
        try {
            const layout = JSON.parse(saved);
            console.log("正在預先載入版面配置...");
            layout.forEach(node => {
                const el = document.querySelector(`[gs-id="${node.id}"]`);
                if (el) {
                    // 直接設定 DOM 屬性，Gridstack 啟動時會讀取這些
                    el.setAttribute('gs-x', node.x);
                    el.setAttribute('gs-y', node.y);
                    el.setAttribute('gs-w', node.w);
                    el.setAttribute('gs-h', node.h);
                }
            });
        } catch (e) {
            console.error("版面讀取失敗，將使用預設值", e);
        }
    }

    // 2. 設定選項
    const options = {
        column: 12,        
        cellHeight: 80,    
        minRow: 1,         
        margin: 15,        
        animate: true,     
        float: false,      
        handle: '.module-title', 
        disableOneColumnMode: false, 
        alwaysShowResizeHandle: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? true : false
    };

    // 3. 正式啟動 Gridstack
    grid = GridStack.init(options);
    console.log("Gridstack initialized");

    // 4. 監聽變更事件 (拖曳或縮放時自動儲存)
    grid.on('change', function(event, items) {
        if (!isRestoringLayout) {
            saveCurrentState();
        }
    });
}

// 儲存當前狀態
function saveCurrentState() {
    if (!grid) return;
    const layout = [];
    grid.engine.nodes.forEach(node => {
        const el = node.el;
        const id = el.getAttribute('gs-id'); 
        if (id) {
            layout.push({ id, x: node.x, y: node.y, w: node.w, h: node.h });
        }
    });
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}

// 套用版面數據 (用於執行期間切換模板)
function applyLayoutData(layoutData) {
    if (!grid) return;
    
    isRestoringLayout = true; // 鎖定儲存

    grid.batchUpdate();
    layoutData.forEach(node => {
        const el = document.querySelector(`[gs-id="${node.id}"]`);
        if (el) {
            grid.update(el, {x: node.x, y: node.y, w: node.w, h: node.h});
        }
    });
    grid.commit();

    // 延遲解鎖並手動儲存一次，確保狀態同步
    setTimeout(() => {
        isRestoringLayout = false;
        saveCurrentState();
    }, 300);
}

// 🔥 渲染版面選單
function renderLayoutMenu() {
    const menu = document.getElementById('layout-menu-items');
    if (!menu) return;
    
    menu.innerHTML = '';

    // 1. 系統預設
    menu.innerHTML += `<li><h6 class="dropdown-header">系統預設</h6></li>`;
    for (const [key, tpl] of Object.entries(SYSTEM_TEMPLATES)) {
        menu.innerHTML += `
            <li><button class="dropdown-item" onclick="window.applySystemLayout('${key}')">
                <i class="bi ${tpl.icon} me-2"></i>${tpl.name}
            </button></li>`;
    }

    // 2. 用戶自訂
    const customLayouts = JSON.parse(localStorage.getItem(CUSTOM_LAYOUTS_KEY) || '{}');
    const customKeys = Object.keys(customLayouts);
    
    if (customKeys.length > 0) {
        menu.innerHTML += `<li><hr class="dropdown-divider"></li>`;
        menu.innerHTML += `<li><h6 class="dropdown-header">我的最愛</h6></li>`;
        customKeys.forEach(name => {
            menu.innerHTML += `
                <li class="d-flex align-items-center justify-content-between px-2">
                    <button class="dropdown-item flex-grow-1 text-truncate" onclick="window.applyCustomLayout('${name}')">
                        <i class="bi bi-person-workspace me-2"></i>${name}
                    </button>
                    <button class="btn btn-link btn-sm text-danger p-0 ms-2" title="刪除" onclick="window.deleteCustomLayout('${name}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </li>`;
        });
    }

    // 3. 操作區
    menu.innerHTML += `<li><hr class="dropdown-divider"></li>`;
    menu.innerHTML += `
        <li><button class="dropdown-item fw-bold text-primary" onclick="window.openSaveLayoutModal()">
            <i class="bi bi-plus-circle me-2"></i>儲存目前版面...
        </button></li>
        <li><button class="dropdown-item text-danger" onclick="window.resetLayout()">
            <i class="bi bi-arrow-counterclockwise me-2"></i>重置版面
        </button></li>
    `;
}

// --- 全域函式 ---

window.applySystemLayout = function(key) {
    if (SYSTEM_TEMPLATES[key]) {
        if(confirm(`確定要切換到「${SYSTEM_TEMPLATES[key].name}」嗎？`)) {
            applyLayoutData(SYSTEM_TEMPLATES[key].data);
        }
    }
}

window.applyCustomLayout = function(name) {
    const customLayouts = JSON.parse(localStorage.getItem(CUSTOM_LAYOUTS_KEY) || '{}');
    if (customLayouts[name]) {
        if(confirm(`確定要切換到自訂版面「${name}」嗎？`)) {
            applyLayoutData(customLayouts[name]);
        }
    }
}

window.openSaveLayoutModal = function() {
    const input = document.getElementById('layout-name-input');
    if(input) input.value = '';
    saveLayoutModal.show();
}

window.confirmSaveLayout = function() {
    const input = document.getElementById('layout-name-input');
    const name = input ? input.value.trim() : '';
    
    if (!name) return alert("請輸入版面名稱");

    const customLayouts = JSON.parse(localStorage.getItem(CUSTOM_LAYOUTS_KEY) || '{}');
    
    // 取得當前完整狀態
    const currentLayout = [];
    grid.engine.nodes.forEach(node => {
        const id = node.el.getAttribute('gs-id');
        if(id) currentLayout.push({ id, x: node.x, y: node.y, w: node.w, h: node.h });
    });

    customLayouts[name] = currentLayout;
    localStorage.setItem(CUSTOM_LAYOUTS_KEY, JSON.stringify(customLayouts));
    
    saveLayoutModal.hide();
    renderLayoutMenu(); 
    alert(`版面「${name}」已儲存！`);
}

window.deleteCustomLayout = function(name) {
    if(!confirm(`確定要刪除自訂版面「${name}」嗎？`)) return;
    
    const customLayouts = JSON.parse(localStorage.getItem(CUSTOM_LAYOUTS_KEY) || '{}');
    delete customLayouts[name];
    localStorage.setItem(CUSTOM_LAYOUTS_KEY, JSON.stringify(customLayouts));
    
    renderLayoutMenu();
}

window.resetLayout = function() {
    if(confirm("確定要重置為預設狀態嗎？")) {
        localStorage.removeItem(LAYOUT_STORAGE_KEY);
        // 直接重新整理頁面最乾淨
        location.reload(); 
    }
}