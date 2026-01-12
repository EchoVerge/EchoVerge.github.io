import { LocalDB } from "./storage/localDB.js";

const STORE = 'portfolio';

export async function getHoldings() {
    return LocalDB.getAll(STORE);
}

export async function saveHolding(ticker, quantity, price) {
    ticker = ticker.toUpperCase();
    const all = await LocalDB.getAll(STORE);
    const existing = all.find(h => h.ticker === ticker);

    if (existing) {
        return LocalDB.update(STORE, existing.id, {
            quantity: parseFloat(quantity),
            currentPrice: parseFloat(price),
            updatedAt: new Date().toISOString()
        });
    } else {
        return LocalDB.add(STORE, {
            ticker,
            quantity: parseFloat(quantity),
            currentPrice: parseFloat(price),
            updatedAt: new Date().toISOString()
        });
    }
}

export async function deleteHolding(id) {
    return LocalDB.delete(STORE, id);
}

// 股價抓取功能 (保持不變，因為是 call 外部 API)
export async function fetchYahooPrice(ticker) {
    if (/^\d{4,6}$/.test(ticker)) { ticker = `${ticker}.TW`; }
    const baseUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
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
        } catch (e) { console.warn(e); }
    }
    return null;
}

export async function updateAllHoldingsPrices() {
    const holdings = await getHoldings();
    let updatedCount = 0;
    for (const h of holdings) {
        const price = await fetchYahooPrice(h.ticker);
        if (price !== null) {
            await LocalDB.update(STORE, h.id, { currentPrice: price, updatedAt: new Date().toISOString() });
            updatedCount++;
        }
    }
    return { message: `已更新 ${updatedCount} 筆股價` };
}