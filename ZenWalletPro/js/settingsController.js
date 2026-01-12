// js/settingsController.js
import { getCategories, addCategory, deleteCategory } from "./services/category.js";
import { getAccounts, addAccount, deleteAccount } from "./services/account.js";
import { getTags, addTag, deleteTag } from "./services/tag.js";
import { initializeDefaultData } from "./services/dataInitializer.js";
import { showLoader, hideLoader } from "./utils/ui.js";

// 初始化設定頁面
export async function initSettings() {
    setupEventListeners();
    await refreshAllSettings();
}

function setupEventListeners() {
    // 1. 初始化按鈕
    document.getElementById("btn-init-data").addEventListener("click", async () => {
        if (!confirm("確定要寫入預設資料嗎？這將會新增多筆資料。")) return;
        showLoader();
        try {
            await initializeDefaultData();
            await refreshAllSettings();
            alert("初始化成功！");
        } catch (e) {
            alert("初始化失敗: " + e.message);
        } finally {
            hideLoader();
        }
    });

    // 2. 新增類別
    document.getElementById("addCategoryForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("new-category-name").value.trim();
        const type = document.getElementById("new-category-type").value;
        if (!name) return;
        
        showLoader();
        await addCategory(name, type);
        document.getElementById("addCategoryForm").reset();
        await renderCategories();
        hideLoader();
    });

    // 3. 新增帳戶
    document.getElementById("addAccountForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("new-account-name").value.trim();
        const initial = document.getElementById("new-account-initial").value;
        if (!name) return;

        showLoader();
        await addAccount(name, initial);
        document.getElementById("addAccountForm").reset();
        await renderAccounts();
        hideLoader();
    });

    // 4. 新增標籤
    document.getElementById("addTagForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("new-tag-name").value.trim();
        if (!name) return;

        showLoader();
        await addTag(name);
        document.getElementById("addTagForm").reset();
        await renderTags();
        hideLoader();
    });
}

// 刷新所有列表
async function refreshAllSettings() {
    await Promise.all([renderCategories(), renderAccounts(), renderTags()]);
}

// 渲染類別列表
async function renderCategories() {
    const list = document.getElementById("settings-category-list");
    list.innerHTML = "載入中...";
    const data = await getCategories();
    
    list.innerHTML = "";
    data.forEach(item => {
        const li = document.createElement("li");
        li.className = "list-group-item d-flex justify-content-between align-items-center px-0";
        li.innerHTML = `
            <span>${item.name} <span class="badge bg-secondary ms-1">${item.type}</span></span>
            <button class="btn btn-outline-danger btn-sm" data-id="${item.id}"><i class="bi bi-trash"></i></button>
        `;
        // 綁定刪除事件
        li.querySelector("button").addEventListener("click", () => handleDeleteCategory(item.id, item.name));
        list.appendChild(li);
    });
}

// 渲染帳戶列表
async function renderAccounts() {
    const list = document.getElementById("settings-account-list");
    list.innerHTML = "載入中...";
    const data = await getAccounts();
    
    list.innerHTML = "";
    data.forEach(item => {
        const li = document.createElement("li");
        li.className = "list-group-item d-flex justify-content-between align-items-center px-0";
        li.innerHTML = `
            <div>
                <strong>${item.name}</strong>
                <small class="d-block text-muted">初始: $${item.initial}</small>
            </div>
            <button class="btn btn-outline-danger btn-sm" data-id="${item.id}"><i class="bi bi-trash"></i></button>
        `;
        li.querySelector("button").addEventListener("click", () => handleDeleteAccount(item.id, item.name));
        list.appendChild(li);
    });
}

// 渲染標籤列表
async function renderTags() {
    const list = document.getElementById("settings-tag-list");
    list.innerHTML = "載入中...";
    const data = await getTags();
    
    list.innerHTML = "";
    data.forEach(item => {
        const li = document.createElement("li");
        li.className = "list-group-item d-flex justify-content-between align-items-center px-0";
        li.innerHTML = `
            ${item.name}
            <button class="btn btn-outline-danger btn-sm" data-id="${item.id}"><i class="bi bi-trash"></i></button>
        `;
        li.querySelector("button").addEventListener("click", () => handleDeleteTag(item.id, item.name));
        list.appendChild(li);
    });
}

// 刪除處理函式
async function handleDeleteCategory(id, name) {
    if (!confirm(`確定刪除類別「${name}」？`)) return;
    showLoader();
    await deleteCategory(id);
    await renderCategories();
    hideLoader();
}

async function handleDeleteAccount(id, name) {
    if (!confirm(`確定刪除帳戶「${name}」？`)) return;
    showLoader();
    await deleteAccount(id);
    await renderAccounts();
    hideLoader();
}

async function handleDeleteTag(id, name) {
    if (!confirm(`確定刪除標籤「${name}」？`)) return;
    showLoader();
    await deleteTag(id);
    await renderTags();
    hideLoader();
}