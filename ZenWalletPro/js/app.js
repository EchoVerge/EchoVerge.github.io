// js/app.js
import { showLoader, hideLoader, showApp } from "./utils/ui.js";
import { initSettings } from "./settingsController.js";
import { initTransactionModule } from "./transactionController.js"; 
import { initDashboard } from "./dashboardController.js";
import { initPortfolioModule } from "./portfolioController.js";
import { processDueRecurringTransactions } from "./services/recurring.js";
import { initAuthListener, loginWithGoogle, logout, AuthState } from "./services/auth.js";
import { syncUp, syncDown } from "./services/repository.js";

let grid = null;
let saveLayoutModal = null;
let licenseModal = null;
let isRestoringLayout = false; 

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
    console.log("應用程式啟動中 (Local First Mode)...");

    // 初始化 Modals
    if(document.getElementById('saveLayoutModal')) 
        saveLayoutModal = new bootstrap.Modal(document.getElementById('saveLayoutModal'));
    
    if(document.getElementById('licenseModal'))
        licenseModal = new bootstrap.Modal(document.getElementById('licenseModal'));

    // 1. 初始化 Auth UI 與監聽器
    setupAuthUI();

    // 2. 檢查定期交易 (離線也能跑)
    const result = await processDueRecurringTransactions();
    if (result.processed) {
        console.log(`已自動執行 ${result.count} 筆定期交易`);
    }

    // 3. 初始化各個模組
    await Promise.all([
        initSettings(),
        initTransactionModule(),
        initDashboard(),
        initPortfolioModule(),
        initLayout()
    ]);
    
    renderLayoutMenu();
    
    // 4. 恢復上次同步時間顯示
    updateLastSyncTime();

    hideLoader();
    showApp();
});

// 更新同步時間顯示
function updateLastSyncTime() {
    const time = localStorage.getItem('last_sync_time');
    const el = document.getElementById('sync-status-text');
    if(el && time) el.textContent = `上次同步：${time}`;
}

// Auth 與 UI 綁定邏輯
function setupAuthUI() {
    const loginBtn = document.getElementById("btn-login");
    const logoutBtn = document.getElementById("btn-logout"); // 這是給下拉選單用的，Modal 內的直接 onclick="logout()"
    const userInfo = document.getElementById("user-info");
    const userAvatar = document.getElementById("user-avatar");
    const userBadge = document.getElementById("user-badge");
    // const userEmail = document.getElementById("user-email"); // 如果導覽列有 Email 顯示

    // 綁定同步按鈕 (設定頁)
    const btnUp = document.getElementById("btn-cloud-up");
    const btnDown = document.getElementById("btn-cloud-down");

    // 登入按鈕
    if(loginBtn) {
        loginBtn.addEventListener("click", async () => {
            try { await loginWithGoogle(); } catch(e) { alert("登入失敗"); }
        });
    }

    // 全域登出函式 (給 HTML onclick 使用)
    window.logout = logout;

    // 🔥 開啟授權視窗 (核心邏輯)
    window.openLicenseModal = () => {
        if (!AuthState.user) return;
        
        // 填入資料
        const modalAvatar = document.getElementById('license-user-avatar');
        const modalName = document.getElementById('license-user-name');
        const modalEmail = document.getElementById('license-user-email');
        const modalType = document.getElementById('license-type');
        const modalExpiry = document.getElementById('license-expiry');

        if(modalAvatar) modalAvatar.src = AuthState.user.photoURL;
        if(modalName) modalName.textContent = AuthState.user.displayName || "使用者";
        if(modalEmail) modalEmail.textContent = AuthState.user.email;
        
        if(modalType) modalType.textContent = AuthState.subscription?.type || "Free";
        if(modalExpiry) modalExpiry.textContent = AuthState.subscription?.expiry || "N/A";

        // 切換顯示升級按鈕或 PRO 標示
        const upgradeArea = document.getElementById('license-upgrade-area');
        const proArea = document.getElementById('license-pro-area');
        
        if(AuthState.isPremium) {
            if(upgradeArea) upgradeArea.classList.add('d-none');
            if(proArea) proArea.classList.remove('d-none');
        } else {
            if(upgradeArea) upgradeArea.classList.remove('d-none');
            if(proArea) proArea.classList.add('d-none');
        }

        if(licenseModal) licenseModal.show();
    };

    // 🔥 綁定同步功能
    if(btnUp) {
        btnUp.addEventListener("click", async () => {
            if(!confirm("確定要將本地資料「覆蓋」到雲端嗎？")) return;
            showLoader();
            try {
                await syncUp();
                updateLastSyncTime();
                alert("上傳成功！");
            } catch(e) { alert(e.message); } finally { hideLoader(); }
        });
    }

    if(btnDown) {
        btnDown.addEventListener("click", async () => {
            if(!confirm("⚠️ 警告：這將會清除本地所有資料，並從雲端下載還原。\n確定要繼續嗎？")) return;
            showLoader();
            try {
                await syncDown();
                updateLastSyncTime();
                alert("下載成功！頁面將重新整理。");
                location.reload();
            } catch(e) { alert(e.message); } finally { hideLoader(); }
        });
    }

    // 啟動 Auth 狀態監聽
    initAuthListener((state) => {
        if (state.user) {
            // 已登入
            if(loginBtn) loginBtn.classList.add("d-none");
            if(userInfo) {
                userInfo.classList.remove("d-none");
                userInfo.classList.add("d-flex");
            }
            
            if(userAvatar) userAvatar.src = state.user.photoURL;
            
            // 更新 UI 狀態 (Sync Buttons & Badge)
            if (state.isPremium) {
                if(userBadge) {
                    userBadge.textContent = "PRO";
                    userBadge.className = "badge bg-warning text-dark rounded-pill";
                }
                if(btnUp) btnUp.classList.remove("disabled");
                if(btnDown) btnDown.classList.remove("disabled");
            } else {
                if(userBadge) {
                    userBadge.textContent = "Free";
                    userBadge.className = "badge bg-secondary rounded-pill";
                }
                if(btnUp) btnUp.classList.add("disabled");
                if(btnDown) btnDown.classList.add("disabled");
            }
        } else {
            // 未登入
            if(loginBtn) loginBtn.classList.remove("d-none");
            if(userInfo) {
                userInfo.classList.add("d-none");
                userInfo.classList.remove("d-flex");
            }
            if(btnUp) btnUp.classList.add("disabled");
            if(btnDown) btnDown.classList.add("disabled");
        }
    });

    const privacyBtn = document.getElementById("btn-privacy-toggle");
    if (privacyBtn) {
        privacyBtn.addEventListener("click", () => {
            document.body.classList.toggle("privacy-active");
            const icon = privacyBtn.querySelector("i");
            if (document.body.classList.contains("privacy-active")) {
                icon.classList.replace("bi-eye", "bi-eye-slash");
            } else {
                icon.classList.replace("bi-eye-slash", "bi-eye");
            }
        });
    }
}

