// js/transactionController.js
import { getTransactions, addTransaction, deleteTransaction, updateTransaction, addTransfer, addAdjustment } from "./services/transaction.js";
import { getCategories } from "./services/category.js";
import { getAccounts } from "./services/account.js";
import { updatePortfolioByTransaction } from "./services/stockService.js";
import { fetchYahooPrice } from "./services/portfolio.js";
import { showLoader, hideLoader } from "./utils/ui.js";
import { refreshDashboard } from "./dashboardController.js";

let allCategories = [];
let allAccounts = [];
let currentTransactions = [];
let editModal = null;
let transferModal = null;
let adjustmentModal = null;
let stockModal = null; // 股票專用 Modal
let currentViewUnit = 'month';
let currentBaseDate = new Date();

export async function initTransactionModule() {
    // 初始化所有 Modals
    const editEl = document.getElementById('editTransactionModal');
    if (editEl) editModal = new bootstrap.Modal(editEl);

    const transEl = document.getElementById('transferModal');
    if (transEl) transferModal = new bootstrap.Modal(transEl);

    const adjEl = document.getElementById('adjustmentModal');
    if (adjEl) adjustmentModal = new bootstrap.Modal(adjEl);

    const stockEl = document.getElementById('stockPurchaseModal');
    if (stockEl) stockModal = new bootstrap.Modal(stockEl);

    // 設定日期預設值
    document.getElementById("add-date").valueAsDate = new Date();
    document.getElementById("transfer-date").valueAsDate = new Date();
    const spDate = document.getElementById("sp-date");
    if (spDate) spDate.valueAsDate = new Date();

    await loadDropdownData();
    setupEventListeners();
    setupStockLogic(); // 設定股票相關邏輯

    updateDateFiltersByUnit(0);

    document.addEventListener("zenwallet:dataChanged", async () => {
        await loadDropdownData();
        await renderTransactionList(true);
    });
}

function setupStockLogic() {
    // 1. 綁定開啟股票 Modal 的按鈕
    const spBtn = document.getElementById("btn-open-stock-modal");
    if (spBtn) {
        spBtn.addEventListener("click", () => {
            // 如果不是連續模式，開啟前重置部分欄位
            if (!document.getElementById('sp-continuous').checked) {
                document.getElementById('stockPurchaseForm').reset();
                document.getElementById('sp-date').valueAsDate = new Date();
                document.getElementById('sp-msg').textContent = '';
            }
            stockModal.show();
        });
    }

    // 2. 綁定股票 Modal 的計算與 API (prefix: 'sp')
    setupCalculatorAndFetch('sp');

    // 3. 綁定編輯 Modal 的計算與 API (prefix: 'edit-stock')
    // 另外處理編輯 Modal 的顯示切換
    const editCatSelect = document.getElementById('edit-category');
    const editStockContainer = document.getElementById('edit-stock-fields');
    if (editCatSelect && editStockContainer) {
        editCatSelect.addEventListener('change', (e) => {
            if (e.target.value === '投資') editStockContainer.classList.remove('d-none');
            else editStockContainer.classList.add('d-none');
        });
    }
    setupCalculatorAndFetch('edit-stock');
}

