/**
 * assets/js/modules/portfolioApi.js
 * 改用 Yahoo Finance (透過 CORS Proxy)，免 API Key，支援度最高
 */
export const portfolioApi = {
    cache: {}, 
    cacheDuration: 5 * 60 * 1000, // Yahoo 報價快取 5 分鐘

    /**
     * 獲取單一股票即時價格
     */
    async getPrice(ticker) {
        if (!ticker) return null;
        
        const upperTicker = ticker.toUpperCase().trim();
        const now = Date.now();
        const cached = this.cache[upperTicker];

        // 1. 檢查快取
        if (cached && (now - cached.timestamp < this.cacheDuration)) {
            return cached.data;
        }

        // 2. 格式智慧轉換 (Yahoo Finance 格式)
        let symbol = upperTicker;
        if (/^\d+$/.test(upperTicker)) {
            // 純數字自動加 .TW (台股上市)
            // 若是上櫃股票可能需要手動輸入代號.TWO，但通常 .TW 通吃
            symbol = upperTicker + '.TW';
        } else if (upperTicker.includes(':')) {
            // 處理 TPE:2330
            symbol = upperTicker.split(':')[1] + '.TW';
        }

        try {
            // 使用 AllOrigins Proxy 繞過 CORS 限制
            // 目標 API: Yahoo Finance Chart API (輕量、免費)
            const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
            
            const response = await fetch(proxyUrl);
            
            if (!response.ok) throw new Error('Network response was not ok');
            
            const data = await response.json();
            const resultData = data.chart.result?.[0];

            if (!resultData) {
                console.warn(`Yahoo Finance 查無代號: ${symbol}`);
                return null;
            }

            const meta = resultData.meta;
            const currentPrice = meta.regularMarketPrice;
            const prevClose = meta.previousClose;
            
            // 計算漲跌 (Yahoo有時不直接給漲跌額，需自行計算)
            const change = currentPrice - prevClose;
            const percent = (change / prevClose) * 100;

            const result = {
                currentPrice: currentPrice,
                change: change,
                percent: percent
            };

            // 3. 寫入快取
            this.cache[upperTicker] = {
                timestamp: now,
                data: result
            };

            return result;
        } catch (e) {
            console.error(`${symbol} 報價獲取失敗 (Yahoo)`, e);
            // 失敗時若有舊快取則回傳，不管過期多久
            return cached ? cached.data : null;
        }
    }
};