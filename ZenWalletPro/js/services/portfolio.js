// js/services/portfolio.js
import { LocalDB } from "./storage/localDB.js";

const STORE = 'portfolio';

// 取得所有持股
export async function getHoldings() {
    return LocalDB.getAll(STORE);
}

// 新增或更新持股 (修正為配合 Controller 的簽名: id, data)
export async function updateHolding(id, data) {
    // 確保 ticker 大寫
    if (data.ticker) data.ticker = data.ticker.toUpperCase();

    if (id) {
        // 更新現有
        return LocalDB.update(STORE, id, {
            ...data,
            updatedAt: new Date().toISOString()
        });
    } else {
        // 新增 (LocalDB.add 會自動生成 UUID)
        return LocalDB.add(STORE, {
            ...data,
            updatedAt: new Date().toISOString()
        });
    }
}

// 刪除持股
export async function deleteHolding(id) {
    return LocalDB.delete(STORE, id);
}

// 抓取股價 (Yahoo Finance API)
export async function fetchYahooPrice(ticker) {
    if (!ticker) return null;
    
    // 自動修正：如果是 4-6 位數字 (如 2330)，自動加上 .TW
    if (/^\d{4,6}$/.test(ticker)) { ticker = `${ticker}.TW`; }
    
    const baseUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    
    // 使用多個 CORS Proxy 備援，增加成功率
    const proxies = [
        (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    ];

    for (const getProxyUrl of proxies) {
        try {
            const response = await fetch(getProxyUrl(baseUrl));
            if (!response.ok) continue;
            const data = await response.json();
            const result = data.chart.result[0];
            if (result && result.meta && result.meta.regularMarketPrice !== undefined) {
                return result.meta.regularMarketPrice;
            }
        } catch (e) { 
            console.warn(`Proxy failed for ${ticker}:`, e); 
        }
    }
    return null;
}