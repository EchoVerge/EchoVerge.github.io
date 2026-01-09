import { db } from './db.js';
import { state } from './state.js';
import { renderCalendar } from './calendar.js';
import { formatDate } from './utils.js';

let batchModal;

export function initBatchModal() {
    batchModal = new bootstrap.Modal(document.getElementById('batchModal'));
}

export function openBatchModal() {
    const today = new Date();
    document.getElementById('batchStartDate').value = formatDate(today);
    document.getElementById('batchEndDate').value = formatDate(today);
    
    const select = document.getElementById('batchType');
    select.innerHTML = '';
    state.courseTypes.forEach(t => {
        select.innerHTML += `<option value="${t.name}">${t.name}</option>`;
    });

    batchModal.show();
}

export async function batchAddRecords() {
    const startStr = document.getElementById('batchStartDate').value;
    const endStr = document.getElementById('batchEndDate').value;
    const type = document.getElementById('batchType').value;
    const period = parseInt(document.getElementById('batchPeriod').value);
    const className = document.getElementById('batchClass').value;
    const note = document.getElementById('batchNote').value;
    const weekDays = Array.from(document.querySelectorAll('input[name="batchWeekDay"]:checked')).map(el => parseInt(el.value));

    if (!startStr || !endStr || !type || isNaN(period) || weekDays.length === 0) {
        alert("請完整填寫日期、節次、類別並至少勾選一個星期");
        return;
    }

    const startDate = new Date(startStr);
    const endDate = new Date(endStr);
    const recordsToAdd = [];
    const conflictInfo = []; // 存衝突訊息

    // 預先抓出區間內所有紀錄
    const existingRecords = await db.records.where('date').between(startStr, endStr, true, true).toArray();
    const existingSet = new Set(existingRecords.map(r => `${r.date}-${r.period}`));

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        if (weekDays.includes(d.getDay())) {
            const dStr = formatDate(d);
            const dayOfWeek = d.getDay();
            
            // 1. 檢查是否有「紀錄」衝突
            if (existingSet.has(`${dStr}-${period}`)) {
                conflictInfo.push(`${dStr} (已有紀錄)`);
            }
            // 2. 檢查是否有「基本課表」衝突
            else if (state.currentSemester && state.currentSemester.baseSchedule) {
                const baseKey = `${dayOfWeek}-${period}`;
                const baseClass = state.currentSemester.baseSchedule[baseKey];
                if (baseClass && baseClass.type) {
                    conflictInfo.push(`${dStr} (基本課表: ${baseClass.type})`);
                }
            }

            recordsToAdd.push({
                date: dStr,
                period: period,
                type: type,
                className: className,
                note: note,
                semesterId: state.currentSemester ? state.currentSemester.id : null
            });
        }
    }

    if (recordsToAdd.length === 0) {
        alert("區間內沒有符合勾選星期的日期");
        return;
    }

    // 顯示衝突警告
    if (conflictInfo.length > 0) {
        const msg = `⚠️ 偵測到 ${conflictInfo.length} 筆時段已有課程！\n(包含基本課表與現有紀錄)\n\n衝突範例：\n${conflictInfo.slice(0, 3).join('\n')}${conflictInfo.length > 3 ? '\n...' : ''}\n\n若繼續，將會覆蓋這些課程。確定要執行嗎？`;
        if (!confirm(msg)) return;
    } else {
        if (!confirm(`即將新增 ${recordsToAdd.length} 筆紀錄，確定嗎？`)) return;
    }

    try {
        await db.records.bulkPut(recordsToAdd);
        alert("批次新增成功！");
        batchModal.hide();
        renderCalendar();
    } catch (e) {
        console.error(e);
        alert("新增失敗：" + e.message);
    }
}