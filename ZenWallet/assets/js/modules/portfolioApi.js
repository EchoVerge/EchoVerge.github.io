/**
 * assets/js/modules/portfolioApi.js
 * 負責獲取美股/台股即時報價，包含快取機制以節省 API 額度
 */
export const portfolioApi = {
    apiKey: 'ctua0qhr01qhc5mj2tRgctua0qhr01qhc5mj2th0', // 範例 Finnhub Key (建議換成您自己的)
    cache: {}, // 簡單的記憶體快取
    cacheDuration: 60 * 1000, // 快取有效時間：60 秒

    /**
     * 獲取單一股票即時價格 (含快取)
     */
    async getPrice(ticker) {
        if (!ticker) return null;
        
        const now = Date.now();
        const cached = this.cache[ticker];

        // 1. 檢查快取是否有效
        if (cached && (now - cached.timestamp < this.cacheDuration)) {
            // console.log(`[Cache] 使用快取報價: ${ticker}`);
            return cached.data;
        }

        // 2. 無快取或過期，請求 API
        try {
            // 簡易處理台股後綴 (Finnhub 格式: 2330.TW)
            const symbol = ticker.includes(':') ? ticker.split(':')[1] + '.TW' : ticker;
            
            // 注意：Finnhub 免費版限制每秒 30 次請求，請勿過度頻繁呼叫
            const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${this.apiKey}`);
            const data = await response.json();
            
            // Finnhub 回傳 0 可能代表查無此股
            if (data.c === 0 && data.d === null) {
                console.warn(`查無代號: ${ticker}`);
                return null;
            }

            const result = {
                currentPrice: data.c, // Current price
                change: data.d,       // Change
                percent: data.dp      // Percent change
            };

            // 3. 寫入快取
            this.cache[ticker] = {
                timestamp: now,
                data: result
            };

            return result;
        } catch (e) {
            console.error(`${ticker} 報價獲取失敗`, e);
            return cached ? cached.data : null; // 失敗時若有舊快取則回傳
        }
    }
};