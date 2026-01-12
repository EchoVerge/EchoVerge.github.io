// js/transactionController.js
import { getTransactions, addTransaction, deleteTransaction, updateTransaction, addTransfer, addAdjustment } from "./services/transaction.js";
import { getCategories } from "./services/category.js";
import { getAccounts } from "./services/account.js";
import { showLoader, hideLoader } from "./utils/ui.js";
import { refreshDashboard } from "./dashboardController.js";

let allCategories = [];
let allAccounts = [];
let currentTransactions = []; 
let editModal = null;
let transferModal = null;
let adjustmentModal = null;

// 時間導覽變數
let currentViewUnit = 'month'; // year, month, week, day
let currentBaseDate = new Date();

export async function initTransactionModule() {
    // 初始化 Modals
    const editEl = document.getElementById('editTransactionModal');
    if(editEl) editModal = new bootstrap.Modal(editEl);
    
    const transEl = document.getElementById('transferModal');
    if(transEl) transferModal = new bootstrap.Modal(transEl);
    
    const adjEl = document.getElementById('adjustmentModal');
    if(adjEl) adjustmentModal = new bootstrap.Modal(adjEl);

    // 設定預設日期
    const addDateEl = document.getElementById("add-date");
    if(addDateEl) addDateEl.valueAsDate = new Date();
    
    const transDateEl = document.getElementById("transfer-date");
    if(transDateEl) transDateEl.valueAsDate = new Date();

    await loadDropdownData();
    setupEventListeners();
    
    // 初始化時間篩選
    updateDateFiltersByUnit(0);

    // 🔥 監聽資料變更事件 (當設定頁新增類別/帳戶時觸發)
    document.addEventListener("zenwallet:dataChanged", async () => {
        console.log("偵測到資料變更，重新載入選單...");
        await loadDropdownData();
        await renderTransactionList(true); // 重新渲染列表以防帳戶名稱變更
    });
}

// 載入並填充所有下拉選單
async function loadDropdownData() {
    try {
        const [cats, accs] = await Promise.all([getCategories(), getAccounts()]);
        allCategories = cats;
        allAccounts = accs;
        
        // 定義需要填充的 select ID 列表
        const accountSelects = ["add-account", "edit-account", "transfer-from-account", "transfer-to-account"];
        
        accountSelects.forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                // 保留目前選中的值 (如果有)
                const currentVal = el.value;
                el.innerHTML = '<option value="" disabled selected>請選擇...</option>';
                
                allAccounts.forEach(acc => {
                    // 轉帳選單排除投資帳戶 (選擇性)
                    if(id.includes('transfer') && acc.name.includes("投資")) return;
                    el.innerHTML += `<option value="${acc.name}">${acc.name}</option>`;
                });

                // 嘗試恢復選取狀態
                if (currentVal && Array.from(el.options).some(o => o.value === currentVal)) {
                    el.value = currentVal;
                }
            }
        });

        // 類別選單通常是連動的，但我們可以先初始化 edit-category 以防萬一
        // (實際顯示時會由 updateCategoryOptions 動態產生)

    } catch (e) {
        console.error("載入下拉選單失敗", e);
    }
}

function setupEventListeners() {
    // 交易 CRUD
    setupCategoryDependency("add-type", "add-category");
    setupCategoryDependency("edit-type", "edit-category");
    
    const addForm = document.getElementById("addTransactionForm");
    if(addForm) addForm.addEventListener("submit", handleAddSubmit);
    
    const editForm = document.getElementById("editTransactionForm");
    if(editForm) editForm.addEventListener("submit", handleEditSubmit);

    // 轉帳與核對
    const transForm = document.getElementById("addTransferForm");
    if(transForm) transForm.addEventListener("submit", handleTransferSubmit);
    
    const adjustBtn = document.querySelector('#adjustmentModal .btn-primary');
    if(adjustBtn) adjustBtn.addEventListener("click", handleAdjustmentSubmit);

    // 時間導覽按鈕
    const prevBtn = document.getElementById("nav-prev");
    if(prevBtn) prevBtn.addEventListener("click", () => navigateTime(-1));
    
    const nextBtn = document.getElementById("nav-next");
    if(nextBtn) nextBtn.addEventListener("click", () => navigateTime(1));
    
    document.querySelectorAll('input[name="viewUnit"]').forEach(radio => {
        radio.addEventListener("change", (e) => {
            currentViewUnit = e.target.id.replace('unit-', '');
            updateDateFiltersByUnit(0);
        });
    });

    // 搜尋框監聽
    const searchInput = document.getElementById("search-keyword");
    if(searchInput) {
        searchInput.addEventListener("input", () => {
            renderTransactionList(true); 
        });
    }
}

function setupCategoryDependency(typeId, catId) {
    const typeEl = document.getElementById(typeId);
    if(typeEl) {
        typeEl.addEventListener("change", (e) => {
            const exclude = typeId.includes('add') ? ["轉帳支出", "轉帳收入", "帳目調整", "投資支出", "投資收入"] : [];
            updateCategoryOptions(catId, e.target.value, null, exclude);
        });
    }
}

