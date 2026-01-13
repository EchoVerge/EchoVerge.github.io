// js/services/stockService.js
import { LocalDB } from "./storage/localDB.js";
import { uuidv4 } from "../utils/helpers.js";

const STORE_PORTFOLIO = 'portfolio';
const STORE_TRANSACTIONS = 'transactions';

export async function updatePortfolioByTransaction(txData) {
    await recalculateAllHoldings();
}

export async function recalculateAllHoldings() {
    // ... (保留您原本的 recalculateAllHoldings 代碼，完全不變) ...
    // 請將您現有的 recalculateAllHoldings 完整保留在這裡
    // 下面是為了節省篇幅，請確保您的檔案中有這段邏輯
    const [transactions, currentHoldings] = await Promise.all([
        LocalDB.getAll(STORE_TRANSACTIONS),
        LocalDB.getAll(STORE_PORTFOLIO)
    ]);
    const priceCache = {};
    currentHoldings.forEach(h => { if(h.ticker) priceCache[h.ticker] = h.currentPrice; });
    const holdingsMap = {};
    transactions.sort((a, b) => a.date.localeCompare(b.date));

    transactions.forEach(tx => {
        if (!tx.stockTicker || !tx.stockQty) return;
        const ticker = tx.stockTicker.toUpperCase();
        const qty = parseFloat(tx.stockQty) || 0;
        const price = parseFloat(tx.stockPrice) || 0;
        const fee = parseFloat(tx.stockFee) || 0;

        if (!holdingsMap[ticker]) holdingsMap[ticker] = { qty: 0, totalCost: 0, avgCost: 0 };
        let h = holdingsMap[ticker];

        if (tx.type === '支出') {
            const cost = (qty * price) + fee;
            h.totalCost += cost;
            h.qty += qty;
            if (h.qty > 0) h.avgCost = h.totalCost / h.qty;
        } else if (tx.type === '收入') {
            if (h.qty > 0) {
                const sellRatio = qty / h.qty;
                h.totalCost -= (h.totalCost * sellRatio);
            }
            h.qty -= qty;
        }
    });

    const newTickers = Object.keys(holdingsMap);
    for (const oldH of currentHoldings) {
        if (!holdingsMap[oldH.ticker] || holdingsMap[oldH.ticker].qty <= 0) {
            await LocalDB.delete(STORE_PORTFOLIO, oldH.id);
        }
    }
    for (const ticker of newTickers) {
        const data = holdingsMap[ticker];
        if (data.qty <= 0) continue;
        const existing = currentHoldings.find(h => h.ticker === ticker);
        const newItem = {
            id: existing ? existing.id : uuidv4(),
            ticker: ticker,
            quantity: parseFloat(data.qty.toFixed(4)),
            averageCost: data.avgCost,
            currentPrice: priceCache[ticker] || data.avgCost || 0,
            updatedAt: new Date().toISOString()
        };
        if (existing) await LocalDB.update(STORE_PORTFOLIO, newItem.id, newItem);
        else await LocalDB.add(STORE_PORTFOLIO, newItem);
    }
}

/**
 * 🔥 新增：計算已實現損益 (Realized P&L)
 * 回傳：{ history: [], totalProfit: 0, totalLoss: 0, netProfit: 0 }
 */
export async function getRealizedGains() {
    const transactions = await LocalDB.getAll(STORE_TRANSACTIONS);
    transactions.sort((a, b) => a.date.localeCompare(b.date)); // 依日期排序

    const history = [];
    // 模擬庫存狀態 (Ticker -> { qty, avgCost })
    const holdingsSim = {}; 

    transactions.forEach(tx => {
        if (!tx.stockTicker || !tx.stockQty) return;

        const ticker = tx.stockTicker.toUpperCase();
        const qty = parseFloat(tx.stockQty) || 0;
        const price = parseFloat(tx.stockPrice) || 0;
        const fee = parseFloat(tx.stockFee) || 0;

        if (!holdingsSim[ticker]) holdingsSim[ticker] = { qty: 0, avgCost: 0, totalCost: 0 };
        let h = holdingsSim[ticker];

        if (tx.type === '支出') {
            // 買入：更新成本
            const cost = (qty * price) + fee;
            h.totalCost += cost;
            h.qty += qty;
            if (h.qty > 0) h.avgCost = h.totalCost / h.qty;

        } else if (tx.type === '收入') {
            // 賣出：計算損益
            // 賣出總收入 (已扣除手續費的入帳金額) = (股數 * 單價) - 手續費
            // 交易紀錄中的 amount 通常已經是 (股數*單價)-手續費，但為了精確我們用 stock 欄位重算
            // 這裡假設: 交易的 amount = 實際入帳金額 (Net)
            
            const sellRevenue = (qty * price) - fee; 
            const costOfGoodsSold = qty * h.avgCost; // 售出成本
            
            const realizedPL = sellRevenue - costOfGoodsSold;
            const roi = costOfGoodsSold > 0 ? (realizedPL / costOfGoodsSold) * 100 : 0;

            history.push({
                date: tx.date,
                ticker: ticker,
                qty: qty,
                sellPrice: price,
                avgCost: h.avgCost,
                profit: realizedPL,
                roi: roi,
                txId: tx.id
            });

            // 扣除庫存
            if (h.qty > 0) {
                const sellRatio = qty / h.qty;
                h.totalCost -= (h.totalCost * sellRatio);
            }
            h.qty -= qty;
        }
    });

    // 統計總和
    const totalProfit = history.filter(h => h.profit > 0).reduce((sum, h) => sum + h.profit, 0);
    const totalLoss = history.filter(h => h.profit < 0).reduce((sum, h) => sum + h.profit, 0);

    return {
        history: history.reverse(), // 新的在前
        totalProfit,
        totalLoss,
        netProfit: totalProfit + totalLoss
    };
}