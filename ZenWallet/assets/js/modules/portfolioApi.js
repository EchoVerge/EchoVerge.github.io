/**
 * assets/js/modules/portfolioApi.js
 * 負責獲取美股/台股即時報價 (取代 GOOGLEFINANCE)
 */
import { state } from './state.js';

export const portfolioApi = {
    // 範例使用 Finnhub API (需申請免費 API Key)
    apiKey: 'YOUR_FINNHUB_API_KEY', 

    /**
     * 獲取單一股票即時價格
     * @param {string} ticker 股票代號 (如: AAPL, TSLA)
     */
    async getPrice(ticker) {
        try {
            // 注意：台股代號在外部 API 通常需加後綴，如 2330.TW
            const symbol = ticker.includes(':') ? ticker.replace('TPE:', '') + '.TW' : ticker;
            
            const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${this.apiKey}`);
            const data = await response.json();
            
            return {
                currentPrice: data.c, // 目前市價
                change: data.d,       // 漲跌額
                percent: data.dp      // 漲跌幅
            };
        } catch (e) {
            console.error(`${ticker} 報價獲取失敗`, e);
            return null;
        }
    }
};