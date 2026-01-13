// js/budgetController.js
import { addBudget, deleteBudget, getBudgets, calculateBudgetStatus } from "./services/budgetService.js";
import { getCategories } from "./services/category.js";
import { showLoader, hideLoader } from "./utils/ui.js";

export async function initBudgetModule() {
    // 綁定設定頁面的表單
    const form = document.getElementById("addBudgetForm");
    if (form) form.addEventListener("submit", handleAddBudget);

    // 綁定資料變動監聽 (交易變動時更新預算條)
    document.addEventListener("zenwallet:dataChanged", async () => {
        await renderBudgetWidgets();
        await renderBudgetSettingsList();
    });

    // 初始渲染
    await renderBudgetSettingsList();
    await renderBudgetWidgets();
    await loadCategoryOptions();
}

// 載入類別到預算 Modal 的下拉選單
async function loadCategoryOptions() {
    const select = document.getElementById("budget-category");
    if (!select) return;
    
    const categories = await getCategories();
    // 支出類別才需要預算
    const expenseCats = categories.filter(c => c.type === '支出');
    
    select.innerHTML = '<option value="ALL">💰 總支出 (所有類別)</option>';
    expenseCats.forEach(c => {
        select.innerHTML += `<option value="${c.name}">${c.name}</option>`;
    });
}

// 處理新增預算
async function handleAddBudget(e) {
    e.preventDefault();
    const name = document.getElementById("budget-name").value;
    const amount = document.getElementById("budget-amount").value;
    const category = document.getElementById("budget-category").value;

    if (!name || !amount) return;

    showLoader();
    try {
        await addBudget({ name, amount, targetCategory: category });
        document.getElementById("addBudgetForm").reset();
        // 關閉 Modal (如果是在 Modal 裡)
        const modalEl = document.getElementById('budgetModal');
        if (modalEl) {
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        }
        
        await renderBudgetSettingsList();
        await renderBudgetWidgets();
        alert("預算新增成功");
    } catch (err) {
        alert(err.message);
    } finally {
        hideLoader();
    }
}

// 渲染設定頁面的列表
async function renderBudgetSettingsList() {
    const list = document.getElementById("settings-budget-list");
    if (!list) return;

    const budgets = await getBudgets();
    list.innerHTML = "";

    if (budgets.length === 0) {
        list.innerHTML = '<li class="list-group-item text-muted text-center small">尚未設定預算</li>';
        return;
    }

    budgets.forEach(b => {
        const catLabel = b.targetCategory === 'ALL' ? '總支出' : b.targetCategory;
        list.innerHTML += `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                <div>
                    <div class="fw-bold">${b.name}</div>
                    <small class="text-muted">${catLabel} | $${parseFloat(b.amount).toLocaleString()}</small>
                </div>
                <button class="btn btn-outline-danger btn-sm" onclick="window.handleDeleteBudget('${b.id}')">
                    <i class="bi bi-trash"></i>
                </button>
            </li>
        `;
    });
}

// 渲染儀表板上的 Widget
async function renderBudgetWidgets() {
    const container = document.getElementById("budget-widget-content");
    if (!container) return;

    const statusList = await calculateBudgetStatus();
    container.innerHTML = "";

    if (statusList.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4 text-muted">
                <i class="bi bi-piggy-bank display-4 mb-2 d-block"></i>
                尚未設定預算<br>
                <button class="btn btn-sm btn-outline-primary mt-2" onclick="window.openBudgetModal()">立即設定</button>
            </div>`;
        return;
    }

    statusList.forEach(b => {
        container.innerHTML += `
            <div class="mb-3">
                <div class="d-flex justify-content-between align-items-end mb-1">
                    <span class="fw-bold text-dark">${b.name}</span>
                    <small class="${b.rawPercent >= 100 ? 'text-danger fw-bold' : 'text-muted'}">
                        $${Math.round(b.spent).toLocaleString()} / $${Math.round(b.limit).toLocaleString()}
                    </small>
                </div>
                <div class="progress" style="height: 10px;">
                    <div class="progress-bar bg-${b.status}" role="progressbar" 
                         style="width: ${b.percent}%"></div>
                </div>
                <div class="d-flex justify-content-end">
                    <small class="text-muted" style="font-size: 0.75rem">剩餘 $${Math.round(b.remaining).toLocaleString()}</small>
                </div>
            </div>
        `;
    });
}

// 全域函式
window.handleDeleteBudget = async function(id) {
    if (!confirm("確定刪除此預算設定？")) return;
    await deleteBudget(id);
    await renderBudgetSettingsList();
    await renderBudgetWidgets();
};

window.openBudgetModal = function() {
    const el = document.getElementById('budgetModal');
    if (el) {
        const modal = new bootstrap.Modal(el);
        modal.show();
    }
};