/**
 * assets/js/modules/usageMonitor.js
 * V2.1: 修正重複計數問題
 */

let requestHistory = []; 
let totalRequests = 0;   
let totalTokens = 0;     

export function initUsageMonitor() {
    const container = document.querySelector('.control-panel');
    if (!container) return;
    
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
        flex-direction: column;
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

// [修改重點] 新增 isUpdate 參數
export function recordRequest(tokens = 0, isUpdate = false) {
    const now = Date.now();
    
    // 如果不是「更新模式」，才增加請求次數與時間戳
    if (!isUpdate) {
        requestHistory.push(now);
        totalRequests++;
    }
    
    // 無論如何都累加 Token
    totalTokens += tokens; 

    requestHistory = requestHistory.filter(time => now - time < 60000);
    updateDisplay();
}

function updateDisplay() {
    const el = document.getElementById('ai-usage-badge');
    const dot = document.getElementById('usage-dot');
    const rpmText = document.getElementById('usage-rpm');
    const countText = document.getElementById('usage-count');
    const tokenText = document.getElementById('usage-tokens');
    
    if (!el) return;
    el.style.display = 'flex';

    const rpm = requestHistory.length;
    let color = '#4caf50'; 

    if (rpm >= 10) color = '#ff9800'; 
    if (rpm >= 15) color = '#f44336'; 

    dot.style.background = color;
    rpmText.textContent = `速率: ${rpm} RPM`;
    countText.textContent = totalRequests;
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