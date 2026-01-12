// js/transactionController.js
import { getTransactions, addTransaction, deleteTransaction, updateTransaction } from "./services/transaction.js"; // 加入 updateTransaction
import { getCategories } from "./services/category.js";
import { getAccounts } from "./services/account.js";
import { showLoader, hideLoader } from "./utils/ui.js";
import { refreshDashboard } from "./dashboardController.js";

let allCategories = [];
let allAccounts = [];
let currentTransactions = []; // 新增：用來暫存目前的交易資料，方便編輯時查找
let editModal = null; // Bootstrap Modal 實例

export async function initTransactionModule() {
    document.getElementById("add-date").valueAsDate = new Date();
    
    // 初始化 Bootstrap Modal
    editModal = new bootstrap.Modal(document.getElementById('editTransactionModal'));

    await loadDropdownData();
    setupEventListeners();
    await renderTransactionList();
}

async function loadDropdownData() {
    try {
        const [cats, accs] = await Promise.all([getCategories(), getAccounts()]);
        allCategories = cats;
        allAccounts = accs;
        
        // 填入帳戶選單 (新增 & 編輯 兩個地方都要填)
        const populateAccounts = (selectId) => {
            const select = document.getElementById(selectId);
            if(select) {
                select.innerHTML = '<option value="" disabled selected>請選擇...</option>';
                allAccounts.forEach(acc => {
                    const option = document.createElement("option");
                    option.value = acc.name;
                    option.textContent = acc.name;
                    select.appendChild(option);
                });
            }
        };
        populateAccounts("add-account");
        populateAccounts("edit-account");

    } catch (e) {
        console.error("載入下拉選單資料失敗", e);
    }
}

function setupEventListeners() {
    // 1. 新增表單 - 類型連動
    setupCategoryDependency("add-type", "add-category");
    
    // 2. 編輯表單 - 類型連動
    setupCategoryDependency("edit-type", "edit-category");

    // 3. 綁定表單送出
    document.getElementById("addTransactionForm").addEventListener("submit", handleAddSubmit);
    document.getElementById("editTransactionForm").addEventListener("submit", handleEditSubmit);
}

// 抽取出來的共用函式：處理類型與類別的連動
function setupCategoryDependency(typeSelectId, categorySelectId) {
    document.getElementById(typeSelectId).addEventListener("change", (e) => {
        updateCategoryOptions(categorySelectId, e.target.value);
    });
}

// 根據類型更新類別選單
function updateCategoryOptions(selectId, type, currentCategoryValue = null) {
    const select = document.getElementById(selectId);
    select.innerHTML = '<option value="" disabled selected>請選擇...</option>';
    select.disabled = false;

    const filteredCats = allCategories.filter(c => c.type === type);
    filteredCats.forEach(c => {
        const option = document.createElement("option");
        option.value = c.name;
        option.textContent = c.name;
        select.appendChild(option);
    });

    // 如果有指定目前的值 (用於編輯回填)，則選取它
    if (currentCategoryValue) {
        select.value = currentCategoryValue;
    }
}

// --- 新增處理 ---
async function handleAddSubmit(e) {
    e.preventDefault();
    showLoader();

    const tagsInput = document.getElementById("add-tags").value;
    const tagsArray = tagsInput ? tagsInput.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];

    const formData = {
        date: document.getElementById("add-date").value,
        type: document.getElementById("add-type").value,
        category: document.getElementById("add-category").value,
        account: document.getElementById("add-account").value,
        item: document.getElementById("add-item").value.trim(),
        amount: document.getElementById("add-amount").value,
        notes: document.getElementById("add-notes").value.trim(),
        tags: tagsArray
    };

    try {
        await addTransaction(formData);
        document.getElementById("addTransactionForm").reset();
        document.getElementById("add-date").valueAsDate = new Date();
        document.getElementById("add-category").innerHTML = '<option value="">請先選擇類型...</option>';
        document.getElementById("add-category").disabled = true;
        await renderTransactionList();
        await refreshDashboard();
    } catch (error) {
        alert("新增失敗: " + error.message);
    } finally {
        hideLoader();
    }
}

