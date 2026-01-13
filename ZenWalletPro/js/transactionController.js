// js/transactionController.js
import { getTransactions, addTransaction, deleteTransaction, updateTransaction, addTransfer, addAdjustment } from "./services/transaction.js";
import { getCategories } from "./services/category.js";
import { getAccounts } from "./services/account.js";
import { updatePortfolioByTransaction } from "./services/stockService.js";
import { fetchYahooPrice } from "./services/portfolio.js"; // 引入股價 API
import { showLoader, hideLoader } from "./utils/ui.js";
import { refreshDashboard } from "./dashboardController.js";

let allCategories = [];
let allAccounts = [];
let currentTransactions = []; 
let editModal = null;
let transferModal = null;
let adjustmentModal = null;
let currentViewUnit = 'month'; 
let currentBaseDate = new Date();

export async function initTransactionModule() {
    const editEl = document.getElementById('editTransactionModal');
    if(editEl) editModal = new bootstrap.Modal(editEl);
    
    const transEl = document.getElementById('transferModal');
    if(transEl) transferModal = new bootstrap.Modal(transEl);
    
    const adjEl = document.getElementById('adjustmentModal');
    if(adjEl) adjustmentModal = new bootstrap.Modal(adjEl);

    document.getElementById("add-date").valueAsDate = new Date();
    document.getElementById("transfer-date").valueAsDate = new Date();

    await loadDropdownData();
    setupEventListeners();
    setupStockLogic(); // 啟動股票邏輯
    
    updateDateFiltersByUnit(0);

    document.addEventListener("zenwallet:dataChanged", async () => {
        await loadDropdownData();
        await renderTransactionList(true); 
    });
}

// 🔥 股票邏輯：含自動計算與線上抓取
function setupStockLogic() {
    const ids = ['add', 'edit'];
    
    ids.forEach(prefix => {
        // 1. 顯示/隱藏
        const tagInput = document.getElementById(`${prefix}-tags`);
        const stockContainer = document.getElementById(prefix === 'add' ? 'stock-fields' : 'edit-stock-fields');
        if (tagInput && stockContainer) {
            tagInput.addEventListener('input', (e) => {
                if (e.target.value.includes('#股票')) stockContainer.classList.remove('d-none');
                else stockContainer.classList.add('d-none');
            });
        }

        // 2. 自動計算
        const qtyIn = document.getElementById(prefix === 'add' ? 'stock-qty' : 'edit-stock-qty');
        const priceIn = document.getElementById(prefix === 'add' ? 'stock-price' : 'edit-stock-price');
        const feeIn = document.getElementById(prefix === 'add' ? 'stock-fee' : 'edit-stock-fee');
        const amountIn = document.getElementById(`${prefix}-amount`);
        const typeIn = document.getElementById(`${prefix}-type`);
        const displayEl = document.getElementById(prefix === 'add' ? 'stock-total-display' : 'edit-stock-total-display');

        const autoCalc = () => {
            if (!qtyIn || !priceIn || !amountIn) return;
            const q = parseFloat(qtyIn.value) || 0;
            const p = parseFloat(priceIn.value) || 0;
            const f = parseFloat(feeIn?.value) || 0;
            const type = typeIn.value;

            if (q > 0 && p > 0) {
                let total = (type === '支出') ? (q * p) + f : (q * p) - f;
                amountIn.value = Math.round(total);
                if(displayEl) displayEl.textContent = `試算: $${total.toLocaleString()}`;
            }
        };

        if(qtyIn) qtyIn.addEventListener('input', autoCalc);
        if(priceIn) priceIn.addEventListener('input', autoCalc);
        if(feeIn) feeIn.addEventListener('input', autoCalc);
        if(typeIn) typeIn.addEventListener('change', autoCalc);

        // 3. 🔥 線上抓取股價按鈕
        const fetchBtn = document.getElementById(prefix === 'add' ? 'btn-fetch-stock-price-add' : 'btn-fetch-stock-price-edit');
        if (fetchBtn) {
            fetchBtn.addEventListener('click', async () => {
                const tickerInput = document.getElementById(prefix === 'add' ? 'stock-ticker' : 'edit-stock-ticker');
                const ticker = tickerInput.value.trim();
                if (!ticker) return alert("請先輸入代號");
                
                showLoader();
                const price = await fetchYahooPrice(ticker);
                hideLoader();
                
                if (price) {
                    priceIn.value = price;
                    autoCalc(); // 觸發重算
                } else {
                    alert("抓取失敗，請確認代號 (台股請加 .TW)");
                }
            });
        }
    });
}