// 通用：自動計算 (股數/單價 <-> 總額) 與 線上抓價
function setupCalculatorAndFetch(prefix) {
    const qtyIn = document.getElementById(`${prefix}-qty`);
    const priceIn = document.getElementById(`${prefix}-price`);
    const feeIn = document.getElementById(`${prefix}-fee`);
    // 注意：新 Modal 總額 ID 為 sp-total，編輯 Modal 為 edit-amount
    const totalIn = document.getElementById(prefix === 'sp' ? 'sp-total' : 'edit-amount');
    const fetchBtn = document.getElementById(prefix === 'sp' ? 'btn-sp-fetch' : 'btn-fetch-stock-price-edit');
    const tickerIn = document.getElementById(`${prefix}-ticker`);

    const performCalc = (e) => {
        if (!qtyIn || !priceIn || !totalIn) return;
        const target = e ? e.target : null;
        const isTotalDriver = target === totalIn; // 是否由總金額驅動反算

        const q = parseFloat(qtyIn.value) || 0;
        const p = parseFloat(priceIn.value) || 0;
        const f = parseFloat(feeIn?.value) || 0;
        const total = parseFloat(totalIn.value) || 0;

        if (isTotalDriver) {
            // 反算：總額 -> 股數 (假設單價已知)
            if (total > 0) {
                // 支出(買入)邏輯：Total = (Qty * Price) + Fee  =>  Qty = (Total - Fee) / Price
                const base = total - f;
                if (base > 0 && p > 0) {
                    qtyIn.value = parseFloat((base / p).toFixed(4));
                }
            }
        } else {
            // 正算：股數 * 單價 -> 總額
            if (q > 0 && p > 0) {
                totalIn.value = Math.round((q * p) + f);
            }
        }
    };

    if (qtyIn) qtyIn.addEventListener('input', performCalc);
    if (priceIn) priceIn.addEventListener('input', performCalc);
    if (feeIn) feeIn.addEventListener('input', performCalc);
    if (totalIn) totalIn.addEventListener('input', performCalc);

    // API 抓價
    if (fetchBtn) {
        fetchBtn.addEventListener('click', async () => {
            const ticker = tickerIn.value.trim();
            if (!ticker) return alert("請輸入代號");
            showLoader();
            const price = await fetchYahooPrice(ticker);
            hideLoader();
            if (price) {
                priceIn.value = price;
                performCalc(); // 觸發重算
            } else {
                alert("抓取失敗");
            }
        });
    }
}

// 處理新版股票 Modal 送出
async function handleStockPurchaseSubmit(e) {
    e.preventDefault();
    showLoader();

    const date = document.getElementById('sp-date').value;
    const account = document.getElementById('sp-account').value;
    const ticker = document.getElementById('sp-ticker').value.trim().toUpperCase();
    const qty = document.getElementById('sp-qty').value;
    const price = document.getElementById('sp-price').value;
    const fee = document.getElementById('sp-fee').value;
    const total = document.getElementById('sp-total').value;
    const isContinuous = document.getElementById('sp-continuous').checked;
    const msgEl = document.getElementById('sp-msg');

    if (!ticker || !qty || !price || !total || !account) {
        alert("請完整填寫欄位");
        hideLoader();
        return;
    }

    const formData = {
        date: date,
        type: '支出', // 股票購買固定為支出
        category: '投資', // 固定類別
        account: account,
        item: `投資${ticker}-${qty}股`, // 自動產生名稱
        amount: total,
        notes: '股票交易',
        tags: ['#投資'], // 自動標籤
        isStock: true,
        stockTicker: ticker,
        stockQty: qty,
        stockPrice: price,
        stockFee: fee
    };

    try {
        // 1. 更新庫存
        await updatePortfolioByTransaction(formData);
        // 2. 新增交易
        await addTransaction(formData);

        // 3. 處理連續輸入
        if (isContinuous) {
            // 清空變動欄位，保留 日期 與 帳戶
            document.getElementById('sp-ticker').value = '';
            document.getElementById('sp-qty').value = '';
            document.getElementById('sp-price').value = '';
            document.getElementById('sp-total').value = '';
            document.getElementById('sp-fee').value = '0';

            msgEl.textContent = `✅ 已新增 ${ticker}`;
            msgEl.className = "text-success small ms-2 fw-bold";
            setTimeout(() => { msgEl.textContent = ''; }, 3000);

            await renderTransactionList(true);
            await refreshDashboard();
        } else {
            // 非連續：關閉並重整
            stockModal.hide();
            document.getElementById('stockPurchaseForm').reset();
            await renderTransactionList(true);
            await refreshDashboard();
        }
    } catch (err) {
        alert(err.message);
    } finally {
        hideLoader();
    }
}

