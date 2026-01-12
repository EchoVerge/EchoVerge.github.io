// js/utils/ui.js

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