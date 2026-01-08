/**
 * ui.js
 * 負責處理介面互動邏輯，如側邊欄開關、遮罩控制等
 */

// 切換側邊欄顯示狀態 (開 -> 關 / 關 -> 開)
export function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    // 使用 classList.toggle 來切換 'show' 類別
    if (sidebar) sidebar.classList.toggle('show');
    if (overlay) overlay.classList.toggle('show');
}

// 強制關閉側邊欄 (用於手機版點擊連結後自動收合)
export function closeSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    // 只有在已經開啟的狀態下才執行關閉
    if (sidebar && sidebar.classList.contains('show')) {
        sidebar.classList.remove('show');
    }
    if (overlay && overlay.classList.contains('show')) {
        overlay.classList.remove('show');
    }
}

// 判斷目前是否為手機版寬度 (小於等於 768px)
export function isMobileView() {
    return window.innerWidth <= 768;
}