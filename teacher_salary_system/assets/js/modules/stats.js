import { state } from './state.js';
import { db } from './db.js';
import { formatDate, getWeekKey } from './utils.js';

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
    
    let totalCounts = {};
    state.courseTypes.forEach(t => totalCounts[t.name] = 0);
    
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
                
                // 修正邏輯：排除特殊課程，且排除已經手動標記為「超鐘點」的課程，避免重複計算
                if (!type.includes('代課') && 
                    !type.includes('晚自習') && 
                    !type.includes('請假') && 
                    !type.includes('超鐘點')) {
                    weeklyCounts[weekKey]++;
                }
            }
        }
        currentDateIter.setDate(currentDateIter.getDate() + 1);
    }

    let overtimeTotal = 0;
    for(let wk in weeklyCounts) {
        if (weeklyCounts[wk] > quota) overtimeTotal += (weeklyCounts[wk] - quota);
    }

    const tbody = document.getElementById('statsBody');
    tbody.innerHTML = '';
    let moneyTotal = 0;

    // 1. 顯示各類別統計
    state.courseTypes.forEach(t => {
        let count = totalCounts[t.name] || 0;
        if (count > 0) {
            let sub = count * t.rate;
            moneyTotal += sub;
            tbody.innerHTML += `<tr><td>${t.name}</td><td>${count}</td><td>${t.rate}</td><td>${sub}</td></tr>`;
        }
    });

    // 2. 顯示系統自動試算的超鐘點
    if (overtimeTotal > 0) {
        let overRate = 420; 
        let overSub = overtimeTotal * overRate;
        moneyTotal += overSub; // 將金額加入總計

        tbody.innerHTML += `
            <tr class="table-warning fw-bold" style="border-top: 2px solid #ffc107;">
                <td>[系統試算] 超出基本節數</td>
                <td>${overtimeTotal}</td>
                <td>${overRate}</td>
                <td>${overSub}</td>
            </tr>`;
    }
    
    document.getElementById('statsTotal').innerText = `$${moneyTotal}`;
}

export function exportStatsExcel() {
    const table = document.querySelector("#statsModal table");
    const wb = XLSX.utils.table_to_book(table);
    XLSX.writeFile(wb, "薪資統計.xlsx");
}