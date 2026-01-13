// js/portfolioController.js
import { getHoldings, updateHolding, deleteHolding, fetchYahooPrice } from "./services/portfolio.js";
import { getTransactions } from "./services/transaction.js";
import { getRealizedGains, recalculateAllHoldings } from "./services/stockService.js"; // 🔥 引入 getRealizedGains
import { showLoader, hideLoader } from "./utils/ui.js";

let currentHoldings = [];
let stockDetailModal = null;
let realizedProfitModal = null; // 🔥 新增

export async function initPortfolioModule() {
    // ... (原有的初始化代碼) ...
    const detailEl = document.getElementById("stockDetailModal");
    if(detailEl) stockDetailModal = new bootstrap.Modal(detailEl);

    // 🔥 初始化已實現損益 Modal
    const realizedEl = document.getElementById("realizedProfitModal");
    if(realizedEl) realizedProfitModal = new bootstrap.Modal(realizedEl);

    // 綁定按鈕
    const btnRealized = document.getElementById("btn-view-realized");
    if(btnRealized) btnRealized.addEventListener("click", showRealizedProfitReport);

    // ... (其他的按鈕綁定) ...
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

    // 監聽資料變動
    document.addEventListener("zenwallet:dataChanged", async () => {
        await renderPortfolio(true);
    });

    await renderPortfolio(true);
}

// 🔥 新增：顯示已實現損益報表
async function showRealizedProfitReport() {
    if (!realizedProfitModal) return;
    
    showLoader();
    try {
        const data = await getRealizedGains();
        
        // 更新統計文字
        document.getElementById("rp-total-profit").textContent = `$${Math.round(data.totalProfit).toLocaleString()}`;
        document.getElementById("rp-total-loss").textContent = `$${Math.round(data.totalLoss).toLocaleString()}`;
        
        const netEl = document.getElementById("rp-net-profit");
        netEl.textContent = `$${Math.round(data.netProfit).toLocaleString()}`;
        netEl.className = data.netProfit >= 0 ? "fw-bold fs-5 text-danger" : "fw-bold fs-5 text-success";

        // 更新列表
        const tbody = document.getElementById("realized-profit-list");
        tbody.innerHTML = "";

        if (data.history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-muted py-4">尚無賣出紀錄</td></tr>';
        } else {
            data.history.forEach(item => {
                const profitClass = item.profit >= 0 ? "text-danger" : "text-success";
                const sign = item.profit >= 0 ? "+" : "";
                
                tbody.innerHTML += `
                    <tr>
                        <td>${item.date}</td>
                        <td class="fw-bold">${item.ticker}</td>
                        <td>${item.qty}</td>
                        <td>
                            <div><small class="text-muted">賣:</small> ${item.sellPrice}</div>
                            <div><small class="text-muted">均:</small> ${item.avgCost.toFixed(2)}</div>
                        </td>
                        <td class="${profitClass} fw-bold">
                            ${sign}$${Math.round(item.profit).toLocaleString()}
                        </td>
                        <td class="${profitClass} small">
                            ${sign}${item.roi.toFixed(2)}%
                        </td>
                    </tr>
                `;
            });
        }

        hideLoader();
        realizedProfitModal.show();

    } catch (e) {
        console.error(e);
        alert("計算失敗");
        hideLoader();
    }
}