// 一般新增交易 (不再處理股票邏輯)
async function handleAddSubmit(e) {
    e.preventDefault();
    showLoader();
    const tags = document.getElementById("add-tags").value.split(/[,，]/).map(t => t.trim()).filter(Boolean);
    const category = document.getElementById("add-category").value;

    // 如果用戶在一般介面選投資，我們只當作一般記帳，不連動 Portfolio (因為股票有專用按鈕)

    const formData = {
        date: document.getElementById("add-date").value,
        type: document.getElementById("add-type").value,
        category: category,
        account: document.getElementById("add-account").value,
        item: document.getElementById("add-item").value,
        amount: document.getElementById("add-amount").value,
        notes: document.getElementById("add-notes").value,
        tags: tags
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
    const tags = document.getElementById("edit-tags").value.split(/[,，]/).map(t => t.trim()).filter(Boolean);
    const category = document.getElementById("edit-category").value;
    const isStock = category === "投資"; // 編輯模式仍需判斷

    const formData = {
        date: document.getElementById("edit-date").value,
        type: document.getElementById("edit-type").value,
        category: category,
        account: document.getElementById("edit-account").value,
        item: document.getElementById("edit-item").value,
        amount: document.getElementById("edit-amount").value,
        notes: document.getElementById("edit-notes").value,
        tags: tags,
        // 編輯模式：若原本是股票，允許修改數值 (注意：這不會自動回滾 Portfolio，僅修改紀錄)
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

async function loadDropdownData() {
    try {
        const [cats, accs] = await Promise.all([getCategories(), getAccounts()]);
        allCategories = cats;
        allAccounts = accs;

        // 包含新的 sp-account
        const accountSelects = ["add-account", "edit-account", "transfer-from-account", "transfer-to-account", "sp-account"];

        accountSelects.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const currentVal = el.value;
                el.innerHTML = '<option value="" disabled selected>請選擇...</option>';
                allAccounts.forEach(acc => {
                    if (id.includes('transfer') && acc.name.includes("投資")) return;
                    el.innerHTML += `<option value="${acc.name}">${acc.name}</option>`;
                });
                if (currentVal) el.value = currentVal;
            }
        });
    } catch (e) { console.error("載入選單失敗", e); }
}

function setupEventListeners() {
    setupCategoryDependency("add-type", "add-category");
    setupCategoryDependency("edit-type", "edit-category");

    document.getElementById("addTransactionForm")?.addEventListener("submit", handleAddSubmit);
    document.getElementById("editTransactionForm")?.addEventListener("submit", handleEditSubmit);
    document.getElementById("addTransferForm")?.addEventListener("submit", handleTransferSubmit);
    document.getElementById("stockPurchaseForm")?.addEventListener("submit", handleStockPurchaseSubmit); // 🔥 綁定

    const adjustBtn = document.querySelector('#adjustmentModal .btn-primary');
    if (adjustBtn) adjustBtn.addEventListener("click", handleAdjustmentSubmit);

    document.getElementById("nav-prev")?.addEventListener("click", () => navigateTime(-1));
    document.getElementById("nav-next")?.addEventListener("click", () => navigateTime(1));
    document.querySelectorAll('input[name="viewUnit"]').forEach(r => r.addEventListener("change", (e) => { currentViewUnit = e.target.id.replace('unit-', ''); updateDateFiltersByUnit(0); }));
    document.getElementById("search-keyword")?.addEventListener("input", () => renderTransactionList(true));
}

// ... (以下 Helper, Navigate, CRUD 保持不變，直接使用) ...

function setupCategoryDependency(typeId, catId) {
    const typeEl = document.getElementById(typeId);
    if (typeEl) typeEl.addEventListener("change", (e) => {
        const exclude = typeId.includes('add') ? ["轉帳支出", "轉帳收入", "帳目調整", "投資支出", "投資收入"] : [];
        updateCategoryOptions(catId, e.target.value, null, exclude);
    });
}

