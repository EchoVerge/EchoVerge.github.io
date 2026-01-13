// js/portfolioController.js
import { getHoldings, updateHolding, deleteHolding, fetchYahooPrice } from "./services/portfolio.js";
import { getTransactions } from "./services/transaction.js";
import { recalculateAllHoldings } from "./services/stockService.js"; // 🔥 引入重算服務
import { showLoader, hideLoader } from "./utils/ui.js";

let currentHoldings = [];
let stockDetailModal = null;

export async function initPortfolioModule() {
    const modalEl = document.getElementById("stockDetailModal");
    if(modalEl) stockDetailModal = new bootstrap.Modal(modalEl);

    const form = document.getElementById("portfolioForm");
    if (form) form.addEventListener("submit", handleSavePortfolio);

    const refreshBtn = document.getElementById("btn-refresh-prices");
    if (refreshBtn) refreshBtn.addEventListener("click", updateAllPrices);

    const fetchSingleBtn = document.getElementById("btn-fetch-single");
    if (fetchSingleBtn) {
        fetchSingleBtn.addEventListener("click", async () => {
            const ticker = document.getElementById("pf-ticker").value.trim();
            if (!ticker) return alert("請輸入代號");
            showLoader();
            const price = await fetchYahooPrice(ticker);
            hideLoader();
            if (price) document.getElementById("pf-price").value = price;
            else alert("抓取失敗");
        });
    }

    // 監聽資料變動 (例如從交易頁面切換過來時)，自動重整
    document.addEventListener("zenwallet:dataChanged", async () => {
        await renderPortfolio(true); // true = 強制重算
    });

    await renderPortfolio(true); // 初次載入強制重算
}

// 參數 forceRecalculate: 是否從交易紀錄重新計算
async function renderPortfolio(forceRecalculate = false) {
    const listEl = document.getElementById("portfolioList");
    const totalValueEl = document.getElementById("portfolio-total-value");
    
    listEl.innerHTML = '<tr><td colspan="6" class="text-center text-muted">載入中...</td></tr>';

    try {
        // 🔥 關鍵：如果需要，先執行全量重算
        if (forceRecalculate) {
            console.log("正在重新計算投資組合...");
            await recalculateAllHoldings();
        }

        currentHoldings = await getHoldings();
        
        const activeHoldings = currentHoldings.filter(h => h.quantity > 0);

        if (activeHoldings.length === 0) {
            listEl.innerHTML = '<tr><td colspan="6" class="text-center text-muted">目前無持股<br><small class="text-muted">(請至「儀表板」新增股票交易紀錄)</small></td></tr>';
            totalValueEl.textContent = "$ 0";
            return;
        }

        let totalValue = 0;
        listEl.innerHTML = "";

        activeHoldings.forEach(h => {
            const marketVal = h.quantity * h.currentPrice;
            totalValue += marketVal;
            
            const avgCost = h.averageCost || 0;
            const costVal = h.quantity * avgCost;
            const profit = marketVal - costVal;
            
            // 避免分母為 0
            const profitPercent = costVal > 0 ? (profit / costVal) * 100 : 0;
            
            const profitClass = profit >= 0 ? "text-danger" : "text-success";
            const sign = profit >= 0 ? "+" : "";

            listEl.innerHTML += `
                <tr>
                    <td>
                        <div class="fw-bold">${h.ticker}</div>
                        <small class="text-muted">均價: $${avgCost.toFixed(2)}</small>
                    </td>
                    <td class="text-end sensitive">${h.quantity}</td>
                    <td class="text-end sensitive">$${h.currentPrice}</td>
                    <td class="text-end sensitive fw-bold">$${Math.round(marketVal).toLocaleString()}</td>
                    <td class="text-end sensitive ${profitClass}">
                        <div>${sign}$${Math.round(profit).toLocaleString()}</div>
                        <small>${sign}${profitPercent.toFixed(2)}%</small>
                    </td>
                    <td class="text-center">
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-secondary py-0" title="交易明細" onclick="window.handleShowStockDetail('${h.ticker}')"><i class="bi bi-list-ul"></i></button>
                            <button class="btn btn-outline-danger py-0" title="刪除持股" onclick="window.handleDeleteHolding('${h.id}')"><i class="bi bi-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });

        totalValueEl.textContent = `$ ${Math.round(totalValue).toLocaleString()}`;

    } catch (e) {
        console.error("Render Portfolio Error:", e);
        listEl.innerHTML = '<tr><td colspan="6" class="text-center text-danger">載入失敗</td></tr>';
    }
}

// 顯示個股詳細交易
window.handleShowStockDetail = async function(ticker) {
    if (!stockDetailModal) return;
    
    document.getElementById("stock-detail-title").textContent = `${ticker} 交易明細`;
    const tbody = document.getElementById("stock-detail-list");
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">載入中...</td></tr>';
    stockDetailModal.show();

    const allTx = await getTransactions();
    const stockTx = allTx.filter(t => t.stockTicker === ticker).sort((a, b) => b.dateStr.localeCompare(a.dateStr));

    tbody.innerHTML = "";
    if (stockTx.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">無交易紀錄</td></tr>';
        return;
    }

    stockTx.forEach(tx => {
        const color = tx.type === '支出' ? 'text-danger' : 'text-success';
        const typeLabel = tx.type === '支出' ? '買入' : '賣出';
        
        tbody.innerHTML += `
            <tr>
                <td>${tx.dateStr}</td>
                <td><span class="badge ${tx.type==='支出'?'bg-danger':'bg-success'}">${typeLabel}</span></td>
                <td>$${parseFloat(tx.stockPrice).toLocaleString()}</td>
                <td>${tx.stockQty}</td>
                <td class="text-muted small">$${tx.stockFee || 0}</td>
                <td class="fw-bold ${color}">$${parseFloat(tx.amount).toLocaleString()}</td>
            </tr>
        `;
    });
};

async function handleSavePortfolio(e) {
    e.preventDefault();
    const ticker = document.getElementById("pf-ticker").value.trim().toUpperCase();
    const qty = parseFloat(document.getElementById("pf-qty").value);
    const price = parseFloat(document.getElementById("pf-price").value);

    if (!ticker || isNaN(qty) || isNaN(price)) return;

    showLoader();
    try {
        const exist = currentHoldings.find(h => h.ticker === ticker);
        const data = {
            ticker, 
            quantity: qty, 
            currentPrice: price,
            averageCost: exist ? exist.averageCost : price 
        };
        
        if (exist) await updateHolding(exist.id, data);
        else await updateHolding(null, data);

        document.getElementById("portfolioForm").reset();
        await renderPortfolio(true); // 手動修改後也重算一次
    } catch (err) { alert(err.message); } finally { hideLoader(); }
}

async function updateAllPrices() {
    showLoader();
    try {
        const tasks = currentHoldings.map(async (h) => {
            const price = await fetchYahooPrice(h.ticker);
            if (price) await updateHolding(h.id, { ...h, currentPrice: price });
        });
        await Promise.all(tasks);
        await renderPortfolio(false); // 更新股價不需要重算成本
        alert("股價更新完成");
    } catch (e) { console.error(e); alert("更新部分失敗"); } finally { hideLoader(); }
}

window.handleDeleteHolding = async function(id) {
    if(!confirm("確定刪除此持股紀錄？(注意：這不會刪除交易紀錄，重整後可能會再次出現)")) return;
    showLoader();
    await deleteHolding(id);
    await renderPortfolio(false); // 刪除時不強制重算，以免馬上又跑出來
    hideLoader();
};