// ... (以下 renderPortfolio, handleShowStockDetail 等函式保持不變) ...
// (請務必保留原有的 renderPortfolio 等函式，這裡省略以節省篇幅)
async function renderPortfolio(forceRecalculate = false) {
    const listEl = document.getElementById("portfolioList");
    const totalValueEl = document.getElementById("portfolio-total-value");
    const totalProfitEl = document.getElementById("portfolio-total-profit");
    listEl.innerHTML = '<tr><td colspan="6" class="text-center text-muted">載入中...</td></tr>';
    try {
        if (forceRecalculate) await recalculateAllHoldings();
        currentHoldings = await getHoldings();
        const activeHoldings = currentHoldings.filter(h => h.quantity > 0);
        if (activeHoldings.length === 0) {
            listEl.innerHTML = '<tr><td colspan="6" class="text-center text-muted">目前無持股</td></tr>';
            totalValueEl.textContent = "$ 0";
            if(totalProfitEl) totalProfitEl.textContent = "$ 0";
            return;
        }
        let portfolioMarketValue = 0;
        let portfolioCost = 0;
        listEl.innerHTML = "";
        activeHoldings.forEach(h => {
            const marketVal = h.quantity * h.currentPrice;
            const costVal = h.quantity * h.averageCost;
            portfolioMarketValue += marketVal;
            portfolioCost += costVal;
            const profit = marketVal - costVal;
            const profitPercent = costVal > 0 ? (profit / costVal) * 100 : 0;
            const profitClass = profit >= 0 ? "text-danger" : "text-success";
            const sign = profit >= 0 ? "+" : "";
            listEl.innerHTML += `
                <tr>
                    <td><div class="fw-bold">${h.ticker}</div><small class="text-muted">均價: $${h.averageCost.toFixed(2)}</small></td>
                    <td class="text-end sensitive">${h.quantity}</td>
                    <td class="text-end sensitive">$${h.currentPrice}</td>
                    <td class="text-end sensitive fw-bold">$${Math.round(marketVal).toLocaleString()}</td>
                    <td class="text-end sensitive ${profitClass}"><div>${sign}$${Math.round(profit).toLocaleString()}</div><small>${sign}${profitPercent.toFixed(2)}%</small></td>
                    <td class="text-center"><div class="btn-group btn-group-sm"><button class="btn btn-outline-secondary py-0" onclick="window.handleShowStockDetail('${h.ticker}')"><i class="bi bi-list-ul"></i></button><button class="btn btn-outline-danger py-0" onclick="window.handleDeleteHolding('${h.id}')"><i class="bi bi-trash"></i></button></div></td>
                </tr>`;
        });
        const totalProfit = portfolioMarketValue - portfolioCost;
        const totalSign = totalProfit >= 0 ? "+" : "";
        const totalClass = totalProfit >= 0 ? "text-danger" : "text-success";
        totalValueEl.textContent = `$ ${Math.round(portfolioMarketValue).toLocaleString()}`;
        if(totalProfitEl) totalProfitEl.innerHTML = `<span class="${totalClass}">${totalSign}$${Math.round(totalProfit).toLocaleString()}</span>`;
    } catch (e) { console.error(e); listEl.innerHTML = '<tr><td colspan="6" class="text-danger">載入失敗</td></tr>'; }
}

window.handleShowStockDetail = async function(ticker) {
    if (!stockDetailModal) return;
    document.getElementById("stock-detail-title").textContent = `${ticker} 交易明細`;
    const tbody = document.getElementById("stock-detail-list");
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">載入中...</td></tr>';
    stockDetailModal.show();
    const allTx = await getTransactions();
    const stockTx = allTx.filter(t => t.stockTicker === ticker).sort((a, b) => b.dateStr.localeCompare(a.dateStr));
    tbody.innerHTML = "";
    if (stockTx.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">無交易紀錄</td></tr>'; return; }
    stockTx.forEach(tx => {
        const color = tx.type === '支出' ? 'text-danger' : 'text-success';
        const typeLabel = tx.type === '支出' ? '買入' : '賣出';
        tbody.innerHTML += `<tr><td>${tx.dateStr}</td><td><span class="badge ${tx.type==='支出'?'bg-danger':'bg-success'}">${typeLabel}</span></td><td>$${parseFloat(tx.stockPrice).toLocaleString()}</td><td>${tx.stockQty}</td><td class="text-muted small">$${tx.stockFee||0}</td><td class="fw-bold ${color}">$${parseFloat(tx.amount).toLocaleString()}</td></tr>`;
    });
};

async function handleSavePortfolio(e) { e.preventDefault(); const ticker = document.getElementById("pf-ticker").value.trim().toUpperCase(); const qty = parseFloat(document.getElementById("pf-qty").value); const price = parseFloat(document.getElementById("pf-price").value); if (!ticker || isNaN(qty) || isNaN(price)) return; showLoader(); try { const exist = currentHoldings.find(h => h.ticker === ticker); const data = { ticker, quantity: qty, currentPrice: price, averageCost: exist ? exist.averageCost : price }; if (exist) await updateHolding(exist.id, data); else await updateHolding(null, data); document.getElementById("portfolioForm").reset(); await renderPortfolio(true); } catch (err) { alert(err.message); } finally { hideLoader(); } }
async function updateAllPrices() { showLoader(); try { const tasks = currentHoldings.map(async (h) => { const price = await fetchYahooPrice(h.ticker); if (price) await updateHolding(h.id, { ...h, currentPrice: price }); }); await Promise.all(tasks); await renderPortfolio(false); alert("股價更新完成"); } catch (e) { console.error(e); alert("更新部分失敗"); } finally { hideLoader(); } }
window.handleDeleteHolding = async function(id) { if(!confirm("確定刪除此持股紀錄？")) return; showLoader(); await deleteHolding(id); await renderPortfolio(false); hideLoader(); };