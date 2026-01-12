// js/portfolioController.js
import { getHoldings, saveHolding, deleteHolding, fetchYahooPrice, updateAllHoldingsPrices } from "./services/portfolio.js"; // ✅ 修正：已補上引入
import { showLoader, hideLoader } from "./utils/ui.js";
import { refreshDashboard } from "./dashboardController.js";

export async function initPortfolioModule() {
    setupEventListeners();
    await renderPortfolio();
}

function setupEventListeners() {
    // 綁定表單提交
    const form = document.getElementById("portfolioForm");
    if (form) form.addEventListener("submit", handleSaveHolding);
    
    // 綁定抓取單一價格按鈕
    const btnSingle = document.getElementById("btn-fetch-single");
    if (btnSingle) btnSingle.addEventListener("click", handleFetchSinglePrice);
    
    // 綁定更新所有價格按鈕
    const btnRefresh = document.getElementById("btn-refresh-prices");
    if (btnRefresh) btnRefresh.addEventListener("click", handleRefreshAllPrices);
}

// 新增持股時，自動抓取單一價格
async function handleFetchSinglePrice() {
    const tickerInput = document.getElementById("pf-ticker");
    const priceInput = document.getElementById("pf-price");
    
    if (!tickerInput || !priceInput) return;

    const ticker = tickerInput.value.trim().toUpperCase();

    if (!ticker) {
        alert("請先輸入代號 (例如: 2330.TW 或 VOO)");
        return;
    }

    // 顯示按鈕 loading 狀態
    const btn = document.getElementById("btn-fetch-single");
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    btn.disabled = true;

    try {
        const price = await fetchYahooPrice(ticker); // 呼叫 service
        if (price !== null) {
            priceInput.value = price;
        } else {
            alert("查無此代號，請確認 Yahoo Finance 上是否有此代號。\n(台股請加 .TW，如 2330.TW)");
        }
    } catch (e) {
        console.error(e);
        alert("查詢失敗，請稍後再試");
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}

// 更新所有持股價格
async function handleRefreshAllPrices() {
    if (!confirm("確定要從 Yahoo Finance 更新所有持股價格嗎？")) return;
    
    showLoader();
    try {
        const result = await updateAllHoldingsPrices(); // 呼叫 service
        alert(result.message);
        await renderPortfolio(); // 重新渲染列表
        await refreshDashboard(); // 更新總資產
    } catch (e) {
        alert("更新失敗: " + e.message);
    } finally {
        hideLoader();
    }
}

async function handleSaveHolding(e) {
    e.preventDefault();
    showLoader();

    const ticker = document.getElementById("pf-ticker").value.trim();
    const qty = document.getElementById("pf-qty").value;
    const price = document.getElementById("pf-price").value;

    try {
        await saveHolding(ticker, qty, price);
        document.getElementById("portfolioForm").reset();
        await renderPortfolio();
        await refreshDashboard();
    } catch (error) {
        alert("儲存失敗: " + error.message);
    } finally {
        hideLoader();
    }
}

async function renderPortfolio() {
    const tbody = document.getElementById("portfolioList");
    const totalEl = document.getElementById("portfolio-total-value");
    
    if (!tbody || !totalEl) return;

    try {
        const holdings = await getHoldings();
        let totalValue = 0;

        if (holdings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">尚無持股資料</td></tr>';
            totalEl.textContent = "$ 0.00";
            return;
        }

        tbody.innerHTML = "";
        
        holdings.forEach(h => {
            const value = h.quantity * h.currentPrice;
            totalValue += value;
            
            // 格式化最後更新時間
            let dateStr = '';
            if (h.updatedAt) {
                // 處理 Firestore Timestamp 或一般 Date
                const dateObj = h.updatedAt.toDate ? h.updatedAt.toDate() : new Date(h.updatedAt);
                dateStr = dateObj.toLocaleDateString();
            }

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>
                    <span class="fw-bold">${h.ticker}</span>
                    <br><small class="text-muted" style="font-size: 0.75rem;">${dateStr} 更新</small>
                </td>
                <td class="text-end">${parseFloat(h.quantity).toLocaleString()}</td>
                <td class="text-end text-muted">$${parseFloat(h.currentPrice).toLocaleString()}</td>
                <td class="text-end fw-bold text-success">$${value.toLocaleString()}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="window.handleEditHolding('${h.ticker}', ${h.quantity}, ${h.currentPrice})">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.handleDeleteHolding('${h.id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        totalEl.textContent = `$ ${totalValue.toLocaleString()}`;

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">載入失敗: ${e.message}</td></tr>`;
    }
}

// --- 全域函式 ---
window.handleEditHolding = function(ticker, qty, price) {
    document.getElementById("pf-ticker").value = ticker;
    document.getElementById("pf-qty").value = qty;
    document.getElementById("pf-price").value = price;
    document.getElementById("pf-ticker").focus();
};

window.handleDeleteHolding = async function(id) {
    if (!confirm("確定要刪除此持股嗎？")) return;
    showLoader();
    try {
        await deleteHolding(id);
        await renderPortfolio();
        await refreshDashboard();
    } catch (e) {
        alert("刪除失敗: " + e.message);
    } finally {
        hideLoader();
    }
};