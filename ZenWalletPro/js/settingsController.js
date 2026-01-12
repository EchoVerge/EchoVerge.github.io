// js/settingsController.js
import { getCategories, addCategory, deleteCategory } from "./services/category.js";
import { getAccounts, addAccount, deleteAccount } from "./services/account.js";
import { getTags, addTag, deleteTag } from "./services/tag.js";
import { getTemplates, addTemplate, deleteTemplate } from "./services/template.js";
import { getRecurringRules, addRecurringRule, deleteRecurringRule } from "./services/recurring.js";
import { initializeDefaultData } from "./services/dataInitializer.js";
import { exportAllData, importData } from "./services/dataManager.js";
import { showLoader, hideLoader } from "./utils/ui.js";

// 初始化設定頁面
export async function initSettings() {
    setupEventListeners();
    await refreshAllSettings();
    await renderRecurringRules();
    await loadRecurringDropdowns();
    await renderTemplatesList(); // 🔥 新增：載入模版列表
}

// 通用的全域通知函式
function notifyDataChanged() {
    document.dispatchEvent(new Event("zenwallet:dataChanged"));
    // 同時更新設定頁面自己的下拉選單
    loadRecurringDropdowns();
    loadTemplateDropdowns();
}

function setupEventListeners() {
    // 1. 初始化按鈕
    const initBtn = document.getElementById("btn-init-data");
    if (initBtn) {
        initBtn.addEventListener("click", async () => {
            if (!confirm("確定要寫入預設資料嗎？這將會新增多筆資料。")) return;
            showLoader();
            try {
                await initializeDefaultData();
                await refreshAllSettings();
                notifyDataChanged();
                alert("初始化成功！");
            } catch (e) {
                alert("初始化失敗: " + e.message);
            } finally {
                hideLoader();
            }
        });
    }

    // 2. 新增類別
    const addCatForm = document.getElementById("addCategoryForm");
    if (addCatForm) {
        addCatForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("new-category-name").value.trim();
            const type = document.getElementById("new-category-type").value;
            if (!name) return;
            
            showLoader();
            await addCategory(name, type);
            addCatForm.reset();
            await renderCategories();
            notifyDataChanged();
            hideLoader();
        });
    }

    // 3. 新增帳戶
    const addAccForm = document.getElementById("addAccountForm");
    if (addAccForm) {
        addAccForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("new-account-name").value.trim();
            const initial = document.getElementById("new-account-initial").value;
            if (!name) return;

            showLoader();
            await addAccount(name, initial);
            addAccForm.reset();
            await renderAccounts();
            notifyDataChanged();
            hideLoader();
        });
    }

    // 4. 新增標籤
    const addTagForm = document.getElementById("addTagForm");
    if (addTagForm) {
        addTagForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("new-tag-name").value.trim();
            if (!name) return;

            showLoader();
            await addTag(name);
            addTagForm.reset();
            await renderTags();
            hideLoader();
        });
    }
    
    // 5. 定期規則表單
    const recForm = document.getElementById("addRecurringForm");
    if(recForm) {
        document.getElementById("rec-type").addEventListener("change", (e) => {
            updateRecCategoryOptions(e.target.value);
        });

        recForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("rec-name").value;
            const amount = document.getElementById("rec-amount").value;
            const freq = document.getElementById("rec-freq").value;
            const date = document.getElementById("rec-date").value;
            
            const type = document.getElementById("rec-type").value;
            const account = document.getElementById("rec-account").value;
            const category = document.getElementById("rec-category").value;
            const tags = document.getElementById("rec-tags").value;
            const notes = document.getElementById("rec-notes").value;

            if(!type || !account || !category) {
                alert("請完整填寫類型、帳戶與類別");
                return;
            }

            await addRecurringRule({
                name, frequency: freq, amount, nextDueDate: date,
                type, category, account, tags, notes 
            });
            
            recForm.reset();
            document.getElementById("rec-date").valueAsDate = new Date();
            await renderRecurringRules();
        });
    }

    // 6. 🔥 快速模版表單
    const tplForm = document.getElementById("addTemplateForm");
    if (tplForm) {
        // 連動類別 (使用與定期規則類似的邏輯)
        document.getElementById("tpl-type").addEventListener("change", (e) => {
            updateTemplateCategoryOptions(e.target.value);
        });

        tplForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("tpl-name").value;
            const amount = document.getElementById("tpl-amount").value;
            const type = document.getElementById("tpl-type").value;
            const category = document.getElementById("tpl-category").value;
            const account = document.getElementById("tpl-account").value;

            if(!type || !account || !category) {
                alert("請完整填寫類型、帳戶與類別");
                return;
            }

            await addTemplate({ name, amount, type, category, account });
            tplForm.reset();
            await renderTemplatesList();
            notifyDataChanged(); // 通知 Dashboard 顯示新按鈕
        });
    }

    // 7. 匯出/匯入
    const exportBtn = document.getElementById("btn-export-data");
    if (exportBtn) {
        exportBtn.addEventListener("click", async () => {
            try { await exportAllData(); } catch(e) { alert("匯出失敗: " + e.message); }
        });
    }

    const importBtn = document.getElementById("btn-import-data");
    if (importBtn) {
        importBtn.addEventListener("click", () => {
            document.getElementById("file-input-import").click();
        });
    }

    const fileInput = document.getElementById("file-input-import");
    if (fileInput) {
        fileInput.addEventListener("change", async (e) => {
            if (!e.target.files.length) return;
            if (!confirm("匯入將會覆蓋現有所有資料，確定要繼續嗎？")) return;
            
            showLoader();
            try {
                await importData(e.target.files[0]);
                alert("資料還原成功！頁面將重新整理。");
                location.reload();
            } catch (err) {
                alert("匯入失敗: " + err.message);
            } finally {
                hideLoader();
            }
        });
    }
}