async function loadDropdownData() {
    try {
        const [cats, accs] = await Promise.all([getCategories(), getAccounts()]);
        allCategories = cats;
        allAccounts = accs;
        
        ["add-account", "edit-account", "transfer-from-account", "transfer-to-account"].forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                const currentVal = el.value;
                el.innerHTML = '<option value="" disabled selected>請選擇...</option>';
                allAccounts.forEach(acc => {
                    if(id.includes('transfer') && acc.name.includes("投資")) return;
                    el.innerHTML += `<option value="${acc.name}">${acc.name}</option>`;
                });
                if (currentVal) el.value = currentVal;
            }
        });
    } catch (e) {
        console.error("載入下拉選單失敗", e);
    }
}

function setupEventListeners() {
    setupCategoryDependency("add-type", "add-category");
    setupCategoryDependency("edit-type", "edit-category");
    
    document.getElementById("addTransactionForm")?.addEventListener("submit", handleAddSubmit);
    document.getElementById("editTransactionForm")?.addEventListener("submit", handleEditSubmit);
    document.getElementById("addTransferForm")?.addEventListener("submit", handleTransferSubmit);
    
    const adjustBtn = document.querySelector('#adjustmentModal .btn-primary');
    if(adjustBtn) adjustBtn.addEventListener("click", handleAdjustmentSubmit);

    document.getElementById("nav-prev")?.addEventListener("click", () => navigateTime(-1));
    document.getElementById("nav-next")?.addEventListener("click", () => navigateTime(1));
    
    document.querySelectorAll('input[name="viewUnit"]').forEach(radio => {
        radio.addEventListener("change", (e) => {
            currentViewUnit = e.target.id.replace('unit-', '');
            updateDateFiltersByUnit(0);
        });
    });

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
    
    const tags = document.getElementById("add-tags").value.split(/[,，]/).map(t=>t.trim()).filter(Boolean);
    const isStock = tags.includes("#股票");

    const formData = {
        date: document.getElementById("add-date").value,
        type: document.getElementById("add-type").value,
        category: document.getElementById("add-category").value,
        account: document.getElementById("add-account").value,
        item: document.getElementById("add-item").value,
        amount: document.getElementById("add-amount").value,
        notes: document.getElementById("add-notes").value,
        tags: tags,
        isStock: isStock,
        stockTicker: isStock ? document.getElementById("stock-ticker").value.trim().toUpperCase() : null,
        stockQty: isStock ? document.getElementById("stock-qty").value : null,
        stockPrice: isStock ? document.getElementById("stock-price").value : null,
        stockFee: isStock ? document.getElementById("stock-fee").value : null,
    };

    try {
        if (isStock) {
            if(!formData.stockTicker || !formData.stockQty || !formData.stockPrice) {
                throw new Error("請完整填寫股票資訊（代號、股數、單價）");
            }
            await updatePortfolioByTransaction(formData);
        }

        await addTransaction(formData);
        
        document.getElementById("addTransactionForm").reset();
        document.getElementById("add-date").valueAsDate = new Date();
        document.getElementById("add-category").innerHTML = '<option value="">類別</option>';
        document.getElementById("add-category").disabled = true;
        document.getElementById("stock-fields").classList.add("d-none");
        
        await renderTransactionList(true); 
        await refreshDashboard();
    } catch (err) { alert(err.message); } finally { hideLoader(); }
}