function updateCategoryOptions(selectId, type, currentVal = null, exclude = []) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="" disabled selected>請選擇...</option>'; select.disabled = false;
    allCategories.filter(c => c.type === type).forEach(c => {
        if (!exclude.includes(c.name)) select.innerHTML += `<option value="${c.name}">${c.name}</option>`;
    });
    if (currentVal) select.value = currentVal;
}

function navigateTime(direction) { updateDateFiltersByUnit(direction); }
function updateDateFiltersByUnit(direction) {
    if (direction !== 0) {
        if (currentViewUnit === 'year') currentBaseDate.setFullYear(currentBaseDate.getFullYear() + direction);
        else if (currentViewUnit === 'month') currentBaseDate.setMonth(currentBaseDate.getMonth() + direction);
        else if (currentViewUnit === 'week') currentBaseDate.setDate(currentBaseDate.getDate() + (direction * 7));
        else if (currentViewUnit === 'day') currentBaseDate.setDate(currentBaseDate.getDate() + direction);
    }
    let startDate, endDate;
    const y = currentBaseDate.getFullYear(), m = currentBaseDate.getMonth(), d = currentBaseDate.getDate();
    const displayLabel = document.getElementById("current-view-display");
    const fmt = (date) => date.toISOString().split('T')[0];

    if (currentViewUnit === 'year') { startDate = new Date(y, 0, 1); endDate = new Date(y, 11, 31); if (displayLabel) displayLabel.textContent = `${y} 年`; }
    else if (currentViewUnit === 'month') { startDate = new Date(y, m, 1); endDate = new Date(y, m + 1, 0); if (displayLabel) displayLabel.textContent = `${y} 年 ${m + 1} 月`; }
    else if (currentViewUnit === 'week') { const dayOfWeek = currentBaseDate.getDay() || 7; startDate = new Date(currentBaseDate); startDate.setDate(d - dayOfWeek + 1); endDate = new Date(startDate); endDate.setDate(startDate.getDate() + 6); if (displayLabel) displayLabel.textContent = `${fmt(startDate)} ~ ${fmt(endDate)}`; }
    else { startDate = new Date(currentBaseDate); endDate = new Date(currentBaseDate); if (displayLabel) displayLabel.textContent = fmt(startDate); }

    document.getElementById("filter-start-date").value = fmt(startDate);
    document.getElementById("filter-end-date").value = fmt(endDate);
    renderTransactionList(true);
}

