// js/portfolioController.js
import { getHoldings, updateHolding, deleteHolding, fetchYahooPrice } from "./services/portfolio.js";
import { getTransactions } from "./services/transaction.js"; // 引入交易紀錄以顯示明細
import { showLoader, hideLoader } from "./utils/ui.js";

let currentHoldings = [];
let stockDetailModal = null; // 明細 Modal 實例

export async function initPortfolioModule() {
    // 初始化個股明細 Modal
    const modalEl = document.getElementById("stockDetailModal");
    if(modalEl) stockDetailModal = new bootstrap.Modal(modalEl);

    // 綁定手動新增表單 (如果有的話)
    const form = document.getElementById("portfolioForm");
    if (form) form.addEventListener("submit", handleSavePortfolio);

    // 綁定更新股價按鈕
    const refreshBtn = document.getElementById("btn-refresh-prices");
    if (refreshBtn) refreshBtn.addEventListener("click", updateAllPrices);

    // 綁定單一抓取按鈕 (手動表單用)
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

    await renderPortfolio();
}

async function renderPortfolio() {
    const listEl = document.getElementById("portfolioList");
    const totalValueEl = document.getElementById("portfolio-total-value");
    // 嘗試取得顯示「總損益」的元素 (如果 HTML 有預留位置)
    const totalProfitEl = document.getElementById("portfolio-total-profit");
    
    listEl.innerHTML = '<tr><td colspan="6" class="text-center text-muted">載入中...</td></tr>';
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
        const avgCost = h.averageCost || 0;
        const costVal = h.quantity * avgCost;
        
        portfolioMarketValue += marketVal;
        portfolioCost += costVal;

        const profit = marketVal - costVal;
        const profitPercent = costVal > 0 ? (profit / costVal) * 100 : 0;
        
        const profitClass = profit >= 0 ? "text-danger" : "text-success"; // 台股紅漲綠跌
        const sign = profit >= 0 ? "+" : "";

        // 渲染列表：包含詳細按鈕 (bi-list-ul)
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

    // 更新總計
    const totalProfit = portfolioMarketValue - portfolioCost;
    const totalSign = totalProfit >= 0 ? "+" : "";
    const totalClass = totalProfit >= 0 ? "text-danger" : "text-success";

    totalValueEl.textContent = `$ ${Math.round(portfolioMarketValue).toLocaleString()}`;
    
    if(totalProfitEl) {
        totalProfitEl.innerHTML = `<span class="${totalClass}">${totalSign}$${Math.round(totalProfit).toLocaleString()}</span>`;
    }
}

// 顯示個股詳細交易視窗
window.handleShowStockDetail = async function(ticker) {
    if (!stockDetailModal) return;
    
    document.getElementById("stock-detail-title").textContent = `${ticker} 交易明細`;
    const tbody = document.getElementById("stock-detail-list");
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">載入中...</td></tr>';
    stockDetailModal.show();

    // 取得所有交易並篩選該股票
    const allTx = await getTransactions();
    const stockTx = allTx.filter(t => t.stockTicker === ticker).sort((a, b) => b.dateStr.localeCompare(a.dateStr));

    tbody.innerHTML = "";
    if (stockTx.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">無交易紀錄 (此持股可能為手動建立)</td></tr>';
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

// 手動儲存持股 (來自左側表單)
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
            // 若是新股，設成本=現價；若舊股，保留原成本
            averageCost: exist ? exist.averageCost : price 
        };
        
        if (exist) await updateHolding(exist.id, data);
        else await updateHolding(null, data);

        document.getElementById("portfolioForm").reset();
        await renderPortfolio();
    } catch (err) { alert(err.message); } finally { hideLoader(); }
}

// 批次更新股價
async function updateAllPrices() {
    showLoader();
    try {
        const tasks = currentHoldings.map(async (h) => {
            const price = await fetchYahooPrice(h.ticker);
            if (price) await updateHolding(h.id, { ...h, currentPrice: price });
        });
        await Promise.all(tasks);
        await renderPortfolio();
        alert("股價更新完成");
    } catch (e) { console.error(e); alert("更新部分失敗"); } finally { hideLoader(); }
}

// 刪除持股
window.handleDeleteHolding = async function(id) {
    if(!confirm("確定刪除此持股紀錄？")) return;
    showLoader();
    await deleteHolding(id);
    await renderPortfolio();
    hideLoader();
};