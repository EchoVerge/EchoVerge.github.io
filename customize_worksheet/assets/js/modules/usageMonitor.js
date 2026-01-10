/**
 * assets/js/modules/usageMonitor.js
 * V2.0: 監控 API 使用量 (RPM) + Token 消耗量
 */

let requestHistory = []; // 請求時間戳記
let totalRequests = 0;   // 總請求數
let totalTokens = 0;     // [新增] 總 Token 消耗數

export function initUsageMonitor() {
    const container = document.querySelector('.control-panel');
    if (!container) return;

    // 如果已經存在，先移除舊的 (避免重複)
    const oldBadge = document.getElementById('ai-usage-badge');
    if (oldBadge) oldBadge.remove();

    const monitorEl = document.createElement('div');
    monitorEl.id = 'ai-usage-badge';
    monitorEl.style.cssText = `
        position: absolute;
        top: 60px;
        right: 20px;
        font-size: 12px;
        color: #555;
        background: rgba(255,255,255,0.95);
        padding: 6px 12px;
        border-radius: 8px;
        border: 1px solid #ddd;
        display: none;
        flex-direction: column; /* 改為垂直排列 */
        gap: 2px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        z-index: 100;
        pointer-events: none;
        min-width: 150px;
    `;
    monitorEl.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px;">
            <span id="usage-dot" style="width:8px; height:8px; background:#4caf50; border-radius:50%;"></span>
            <strong id="usage-rpm">RPM: 0</strong>
        </div>
        <div style="font-size:11px; color:#666; display:flex; justify-content:space-between;">
            <span>呼叫: <span id="usage-count">0</span></span>
            <span>Token: <span id="usage-tokens">0</span></span>
        </div>
    `;
    container.appendChild(monitorEl);
}

// [修改] 紀錄請求與 Token
// tokens 參數是選填的，因為錯誤時可能沒有 token 資訊
export function recordRequest(tokens = 0) {
    const now = Date.now();
    requestHistory.push(now);
    totalRequests++;
    totalTokens += tokens; // 累加 Token

    // 清理超過 1 分鐘的舊紀錄
    requestHistory = requestHistory.filter(time => now - time < 60000);
    
    updateDisplay();
}

function updateDisplay() {
    const el = document.getElementById('ai-usage-badge');
    const dot = document.getElementById('usage-dot');
    const rpmText = document.getElementById('usage-rpm');
    const countText = document.getElementById('usage-count');
    const tokenText = document.getElementById('usage-tokens'); // [新增]
    
    if (!el) return;
    el.style.display = 'flex';

    const rpm = requestHistory.length;
    let color = '#4caf50'; // 綠

    if (rpm >= 10) color = '#ff9800'; // 橘
    if (rpm >= 15) color = '#f44336'; // 紅

    dot.style.background = color;
    rpmText.textContent = `速率: ${rpm} RPM`;
    countText.textContent = totalRequests;
    
    // 格式化 Token 顯示 (例如 1.2k)
    tokenText.textContent = totalTokens > 1000 ? (totalTokens/1000).toFixed(1) + 'k' : totalTokens;

    if (rpm >= 12) {
        el.style.border = `1px solid ${color}`;
        el.style.boxShadow = `0 0 5px ${color}`;
    } else {
        el.style.border = '1px solid #ddd';
        el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
    }
}

export function handleApiError(error) {
    const msg = error.message || "";
    if (msg.includes('429') || msg.includes('exhausted') || msg.includes('quota')) {
        alert("⚠️ API 額度警告 (429)\n\n請求過於頻繁或額度已用盡，請休息 1 分鐘後再試。");
        const dot = document.getElementById('usage-dot');
        if(dot) dot.style.background = '#000';
        return true;
    }
    return false;
}