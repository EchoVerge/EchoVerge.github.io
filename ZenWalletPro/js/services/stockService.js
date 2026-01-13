// js/services/stockService.js
import { LocalDB } from "./storage/localDB.js";
import { uuidv4 } from "../utils/helpers.js";

const STORE_PORTFOLIO = 'portfolio';
const STORE_TRANSACTIONS = 'transactions';

/**
 * 根據單筆交易更新 (增量更新，用於新增時的快速反應)
 * 但為了資料一致性，建議主要依賴 recalculateAllHoldings
 */
export async function updatePortfolioByTransaction(txData) {
    // 為了確保絕對正確，直接觸發全量重算
    await recalculateAllHoldings();
}

/**
 * 🔥 核心功能：根據所有交易紀錄，重新計算投資組合
 * 解決匯入資料不連動、庫存不同步的問題
 */
export async function recalculateAllHoldings() {
    // 1. 取得所有資料
    const [transactions, currentHoldings] = await Promise.all([
        LocalDB.getAll(STORE_TRANSACTIONS),
        LocalDB.getAll(STORE_PORTFOLIO)
    ]);

    // 2. 建立現價快取 (保留目前已抓到的股價，以免重算後歸零)
    const priceCache = {};
    currentHoldings.forEach(h => {
        if(h.ticker) priceCache[h.ticker] = h.currentPrice;
    });

    // 3. 歸零計算 (Map: Ticker -> { qty, totalCost, avgCost })
    const holdingsMap = {};

    // 依照日期排序交易 (確保買賣順序正確)
    transactions.sort((a, b) => a.date.localeCompare(b.date));

    transactions.forEach(tx => {
        // 只處理股票相關交易 (支援舊版 isStock 欄位與新版透過 Tag/Category 判斷)
        // 寬鬆判斷：只要有 stockTicker 且有數量，就視為股票交易
        if (!tx.stockTicker || !tx.stockQty) return;

        const ticker = tx.stockTicker.toUpperCase();
        const qty = parseFloat(tx.stockQty) || 0;
        const price = parseFloat(tx.stockPrice) || 0;
        const fee = parseFloat(tx.stockFee) || 0;

        if (!holdingsMap[ticker]) {
            holdingsMap[ticker] = { qty: 0, totalCost: 0, avgCost: 0 };
        }
        
        let h = holdingsMap[ticker];

        if (tx.type === '支出') {
            // ===========================
            // 買入 (Buy)
            // ===========================
            // 成本 = (股數 * 單價) + 手續費
            const cost = (qty * price) + fee;
            
            // 新總成本 = 舊總成本 + 本次成本
            // 注意：這裡用累積總成本來算均價，比 (均價*股數) 更精準
            h.totalCost += cost;
            h.qty += qty;
            
            // 更新均價
            if (h.qty > 0) h.avgCost = h.totalCost / h.qty;

        } else if (tx.type === '收入') {
            // ===========================
            // 賣出 (Sell)
            // ===========================
            // 賣出時，從庫存扣除數量
            // 總成本也要依比例扣除 (實現損益)，以維持「剩餘庫存的單位成本」不變
            if (h.qty > 0) {
                const sellRatio = qty / h.qty;
                h.totalCost -= (h.totalCost * sellRatio); // 依比例減少總成本
            }
            h.qty -= qty;
        }
    });

    // 4. 寫回資料庫
    // 先清空舊 Portfolio (或採用差異更新，這裡為了簡單直接覆蓋)
    // 但為了保留 ID (如果有外部參照)，我們嘗試比對
    
    // 這裡採用策略：
    // A. 刪除資料庫中「不在」新計算結果裡的項目 (已清空或無交易)
    // B. 更新或新增項目

    const newTickers = Object.keys(holdingsMap);
    
    // 刪除多餘的
    for (const oldH of currentHoldings) {
        // 如果新名單沒有這支，或者新名單數量為 0 (已出清)，則刪除
        if (!holdingsMap[oldH.ticker] || holdingsMap[oldH.ticker].qty <= 0) {
            await LocalDB.delete(STORE_PORTFOLIO, oldH.id);
        }
    }

    // 更新或新增
    for (const ticker of newTickers) {
        const data = holdingsMap[ticker];
        if (data.qty <= 0) continue; // 忽略已出清的

        const existing = currentHoldings.find(h => h.ticker === ticker);
        const newItem = {
            id: existing ? existing.id : uuidv4(),
            ticker: ticker,
            quantity: parseFloat(data.qty.toFixed(4)), // 修正小數點
            averageCost: data.avgCost,
            currentPrice: priceCache[ticker] || data.avgCost || 0, // 優先用快取現價，否則用成本價
            updatedAt: new Date().toISOString()
        };

        if (existing) {
            await LocalDB.update(STORE_PORTFOLIO, newItem.id, newItem);
        } else {
            await LocalDB.add(STORE_PORTFOLIO, newItem);
        }
    }
}