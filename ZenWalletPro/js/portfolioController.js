// js/portfolioController.js
import { getHoldings, updateHolding, deleteHolding, fetchYahooPrice } from "./services/portfolio.js";
import { showLoader, hideLoader } from "./utils/ui.js";

let currentHoldings = [];

export async function initPortfolioModule() {
    const form = document.getElementById("portfolioForm");
    if (form) {
        form.addEventListener("submit", handleSavePortfolio);
    }

    const refreshBtn = document.getElementById("btn-refresh-prices");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", updateAllPrices);
    }

    const fetchSingleBtn = document.getElementById("btn-fetch-single");
    if (fetchSingleBtn) {
        fetchSingleBtn.addEventListener("click", async () => {
            const ticker = document.getElementById("pf-ticker").value.trim();
            if (!ticker) return alert("請輸入代號");
            
            showLoader();
            const price = await fetchYahooPrice(ticker);
            hideLoader();
            
            if (price) {
                document.getElementById("pf-price").value = price;
            } else {
                alert("抓取失敗，請確認代號 (台股請加 .TW)");
            }
        });
    }

    await renderPortfolio();
}

async function renderPortfolio() {
    const listEl = document.getElementById("portfolioList");
    const totalValueEl = document.getElementById("portfolio-total-value");
    
    listEl.innerHTML = '<tr><td colspan="6" class="text-center text-muted">載入中...</td></tr>';
    
    currentHoldings = await getHoldings();
    
    // 過濾掉股數為 0 的 (已賣光)
    const activeHoldings = currentHoldings.filter(h => h.quantity > 0);

    if (activeHoldings.length === 0) {
        listEl.innerHTML = '<tr><td colspan="6" class="text-center text-muted">目前無持股</td></tr>';
        totalValueEl.textContent = "$ 0";
        return;
    }

    let totalValue = 0;
    listEl.innerHTML = "";

    activeHoldings.forEach(h => {
        const marketVal = h.quantity * h.currentPrice;
        totalValue += marketVal;
        
        // 計算損益
        const avgCost = h.averageCost || 0; // 若無成本資料則為 0
        const costVal = h.quantity * avgCost;
        const profit = marketVal - costVal;
        const profitPercent = costVal > 0 ? (profit / costVal) * 100 : 0;
        
        // 顏色樣式
        const profitClass = profit >= 0 ? "text-danger" : "text-success"; // 台股紅漲綠跌
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
                    <button class="btn btn-outline-danger btn-sm py-0" onclick="window.handleDeleteHolding('${h.id}')"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `;
    });

    totalValueEl.textContent = `$ ${Math.round(totalValue).toLocaleString()}`;
}

async function handleSavePortfolio(e) {
    e.preventDefault();
    const ticker = document.getElementById("pf-ticker").value.trim().toUpperCase();
    const qty = parseFloat(document.getElementById("pf-qty").value);
    const price = parseFloat(document.getElementById("pf-price").value);

    if (!ticker || isNaN(qty) || isNaN(price)) return;

    showLoader();
    try {
        // 這裡的手動新增通常用於初始化，我們簡單處理：若已存在則更新數量與現價，不改變平均成本(除非你要手動調整)
        // 或者，我們可以視為「買入」，呼叫 stockService。
        // 但為了彈性，這裡維持原有的 updateHolding (直接覆蓋/新增)，適合修正資料。
        // 如果要嚴謹，應該引導使用者去「新增交易」。
        
        // 檢查是否已存在
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
    } catch (err) {
        alert(err.message);
    } finally {
        hideLoader();
    }
}

async function updateAllPrices() {
    showLoader();
    try {
        const tasks = currentHoldings.map(async (h) => {
            const price = await fetchYahooPrice(h.ticker);
            if (price) {
                await updateHolding(h.id, { ...h, currentPrice: price });
            }
        });
        await Promise.all(tasks);
        await renderPortfolio();
        alert("股價更新完成");
    } catch (e) {
        console.error(e);
        alert("更新部分失敗");
    } finally {
        hideLoader();
    }
}

window.handleDeleteHolding = async function(id) {
    if(!confirm("確定刪除此持股紀錄？")) return;
    showLoader();
    await deleteHolding(id);
    await renderPortfolio();
    hideLoader();
};