async function handleEditSubmit(e) {
    e.preventDefault();
    showLoader();
    const id = document.getElementById("edit-id").value;
    
    const tagsStr = document.getElementById("edit-tags").value;
    const tags = tagsStr.split(/[,，]/).map(t=>t.trim()).filter(Boolean);
    const isStock = tags.includes("#股票");

    const formData = {
        date: document.getElementById("edit-date").value,
        type: document.getElementById("edit-type").value,
        category: document.getElementById("edit-category").value,
        account: document.getElementById("edit-account").value,
        item: document.getElementById("edit-item").value,
        amount: document.getElementById("edit-amount").value,
        notes: document.getElementById("edit-notes").value,
        tags: tags,
        isStock: isStock,
        stockTicker: isStock ? document.getElementById("edit-stock-ticker").value.trim().toUpperCase() : null,
        stockQty: isStock ? document.getElementById("edit-stock-qty").value : null,
        stockPrice: isStock ? document.getElementById("edit-stock-price").value : null,
        stockFee: isStock ? document.getElementById("edit-stock-fee").value : null,
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
                    const tickerMatch = tx.stockTicker && tx.stockTicker.toLowerCase().includes(keyword);
                    if (!itemMatch && !notesMatch && !tickerMatch) return false;
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
                // 🔥 若有股票代號，顯示 Badge
                const stockBadge = tx.stockTicker ? `<span class="badge bg-light text-dark border ms-1">${tx.stockTicker}</span>` : '';

                listEl.innerHTML += `
                    <div class="list-group-item">
                        <div class="d-flex justify-content-between align-items-center">
                            <div style="min-width: 0;">
                                <div class="fw-bold text-truncate">${tx.item} ${stockBadge}</div>
                                <div class="text-muted small">${tx.dateStr} | ${tx.category} | ${tx.account}</div>
                            </div>
                            <div class="text-end flex-shrink-0 ms-2">
                                <div class="${amountClass} fw-bold mb-1 sensitive">${isExpense?'-':'+'} $${parseFloat(tx.amount).toLocaleString()}</div>
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

    // 🔥 回填股票資訊
    if (tx.isStock) {
        document.getElementById("edit-stock-fields").classList.remove("d-none");
        document.getElementById("edit-stock-ticker").value = tx.stockTicker || "";
        document.getElementById("edit-stock-qty").value = tx.stockQty || "";
        document.getElementById("edit-stock-price").value = tx.stockPrice || "";
        document.getElementById("edit-stock-fee").value = tx.stockFee || "";
        // 觸發一次試算顯示
        const total = ((parseFloat(tx.stockQty)||0) * (parseFloat(tx.stockPrice)||0)) + (tx.type==='支出' ? (parseFloat(tx.stockFee)||0) : -(parseFloat(tx.stockFee)||0));
        document.getElementById("edit-stock-total-display").textContent = `試算: $${Math.round(total).toLocaleString()}`;
    } else {
        document.getElementById("edit-stock-fields").classList.add("d-none");
        document.getElementById("edit-stock-ticker").value = "";
        document.getElementById("edit-stock-qty").value = "";
        document.getElementById("edit-stock-price").value = "";
        document.getElementById("edit-stock-fee").value = "0";
    }

    updateCategoryOptions("edit-category", tx.type, tx.category, []);
    editModal.show();
};

window.handleDeleteTx = async function(id) {
    if(!confirm("確定刪除? (注意：刪除股票交易不會自動回滾投資組合，請手動修正)")) return;
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

window.showAdjustmentModal = function(accountName, currentBalance) {
    document.getElementById("adjust-account-name").textContent = accountName;
    document.getElementById("adjust-account-name-hidden").value = accountName;
    document.getElementById("adjust-calculated-balance").value = currentBalance;
    document.getElementById("adjust-actual-balance").value = "";
    adjustmentModal.show();
};