async function handleTransferSubmit(e) { e.preventDefault(); const f = document.getElementById("transfer-from-account").value; const t = document.getElementById("transfer-to-account").value; const a = document.getElementById("transfer-amount").value; if (f === t) return alert("轉出轉入不可相同"); showLoader(); try { await addTransfer({ fromAccount: f, toAccount: t, amount: a, date: document.getElementById("transfer-date").value, notes: document.getElementById("transfer-notes").value }); transferModal.hide(); await renderTransactionList(true); await refreshDashboard(); alert("轉帳成功"); } catch (err) { alert(err.message); } finally { hideLoader(); } }
async function handleAdjustmentSubmit() { const a = document.getElementById("adjust-account-name-hidden").value; const c = document.getElementById("adjust-calculated-balance").value; const act = document.getElementById("adjust-actual-balance").value; if (!act) return alert("請輸入金額"); showLoader(); try { await addAdjustment({ account: a, currentBalance: c, actualBalance: act }); alert("調整完成"); adjustmentModal.hide(); await renderTransactionList(true); await refreshDashboard(); } catch (e) { alert(e.message); } finally { hideLoader(); } }

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
                if (start && end) { if (tx.dateStr < start || tx.dateStr > end) return false; }
                if (keyword) {
                    const itemMatch = tx.item.toLowerCase().includes(keyword);
                    const notesMatch = tx.notes && tx.notes.toLowerCase().includes(keyword);
                    const tickerMatch = tx.stockTicker && tx.stockTicker.toLowerCase().includes(keyword);
                    if (!itemMatch && !notesMatch && !tickerMatch) return false;
                }
                return true;
            });
        }
        if (displayData.length === 0) listEl.innerHTML = '<div class="text-center text-muted py-4">無資料</div>';
        else {
            listEl.innerHTML = '';
            displayData.forEach(tx => {
                const isExpense = tx.type === "支出";
                const amountClass = isExpense ? "text-expense" : "text-income";
                const stockBadge = tx.stockTicker ? `<span class="badge bg-light text-dark border ms-1">${tx.stockTicker}</span>` : '';
                listEl.innerHTML += `<div class="list-group-item"><div class="d-flex justify-content-between align-items-center"><div style="min-width: 0;"><div class="fw-bold text-truncate">${tx.item} ${stockBadge}</div><div class="text-muted small">${tx.dateStr} | ${tx.category} | ${tx.account}</div></div><div class="text-end flex-shrink-0 ms-2"><div class="${amountClass} fw-bold mb-1 sensitive">${isExpense ? '-' : '+'} $${parseFloat(tx.amount).toLocaleString()}</div><div class="btn-group btn-group-sm"><button class="btn btn-outline-secondary py-0" onclick="window.handleOpenEdit('${tx.id}')"><i class="bi bi-pencil"></i></button><button class="btn btn-outline-danger py-0" onclick="window.handleDeleteTx('${tx.id}')"><i class="bi bi-trash"></i></button></div></div></div></div>`;
            });
        }
    } catch (e) { listEl.innerHTML = "載入失敗"; console.error(e); }
}

window.handleOpenEdit = function (id) {
    const tx = currentTransactions.find(t => t.id === id);
    if (!tx) return;
    document.getElementById("edit-id").value = tx.id;
    document.getElementById("edit-date").value = tx.dateStr;
    document.getElementById("edit-type").value = tx.type;
    document.getElementById("edit-item").value = tx.item;
    document.getElementById("edit-amount").value = tx.amount;
    document.getElementById("edit-account").value = tx.account;
    document.getElementById("edit-tags").value = tx.tags ? tx.tags.join(", ") : "";
    document.getElementById("edit-notes").value = tx.notes;

    if (tx.category === '投資' && tx.isStock) {
        document.getElementById("edit-stock-fields").classList.remove("d-none");
        document.getElementById("edit-stock-ticker").value = tx.stockTicker || "";
        document.getElementById("edit-stock-qty").value = tx.stockQty || "";
        document.getElementById("edit-stock-price").value = tx.stockPrice || "";
        document.getElementById("edit-stock-fee").value = tx.stockFee || "";
        const total = ((parseFloat(tx.stockQty) || 0) * (parseFloat(tx.stockPrice) || 0)) + (tx.type === '支出' ? (parseFloat(tx.stockFee) || 0) : -(parseFloat(tx.stockFee) || 0));
        document.getElementById("edit-stock-total-display").textContent = `試算: $${Math.round(total).toLocaleString()}`;
    } else {
        document.getElementById("edit-stock-fields").classList.add("d-none");
    }
    updateCategoryOptions("edit-category", tx.type, tx.category, []);
    editModal.show();
};

window.handleDeleteTx = async function (id) { if (!confirm("確定刪除?")) return; showLoader(); try { await deleteTransaction(id); await renderTransactionList(true); await refreshDashboard(); } catch (e) { alert(e.message); } finally { hideLoader(); } };
window.clearFilters = function () { updateDateFiltersByUnit(0); }
window.showTransferModal = function () { document.getElementById("addTransferForm").reset(); document.getElementById("transfer-date").valueAsDate = new Date(); transferModal.show(); }
window.showAdjustmentModal = function (n, b) { document.getElementById("adjust-account-name").textContent = n; document.getElementById("adjust-account-name-hidden").value = n; document.getElementById("adjust-calculated-balance").value = b; document.getElementById("adjust-actual-balance").value = ""; adjustmentModal.show(); }