// 載入下拉選單資料
async function loadRecurringDropdowns() {
    const [categories, accounts] = await Promise.all([getCategories(), getAccounts()]);
    window.allCategoriesForRec = categories; // 暫存給連動使用

    // 填充定期規則的帳戶
    const recAccSelect = document.getElementById("rec-account");
    if(recAccSelect) {
        const currentVal = recAccSelect.value;
        recAccSelect.innerHTML = '<option value="">帳戶</option>';
        accounts.forEach(acc => {
            if(acc.name !== "投資帳戶 (Portfolio)") {
                recAccSelect.innerHTML += `<option value="${acc.name}">${acc.name}</option>`;
            }
        });
        if (currentVal) recAccSelect.value = currentVal;
    }
    
    // 初始化類別選單
    const recType = document.getElementById("rec-type")?.value || "支出";
    updateRecCategoryOptions(recType);

    // 填充模版的下拉選單
    loadTemplateDropdowns(accounts);
}

function loadTemplateDropdowns(accounts) {
    // 若未傳入 accounts，重新抓取 (防禦性)
    if (!accounts) {
        getAccounts().then(accs => loadTemplateDropdowns(accs));
        return;
    }

    const tplAccSelect = document.getElementById("tpl-account");
    if(tplAccSelect) {
        const currentVal = tplAccSelect.value;
        tplAccSelect.innerHTML = '<option value="">帳戶</option>';
        accounts.forEach(acc => {
            if(acc.name !== "投資帳戶 (Portfolio)") {
                tplAccSelect.innerHTML += `<option value="${acc.name}">${acc.name}</option>`;
            }
        });
        if (currentVal) tplAccSelect.value = currentVal;
    }

    const tplType = document.getElementById("tpl-type")?.value || "支出";
    updateTemplateCategoryOptions(tplType);
}

function updateRecCategoryOptions(type) {
    const catSelect = document.getElementById("rec-category");
    if(!catSelect) return;
    
    const currentVal = catSelect.value;
    catSelect.innerHTML = '<option value="">類別</option>';
    if(window.allCategoriesForRec) {
        window.allCategoriesForRec
            .filter(c => c.type === type)
            .forEach(c => {
                catSelect.innerHTML += `<option value="${c.name}">${c.name}</option>`;
            });
    }
    if (currentVal && Array.from(catSelect.options).some(o => o.value === currentVal)) {
        catSelect.value = currentVal;
    }
}

