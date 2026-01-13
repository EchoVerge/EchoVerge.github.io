// js/services/stockService.js
import { LocalDB } from "./storage/localDB.js";
import { uuidv4 } from "../utils/helpers.js";

const STORE = 'portfolio';

/**
 * 根據交易更新投資組合
 * @param {Object} txData 交易資料
 */
export async function updatePortfolioByTransaction(txData) {
    // 如果不是股票交易，直接忽略
    if (!txData.isStock || !txData.stockTicker) return;

    const ticker = txData.stockTicker.toUpperCase();
    const tradeQty = parseFloat(txData.stockQty);
    const tradePrice = parseFloat(txData.stockPrice);
    const fee = parseFloat(txData.stockFee) || 0;
    
    // 取得現有持股
    const allHoldings = await LocalDB.getAll(STORE);
    let holding = allHoldings.find(h => h.ticker === ticker);
    let isNew = false; // 🔥 關鍵修正：標記是否為新持股

    if (!holding) {
        // 如果是賣出且沒庫存，拋出錯誤
        if (txData.type === '收入') {
            throw new Error(`錯誤：尚未持有 ${ticker}，無法賣出。`);
        }
        isNew = true; // 標記為新
        // 初始化新持股
        holding = {
            id: uuidv4(),
            ticker: ticker,
            quantity: 0,
            averageCost: 0,
            currentPrice: tradePrice
        };
    }

    if (txData.type === '支出') {
        // 買入邏輯 (Buy)
        const oldCost = holding.quantity * holding.averageCost;
        const newTradeCost = (tradeQty * tradePrice) + fee;
        const newTotalQty = holding.quantity + tradeQty;

        if (newTotalQty > 0) {
            holding.averageCost = (oldCost + newTradeCost) / newTotalQty;
        }
        holding.quantity = newTotalQty;
        holding.currentPrice = tradePrice; 

    } else if (txData.type === '收入') {
        // 賣出邏輯 (Sell)
        if (holding.quantity < tradeQty) {
            throw new Error(`庫存不足！持有: ${holding.quantity}, 欲賣出: ${tradeQty}`);
        }
        holding.quantity -= tradeQty;
    }

    holding.updatedAt = new Date().toISOString();

    // 🔥 根據 isNew 決定操作，避免對不存在的 ID 呼叫 update
    if (isNew) {
        await LocalDB.add(STORE, holding);
    } else {
        await LocalDB.update(STORE, holding.id, holding);
    }
}