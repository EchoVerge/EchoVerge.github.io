import { db } from './db.js';
import { state } from './state.js';
import { renderCalendar } from './calendar.js';
import { formatDate } from './utils.js';

let batchModal;

export function initBatchModal() {
    batchModal = new bootstrap.Modal(document.getElementById('batchModal'));
}

export function openBatchModal() {
    // 預設填入本週日期
    const today = new Date();
    document.getElementById('batchStartDate').value = formatDate(today);
    document.getElementById('batchEndDate').value = formatDate(today);
    
    // 填入類別選單
    const select = document.getElementById('batchType');
    select.innerHTML = '';
    state.courseTypes.forEach(t => {
        select.innerHTML += `<option value="${t.name}">${t.name}</option>`;
    });

    batchModal.show();
}

// 執行區間新增
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

    // 迴圈遍歷日期
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        // 檢查星期幾 (0=週日, 1=週一...)
        if (weekDays.includes(d.getDay())) {
            recordsToAdd.push({
                date: formatDate(d),
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

    if (!confirm(`即將新增 ${recordsToAdd.length} 筆紀錄，確定嗎？`)) return;

    // 使用 bulkPut (若重複則覆蓋)
    // 需注意 Dexie 鍵值設定，若 records schema 為 [date+period]，put 會覆蓋舊的
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