/**
 * 更新類別選項
 */
function updateCategoryOptions(selectId, type, currentVal = null, exclude = []) {
    const select = document.getElementById(selectId);
    if(!select) return;

    select.innerHTML = '<option value="" disabled selected>請選擇...</option>';
    select.disabled = false;
    
    allCategories.filter(c => c.type === type).forEach(c => {
        if (!exclude.includes(c.name)) {
            select.innerHTML += `<option value="${c.name}">${c.name}</option>`;
        }
    });
    
    if (currentVal) select.value = currentVal;
}

// --- 時間導覽邏輯 ---
function navigateTime(direction) {
    updateDateFiltersByUnit(direction);
}

function updateDateFiltersByUnit(direction) {
    if (direction !== 0) {
        if (currentViewUnit === 'year') currentBaseDate.setFullYear(currentBaseDate.getFullYear() + direction);
        else if (currentViewUnit === 'month') currentBaseDate.setMonth(currentBaseDate.getMonth() + direction);
        else if (currentViewUnit === 'week') currentBaseDate.setDate(currentBaseDate.getDate() + (direction * 7));
        else if (currentViewUnit === 'day') currentBaseDate.setDate(currentBaseDate.getDate() + direction);
    }

    let startDate, endDate;
    const y = currentBaseDate.getFullYear();
    const m = currentBaseDate.getMonth();
    const d = currentBaseDate.getDate();
    const displayLabel = document.getElementById("current-view-display");

    const fmt = (date) => date.toISOString().split('T')[0];

    if (currentViewUnit === 'year') {
        startDate = new Date(y, 0, 1);
        endDate = new Date(y, 11, 31);
        if(displayLabel) displayLabel.textContent = `${y} 年`;
    } else if (currentViewUnit === 'month') {
        startDate = new Date(y, m, 1);
        endDate = new Date(y, m + 1, 0);
        if(displayLabel) displayLabel.textContent = `${y} 年 ${m + 1} 月`;
    } else if (currentViewUnit === 'week') {
        const dayOfWeek = currentBaseDate.getDay() || 7; 
        startDate = new Date(currentBaseDate);
        startDate.setDate(d - dayOfWeek + 1); 
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6); 
        if(displayLabel) displayLabel.textContent = `${fmt(startDate)} ~ ${fmt(endDate)}`;
    } else { 
        startDate = new Date(currentBaseDate);
        endDate = new Date(currentBaseDate);
        if(displayLabel) displayLabel.textContent = fmt(startDate);
    }

    document.getElementById("filter-start-date").value = fmt(startDate);
    document.getElementById("filter-end-date").value = fmt(endDate);

    renderTransactionList(true);
}

// --- CRUD 操作 ---

async function handleAddSubmit(e) {
    e.preventDefault();
    showLoader();
    
    const formData = {
        date: document.getElementById("add-date").value,
        type: document.getElementById("add-type").value,
        category: document.getElementById("add-category").value,
        account: document.getElementById("add-account").value,
        item: document.getElementById("add-item").value,
        amount: document.getElementById("add-amount").value,
        notes: document.getElementById("add-notes").value,
        tags: document.getElementById("add-tags").value.split(/[,，]/).map(t=>t.trim()).filter(Boolean)
    };

    try {
        await addTransaction(formData);
        document.getElementById("addTransactionForm").reset();
        document.getElementById("add-date").valueAsDate = new Date();
        document.getElementById("add-category").innerHTML = '<option value="">類別</option>';
        document.getElementById("add-category").disabled = true;
        
        await renderTransactionList(true); 
        await refreshDashboard();
    } catch (err) { alert(err.message); } finally { hideLoader(); }
}

async function handleEditSubmit(e) {
    e.preventDefault();
    showLoader();
    const id = document.getElementById("edit-id").value;
    
    const formData = {
        date: document.getElementById("edit-date").value,
        type: document.getElementById("edit-type").value,
        category: document.getElementById("edit-category").value,
        account: document.getElementById("edit-account").value,
        item: document.getElementById("edit-item").value,
        amount: document.getElementById("edit-amount").value,
        notes: document.getElementById("edit-notes").value,
        tags: document.getElementById("edit-tags").value.split(/[,，]/).map(t=>t.trim()).filter(Boolean)
    };

    try {
        await updateTransaction(id, formData);
        editModal.hide();
        await renderTransactionList(true);
        await refreshDashboard();
    } catch (err) { alert(err.message); } finally { hideLoader(); }
}