// --- Gridstack 相關邏輯 ---

function initLayout() {
    const gridEl = document.querySelector('.grid-stack');
    if (!gridEl) return;

    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (saved) {
        try {
            const layout = JSON.parse(saved);
            layout.forEach(node => {
                const el = document.querySelector(`[gs-id="${node.id}"]`);
                if (el) {
                    el.setAttribute('gs-x', node.x);
                    el.setAttribute('gs-y', node.y);
                    el.setAttribute('gs-w', node.w);
                    el.setAttribute('gs-h', node.h);
                }
            });
        } catch (e) {
            console.error("版面讀取失敗", e);
        }
    }

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

    grid = GridStack.init(options);
    console.log("Gridstack initialized");

    grid.on('change', function(event, items) {
        if (!isRestoringLayout) {
            saveCurrentState();
        }
    });
}

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

function applyLayoutData(layoutData) {
    if (!grid) return;
    isRestoringLayout = true;
    grid.batchUpdate();
    layoutData.forEach(node => {
        const el = document.querySelector(`[gs-id="${node.id}"]`);
        if (el) {
            grid.update(el, {x: node.x, y: node.y, w: node.w, h: node.h});
        }
    });
    grid.commit();
    setTimeout(() => {
        isRestoringLayout = false;
        saveCurrentState();
    }, 300);
}

function renderLayoutMenu() {
    const menu = document.getElementById('layout-menu-items');
    if (!menu) return;
    menu.innerHTML = '';
    
    menu.innerHTML += `<li><h6 class="dropdown-header">系統預設</h6></li>`;
    for (const [key, tpl] of Object.entries(SYSTEM_TEMPLATES)) {
        menu.innerHTML += `
            <li><button class="dropdown-item" onclick="window.applySystemLayout('${key}')">
                <i class="bi ${tpl.icon} me-2"></i>${tpl.name}
            </button></li>`;
    }

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

// 全域函式 (HTML 呼叫用)
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
    if(saveLayoutModal) saveLayoutModal.show();
}

window.confirmSaveLayout = function() {
    const input = document.getElementById('layout-name-input');
    const name = input ? input.value.trim() : '';
    
    if (!name) return alert("請輸入版面名稱");

    const customLayouts = JSON.parse(localStorage.getItem(CUSTOM_LAYOUTS_KEY) || '{}');
    
    const currentLayout = [];
    if(grid) {
        grid.engine.nodes.forEach(node => {
            const id = node.el.getAttribute('gs-id');
            if(id) currentLayout.push({ id, x: node.x, y: node.y, w: node.w, h: node.h });
        });
    }

    customLayouts[name] = currentLayout;
    localStorage.setItem(CUSTOM_LAYOUTS_KEY, JSON.stringify(customLayouts));
    
    if(saveLayoutModal) saveLayoutModal.hide();
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
        location.reload(); 
    }
}