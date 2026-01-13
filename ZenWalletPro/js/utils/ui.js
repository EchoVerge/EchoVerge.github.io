// js/utils/ui.js
// 動態載入 HTML 檔案的函式
export async function loadComponent(elementId, filePath) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`Failed to load ${filePath}`);
        const html = await response.text();
        element.innerHTML = html;
    } catch (error) {
        console.error(error);
        element.innerHTML = `<div class="alert alert-danger">載入失敗: ${filePath}</div>`;
    }
}
/**
 * 顯示全螢幕載入動畫
 */
export function showLoader() {
    const loader = document.getElementById("loader");
    if (loader) loader.style.display = "block";
}

/**
 * 隱藏全螢幕載入動畫
 */
export function hideLoader() {
    const loader = document.getElementById("loader");
    if (loader) loader.style.display = "none";
}

/**
 * 顯示主要應用程式容器
 */
export function showApp() {
    const app = document.getElementById("app-container");
    if (app) app.style.display = "block";
}