async function handleTransferSubmit(e) {
    e.preventDefault();
    const from = document.getElementById("transfer-from-account").value;
    const to = document.getElementById("transfer-to-account").value;
    const amount = document.getElementById("transfer-amount").value;
    
    if (from === to) { alert("轉出與轉入帳戶不能相同"); return; }

    showLoader();
    try {
        await addTransfer({
            fromAccount: from,
            toAccount: to,
            amount: amount,
            date: document.getElementById("transfer-date").value,
            notes: document.getElementById("transfer-notes").value
        });
        transferModal.hide();
        await renderTransactionList(true);
        await refreshDashboard();
        alert("轉帳成功");
    } catch (err) { alert(err.message); } finally { hideLoader(); }
}

window.showAdjustmentModal = function(accountName, currentBalance) {
    document.getElementById("adjust-account-name").textContent = accountName;
    document.getElementById("adjust-account-name-hidden").value = accountName;
    document.getElementById("adjust-calculated-balance").value = currentBalance;
    document.getElementById("adjust-actual-balance").value = "";
    adjustmentModal.show();
};

async function handleAdjustmentSubmit() {
    const account = document.getElementById("adjust-account-name-hidden").value;
    const current = document.getElementById("adjust-calculated-balance").value;
    const actual = document.getElementById("adjust-actual-balance").value;

    if(!actual) { alert("請輸入實際金額"); return; }

    showLoader();
    try {
        const result = await addAdjustment({
            account: account,
            currentBalance: current,
            actualBalance: actual
        });
        alert(result.message);
        adjustmentModal.hide();
        await renderTransactionList(true);
        await refreshDashboard();
    } catch (err) { alert(err.message); } finally { hideLoader(); }
}

async function renderTransactionList(useFilter = false) {
    const listEl = document.getElementById("transactionsList");
    listEl.innerHTML = '<div class="text-center text-muted py-4">載入中...</div>';

    try {
        currentTransactions = await getTransactions(); 
        let displayData = currentTransactions;

        if (useFilter) {
            const start = document.getElementById("filter-start-date").value;
            const end = document.getElementById("filter-end-date").value;
            const keyword = document.getElementById("search-keyword") ? document.getElementById("search-keyword").value.toLowerCase().trim() : "";

            displayData = displayData.filter(tx => {
                if (start && end) {
                    if (tx.dateStr < start || tx.dateStr > end) return false;
                }
                if (keyword) {
                    const itemMatch = tx.item.toLowerCase().includes(keyword);
                    const notesMatch = tx.notes && tx.notes.toLowerCase().includes(keyword);
                    if (!itemMatch && !notesMatch) return false;
                }
                return true;
            });
        }

        if (displayData.length === 0) {
            listEl.innerHTML = '<div class="text-center text-muted py-4">無資料</div>';
        } else {
            listEl.innerHTML = '';
            displayData.forEach(tx => {
                const isExpense = tx.type === "支出";
                const amountClass = isExpense ? "text-expense" : "text-income";
                listEl.innerHTML += `
                    <div class="list-group-item">
                        <div class="d-flex justify-content-between align-items-center">
                            <div style="min-width: 0;">
                                <div class="fw-bold text-truncate">${tx.item}</div>
                                <div class="text-muted small">${tx.dateStr} | ${tx.category} | ${tx.account}</div>
                            </div>
                            <div class="text-end flex-shrink-0 ms-2">
                                <div class="${amountClass} fw-bold mb-1">${isExpense?'-':'+'} $${parseFloat(tx.amount).toLocaleString()}</div>
                                <div class="btn-group btn-group-sm">
                                    <button class="btn btn-outline-secondary py-0" onclick="window.handleOpenEdit('${tx.id}')"><i class="bi bi-pencil"></i></button>
                                    <button class="btn btn-outline-danger py-0" onclick="window.handleDeleteTx('${tx.id}')"><i class="bi bi-trash"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

    } catch (e) { listEl.innerHTML = "載入失敗"; console.error(e); }
}

window.handleOpenEdit = function(id) {
    const tx = currentTransactions.find(t => t.id === id);
    if (!tx) { console.error("找不到交易 ID:", id); return; }

    document.getElementById("edit-id").value = tx.id;
    document.getElementById("edit-date").value = tx.dateStr;
    document.getElementById("edit-type").value = tx.type;
    document.getElementById("edit-item").value = tx.item;
    document.getElementById("edit-amount").value = tx.amount;
    document.getElementById("edit-account").value = tx.account;
    document.getElementById("edit-tags").value = tx.tags ? tx.tags.join(", ") : "";
    document.getElementById("edit-notes").value = tx.notes;

    updateCategoryOptions("edit-category", tx.type, tx.category, []);
    editModal.show();
};

window.handleDeleteTx = async function(id) {
    if(!confirm("確定刪除?")) return;
    showLoader();
    try {
        await deleteTransaction(id);
        await renderTransactionList(true);
        await refreshDashboard();
    } catch(e) { alert(e.message); } finally { hideLoader(); }
};

window.clearFilters = function() {
    updateDateFiltersByUnit(0);
}

window.showTransferModal = function() {
    document.getElementById("addTransferForm").reset();
    document.getElementById("transfer-date").valueAsDate = new Date();
    transferModal.show();
}