// --- 編輯處理 ---
async function handleEditSubmit(e) {
    e.preventDefault();
    showLoader();

    const id = document.getElementById("edit-id").value;
    const tagsInput = document.getElementById("edit-tags").value;
    const tagsArray = tagsInput ? tagsInput.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];

    const formData = {
        date: document.getElementById("edit-date").value,
        type: document.getElementById("edit-type").value,
        category: document.getElementById("edit-category").value,
        account: document.getElementById("edit-account").value,
        item: document.getElementById("edit-item").value.trim(),
        amount: document.getElementById("edit-amount").value,
        notes: document.getElementById("edit-notes").value.trim(),
        tags: tagsArray
    };

    try {
        await updateTransaction(id, formData);
        editModal.hide(); // 關閉視窗
        await renderTransactionList(); // 重新整理列表
        await refreshDashboard();
    } catch (error) {
        alert("更新失敗: " + error.message);
    } finally {
        hideLoader();
    }
}

// --- 列表渲染與操作 ---
async function renderTransactionList() {
    const listEl = document.getElementById("transactionsList");
    listEl.innerHTML = '<div class="text-center text-muted py-4">載入中...</div>';

    try {
        // 抓取資料並存入全域變數 currentTransactions
        currentTransactions = await getTransactions();

        if (currentTransactions.length === 0) {
            listEl.innerHTML = '<div class="text-center text-muted py-4">目前沒有交易紀錄</div>';
            return;
        }

        listEl.innerHTML = '';
        currentTransactions.forEach(tx => {
            const isExpense = tx.type === "支出";
            const amountClass = isExpense ? "text-expense" : "text-income";
            const sign = isExpense ? "-" : "+";
            
            let tagsHtml = '';
            if (tx.tags && tx.tags.length > 0) {
                tagsHtml = `<div class="mt-1">` + 
                    tx.tags.map(t => `<span class="tag-badge">${t}</span>`).join('') + 
                    `</div>`;
            }

            const itemHtml = `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="me-3">
                            <strong class="d-block">${tx.item}</strong>
                            <small class="text-muted">
                                ${tx.dateStr} | ${tx.category} | <strong>${tx.account}</strong>
                            </small>
                            ${tx.notes ? `<div class="text-muted small fst-italic mt-1">${tx.notes}</div>` : ''}
                            ${tagsHtml}
                        </div>
                        <div class="text-end" style="min-width: 100px;">
                            <div class="fw-bold ${amountClass} mb-1" style="font-size: 1.1rem;">
                                ${sign} $${parseFloat(tx.amount).toLocaleString()}
                            </div>
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-secondary" onclick="window.handleOpenEdit('${tx.id}')">
                                    <i class="bi bi-pencil"></i>
                                </button>
                                <button class="btn btn-outline-danger" onclick="window.handleDeleteTx('${tx.id}')">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            listEl.innerHTML += itemHtml;
        });

    } catch (e) {
        listEl.innerHTML = `<div class="text-danger p-3">載入失敗: ${e.message}</div>`;
    }
}

// --- 全域掛載函式 (讓 HTML onclick 呼叫) ---

// 開啟編輯視窗
window.handleOpenEdit = function(id) {
    // 從暫存資料中找到該筆交易
    const tx = currentTransactions.find(t => t.id === id);
    if (!tx) return;

    // 回填資料
    document.getElementById("edit-id").value = tx.id;
    document.getElementById("edit-date").value = tx.dateStr;
    document.getElementById("edit-type").value = tx.type;
    document.getElementById("edit-item").value = tx.item;
    document.getElementById("edit-amount").value = tx.amount;
    document.getElementById("edit-account").value = tx.account;
    document.getElementById("edit-tags").value = tx.tags ? tx.tags.join(", ") : "";
    document.getElementById("edit-notes").value = tx.notes;

    // 關鍵：根據類型手動觸發一次類別更新，並帶入目前的類別值
    updateCategoryOptions("edit-category", tx.type, tx.category);

    // 顯示 Modal
    editModal.show();
};

window.handleDeleteTx = async function(id) {
    if (!confirm("確定要刪除這筆交易嗎？")) return;
    showLoader();
    try {
        await deleteTransaction(id);
        await renderTransactionList();
        await refreshDashboard();
    } catch (e) {
        alert("刪除失敗: " + e.message);
    } finally {
        hideLoader();
    }
};