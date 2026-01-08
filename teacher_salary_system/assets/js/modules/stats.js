import { state } from './state.js';
import { db } from './db.js';
import { formatDate, getWeekKey } from './utils.js';
import { renderStatsChart } from './charts.js';

let statsModal;

export function initStatsModal() {
    statsModal = new bootstrap.Modal(document.getElementById('statsModal'));
}

export function openStatsModal() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById('statsStart').value = formatDate(firstDay);
    document.getElementById('statsEnd').value = formatDate(today);
    statsModal.show();
}

export async function calculateStats() {
    const startStr = document.getElementById('statsStart').value;
    const endStr = document.getElementById('statsEnd').value;
    const quota = parseInt(document.getElementById('weeklyQuota').value) || 16;
    
    const records = await db.records.where('date').between(startStr, endStr, true, true).toArray();
    
    // 1. 統計各類別總數
    let totalCounts = {};
    state.courseTypes.forEach(t => totalCounts[t.name] = 0);
    
    // 2. 統計每週節數 (用於計算超鐘點)
    let currentDateIter = new Date(startStr);
    const endDateIter = new Date(endStr);
    let weeklyCounts = {};
    let recordMap = {};
    records.forEach(r => recordMap[`${r.date}-${r.period}`] = r);
    const allSems = await db.semesters.toArray();

    while(currentDateIter <= endDateIter) {
        let dStr = formatDate(currentDateIter);
        let day = currentDateIter.getDay();
        let weekKey = getWeekKey(currentDateIter);
        if(!weeklyCounts[weekKey]) weeklyCounts[weekKey] = 0;

        let sem = allSems.find(s => dStr >= s.startDate && dStr <= s.endDate);

        for(let p=1; p<=12; p++) {
            let type = null;
            if (recordMap[`${dStr}-${p}`]) type = recordMap[`${dStr}-${p}`].type;
            else if (sem && sem.baseSchedule && sem.baseSchedule[`${day}-${p}`]) type = sem.baseSchedule[`${day}-${p}`].type;

            if (type) {
                if(!totalCounts[type]) totalCounts[type] = 0;
                totalCounts[type]++;
                
                if (!type.includes('代課') && !type.includes('晚自習') && !type.includes('請假') && !type.includes('超鐘點')) {
                    weeklyCounts[weekKey]++;
                }
            }
        }
        currentDateIter.setDate(currentDateIter.getDate() + 1);
    }

    // 3. 計算溢算節數
    let overtimeTotal = 0;
    for(let wk in weeklyCounts) {
        if (weeklyCounts[wk] > quota) overtimeTotal += (weeklyCounts[wk] - quota);
    }

    // 4. 準備表格與圖表數據
    const tbody = document.getElementById('statsBody');
    tbody.innerHTML = '';
    let moneyTotal = 0;

    // --- 圖表資料結構 ---
    let mainLabels = [];
    let mainData = [];
    let mainColors = [];

    let overlayData = [];
    let overlayColors = [];
    let overlayMeta = []; // 用來存儲外圈的自訂標籤訊息

    // 遍歷所有課程類別
    state.courseTypes.forEach(t => {
        let count = totalCounts[t.name] || 0;
        
        if (count > 0) {
            let sub = count * t.rate;
            moneyTotal += sub;
            tbody.innerHTML += `<tr><td>${t.name}</td><td>${count}</td><td>${t.rate}</td><td>${sub}</td></tr>`;
            
            // --- 1. 內圈數據 (Main)：維持單一完整區塊 ---
            mainLabels.push(t.name);
            mainData.push(count);
            mainColors.push(t.color);
            
            // --- 2. 外圈數據 (Overlay)：負責拆分與標示 ---
            if (t.name === '基本鐘點' && overtimeTotal > 0) {
                let baseCount = Math.max(0, count - overtimeTotal);
                
                // (A) 溢出部分 (顯示顏色)
                overlayData.push(overtimeTotal);
                overlayColors.push(shadeColor(t.color, -0.3)); // 變暗 30%
                overlayMeta.push(`溢出計為超鐘點`); // 自訂 Tooltip 文字

                // (B) 剩餘部分 (透明)
                if (baseCount > 0) {
                    overlayData.push(baseCount);
                    overlayColors.push('rgba(0,0,0,0)'); // 透明
                    overlayMeta.push(null); // 不顯示 Tooltip
                }
            } else {
                // 其他類別：全透明填充
                overlayData.push(count);
                overlayColors.push('rgba(0,0,0,0)');
                overlayMeta.push(null);
            }
        }
    });

    // 5. 處理表格的超鐘點金額顯示
    if (overtimeTotal > 0) {
        let overRate = 420; 
        let overSub = overtimeTotal * overRate;
        moneyTotal += overSub; 

        tbody.innerHTML += `
            <tr class="table-warning fw-bold" style="border-top: 2px solid #ffc107;">
                <td>[系統試算] 超出基本節數</td>
                <td>${overtimeTotal}</td>
                <td>${overRate}</td>
                <td>${overSub}</td>
            </tr>`;
    }
    
    document.getElementById('statsTotal').innerText = `$${moneyTotal}`;

    // 6. 繪製圖表 (傳入新的 overlayMeta)
    renderStatsChart(
        { labels: mainLabels, data: mainData, colors: mainColors },
        { data: overlayData, colors: overlayColors, meta: overlayMeta }
    );
}

export function exportStatsExcel() {
    const table = document.querySelector("#statsModal table");
    const wb = XLSX.utils.table_to_book(table);
    XLSX.writeFile(wb, "薪資統計.xlsx");
}

// --- 工具函式：調整顏色深淺 ---
function shadeColor(color, percent) {
    var f=parseInt(color.slice(1),16),t=percent<0?0:255,p=percent<0?percent*-1:percent,R=f>>16,G=f>>8&0x00FF,B=f&0x0000FF;
    return "#"+(0x1000000+(Math.round((t-R)*p)+R)*0x10000+(Math.round((t-G)*p)+G)*0x100+(Math.round((t-B)*p)+B)).toString(16).slice(1);
}