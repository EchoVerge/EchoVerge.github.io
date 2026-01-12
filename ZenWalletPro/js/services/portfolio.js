// js/services/portfolio.js
import { db } from "../config.js";
import { collection, addDoc, getDocs, deleteDoc, updateDoc, doc, query, orderBy, Timestamp, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COLLECTION_NAME = "portfolio";

/**
 * 讀取投資組合
 */
export async function getHoldings() {
    try {
        const q = query(collection(db, COLLECTION_NAME), orderBy("ticker", "asc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("讀取投資組合失敗:", e);
        throw e;
    }
}

/**
 * 儲存持股 (新增或更新)
 */
export async function saveHolding(ticker, quantity, price) {
    try {
        ticker = ticker.toUpperCase(); 
        
        const q = query(collection(db, COLLECTION_NAME), where("ticker", "==", ticker));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            // 更新
            const docId = snapshot.docs[0].id;
            const docRef = doc(db, COLLECTION_NAME, docId);
            await updateDoc(docRef, {
                quantity: parseFloat(quantity),
                currentPrice: parseFloat(price),
                updatedAt: Timestamp.now()
            });
            return { success: true, message: "持股已更新" };
        } else {
            // 新增
            await addDoc(collection(db, COLLECTION_NAME), {
                ticker: ticker,
                quantity: parseFloat(quantity),
                currentPrice: parseFloat(price),
                updatedAt: Timestamp.now()
            });
            return { success: true, message: "持股已新增" };
        }
    } catch (e) {
        console.error("儲存持股失敗:", e);
        throw e;
    }
}

/**
 * 刪除持股
 */
export async function deleteHolding(id) {
    try {
        await deleteDoc(doc(db, COLLECTION_NAME, id));
        return { success: true };
    } catch (e) {
        console.error("刪除持股失敗:", e);
        throw e;
    }
}

/**
 * 從 Yahoo Finance 獲取即時股價 (強固版)
 * 1. 自動修正代號 (補上 .TW)
 * 2. 輪詢多個代理伺服器
 */
export async function fetchYahooPrice(ticker) {
    // [自動修正] 如果是 4-6 位數字且沒有小數點，預設加上 .TW
    if (/^\d{4,6}$/.test(ticker)) {
        ticker = `${ticker}.TW`;
        console.log(`[API] 偵測到台股代號，自動修正為: ${ticker}`);
    }

    // Yahoo Finance API
    const baseUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    
    // 代理伺服器列表 (優先順序)
    // 這些是免費的 CORS Proxy，如果一個失敗會自動嘗試下一個
    const proxies = [
        (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
        (url) => `https://thingproxy.freeboard.io/fetch/${url}` // 注意：這個不需 encode
    ];

    for (const getProxyUrl of proxies) {
        try {
            const proxyUrl = getProxyUrl(baseUrl);
            console.log(`[API] 嘗試抓取: ${ticker} via Proxy...`);
            
            const response = await fetch(proxyUrl);
            
            if (!response.ok) {
                console.warn(`[API] Proxy 回傳錯誤狀態: ${response.status}`);
                continue; 
            }

            const data = await response.json();
            
            // 檢查 Yahoo 回傳的錯誤結構 (例如 404 Not Found 會包在 JSON 裡)
            if (data.chart && data.chart.error) {
                console.error(`[API] Yahoo 回傳錯誤:`, data.chart.error);
                // 如果是 Yahoo 說找不到 (Not Found)，那就不用換代理試了，直接中斷
                if (data.chart.error.code === "Not Found") break;
                continue;
            }

            // 檢查資料正確性
            if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
                console.warn(`[API] ${ticker} 查無資料或格式錯誤`, data);
                continue; 
            }

            const result = data.chart.result[0];
            if (!result.meta || result.meta.regularMarketPrice === undefined) {
                continue;
            }

            console.log(`[API] 成功取得 ${ticker} 股價: ${result.meta.regularMarketPrice}`);
            return result.meta.regularMarketPrice; // 成功回傳

        } catch (error) {
            console.warn(`[API] 代理請求異常 (${ticker}):`, error);
        }
    }

    console.error(`[API] 所有代理皆無法取得 ${ticker} 的股價，請檢查代號是否正確 (台股需加 .TW)`);
    return null; // 全部失敗
}

/**
 * 批量更新所有持股的價格
 */
export async function updateAllHoldingsPrices() {
    try {
        const holdings = await getHoldings();
        if (holdings.length === 0) return { success: true, message: "無持股需更新" };

        const batch = writeBatch(db);
        let updatedCount = 0;
        let errorCount = 0;

        // 平行處理所有請求
        const promises = holdings.map(async (h) => {
            // 使用上面更新過的 fetchYahooPrice，它會自動處理 .TW
            const newPrice = await fetchYahooPrice(h.ticker);
            
            if (newPrice !== null) {
                const docRef = doc(db, COLLECTION_NAME, h.id);
                // 順便更新 ticker 名稱 (如果有被自動修正，例如 0056 -> 0056.TW，這裡也可以考慮存回去)
                // 這裡我們先只更新價格
                batch.update(docRef, { 
                    currentPrice: newPrice,
                    updatedAt: Timestamp.now()
                });
                updatedCount++;
            } else {
                errorCount++;
            }
        });

        await Promise.all(promises);

        if (updatedCount > 0) {
            await batch.commit();
        }

        let msg = `更新完成：成功 ${updatedCount} 筆`;
        if (errorCount > 0) msg += `，失敗 ${errorCount} 筆 (請檢查代號)`;
        
        return { 
            success: true, 
            message: msg,
            updatedCount 
        };

    } catch (e) {
        console.error("批量更新失敗:", e);
        throw e;
    }
}