function updateTemplateCategoryOptions(type) {
    const catSelect = document.getElementById("tpl-category");
    if(!catSelect) return;
    
    const currentVal = catSelect.value;
    catSelect.innerHTML = '<option value="">類別</option>';
    if(window.allCategoriesForRec) {
        window.allCategoriesForRec
            .filter(c => c.type === type)
            .forEach(c => {
                catSelect.innerHTML += `<option value="${c.name}">${c.name}</option>`;
            });
    }
    if (currentVal && Array.from(catSelect.options).some(o => o.value === currentVal)) {
        catSelect.value = currentVal;
    }
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
    window.allCategoriesForRec = data; // 更新快取
    
    list.innerHTML = "";
    data.forEach(item => {
        const li = document.createElement("li");
        li.className = "list-group-item d-flex justify-content-between align-items-center px-0";
        li.innerHTML = `
            <span>${item.name} <span class="badge bg-secondary ms-1">${item.type}</span></span>
            <button class="btn btn-outline-danger btn-sm" data-id="${item.id}"><i class="bi bi-trash"></i></button>
        `;
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

// 🔥 新增：渲染模版列表
async function renderTemplatesList() {
    const list = document.getElementById("settings-template-list");
    if (!list) return;
    const data = await getTemplates();
    list.innerHTML = "";
    
    if (data.length === 0) {
        list.innerHTML = '<li class="list-group-item text-center text-muted small">尚無快速模版</li>';
        return;
    }

    data.forEach(t => {
        const li = document.createElement("li");
        li.className = "list-group-item d-flex justify-content-between align-items-center px-0";
        li.innerHTML = `
            <div>
                <strong>${t.name}</strong> 
                <small class="text-muted ms-2">${t.amount ? '$'+t.amount : '無金額'} | ${t.category}</small>
            </div>
            <button class="btn btn-outline-danger btn-sm" onclick="window.handleDeleteTemplate('${t.id}')"><i class="bi bi-trash"></i></button>
        `;
        list.appendChild(li);
    });
}

// 刪除處理函式
async function handleDeleteCategory(id, name) {
    if (!confirm(`確定刪除類別「${name}」？`)) return;
    showLoader();
    await deleteCategory(id);
    await renderCategories();
    notifyDataChanged();
    hideLoader();
}

async function handleDeleteAccount(id, name) {
    if (!confirm(`確定刪除帳戶「${name}」？`)) return;
    showLoader();
    await deleteAccount(id);
    await renderAccounts();
    notifyDataChanged();
    hideLoader();
}

async function handleDeleteTag(id, name) {
    if (!confirm(`確定刪除標籤「${name}」？`)) return;
    showLoader();
    await deleteTag(id);
    await renderTags();
    hideLoader();
}

async function renderRecurringRules() {
    const list = document.getElementById("recurring-rules-list");
    if(!list) return;
    
    const rules = await getRecurringRules();
    list.innerHTML = "";
    
    if (rules.length === 0) {
        list.innerHTML = '<li class="list-group-item text-center text-muted small">尚無定期規則</li>';
        return;
    }

    rules.forEach(rule => {
        if(!rule.active) return;
        const freqMap = { monthly: "每月", weekly: "每週", yearly: "每年" };
        
        const li = document.createElement("li");
        li.className = "list-group-item d-flex justify-content-between align-items-center px-0";
        li.innerHTML = `
            <div>
                <strong>${rule.name}</strong> <small class="text-muted">(${freqMap[rule.frequency] || rule.frequency})</small>
                <div class="small text-danger">$${rule.amount} | 下次: ${rule.nextDueDate}</div>
                <div class="small text-muted">${rule.account} / ${rule.category}</div>
            </div>
            <button class="btn btn-outline-danger btn-sm" onclick="window.handleDeleteRule('${rule.id}')"><i class="bi bi-x-lg"></i></button>
        `;
        list.appendChild(li);
    });
}

// 全域刪除函式
window.handleDeleteRule = async (id) => {
    if(!confirm("確定停止此定期規則？")) return;
    showLoader();
    try {
        await deleteRecurringRule(id);
        await renderRecurringRules();
    } catch(e) {
        alert("刪除失敗");
    } finally {
        hideLoader();
    }
};

window.handleDeleteTemplate = async (id) => {
    if(!confirm("確定刪除此模版？")) return;
    showLoader();
    try {
        await deleteTemplate(id);
        await renderTemplatesList();
        notifyDataChanged(); // 通知 Dashboard 更新
    } catch(e) {
        alert("刪除失敗");
    } finally {
        hideLoader();
    }
};