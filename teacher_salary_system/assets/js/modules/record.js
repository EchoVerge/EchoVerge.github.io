import { state } from './state.js';
import { db } from './db.js';
import { renderCalendar } from './calendar.js';

let editModal;

export function initRecordModal() {
    editModal = new bootstrap.Modal(document.getElementById('editModal'));
}

export function openEditModal(date, period, currentType, currentClass, currentNote, hasRecord, baseType) {
    document.getElementById('modalDate').value = date;
    document.getElementById('modalPeriod').value = period;
    document.getElementById('modalBaseInfo').innerText = baseType || "空堂";
    
    const select = document.getElementById('modalType');
    select.innerHTML = '';
    state.courseTypes.forEach(t => {
        select.innerHTML += `<option value="${t.name}">${t.name}</option>`;
    });
    
    if (currentType) select.value = currentType;
    else if (baseType) select.value = baseType;
    else select.value = "基本鐘點";

    document.getElementById('modalClass').value = currentClass;
    document.getElementById('modalNote').value = currentNote;

    const btnDelete = document.getElementById('btnDelete');
    if (hasRecord) {
        btnDelete.innerText = "還原至基本/刪除";
        btnDelete.style.display = 'block';
    } else {
        btnDelete.style.display = 'none';
    }
    editModal.show();
}

export async function saveRecord() {
    const date = document.getElementById('modalDate').value; // yyyy-mm-dd
    const period = parseInt(document.getElementById('modalPeriod').value);
    const type = document.getElementById('modalType').value;
    const className = document.getElementById('modalClass').value;
    const note = document.getElementById('modalNote').value;

    // 關鍵修正：不依賴 state.currentSemester，而是直接根據日期找出對應的學期 ID
    const allSems = await db.semesters.toArray();
    const targetSem = allSems.find(s => date >= s.startDate && date <= s.endDate);
    const semesterId = targetSem ? targetSem.id : null;

    // 檢查是否已存在 (update or add)
    const existing = await db.records.where('[date+period]').equals([date, period]).first();
    
    const data = {
        date: date,
        period: period,
        type: type,
        className: className,
        note: note,
        semesterId: semesterId // 使用正確判斷出的學期 ID
    };

    if (existing) {
        await db.records.update(existing.id, data);
    } else {
        await db.records.add(data);
    }

    editModal.hide();
    renderCalendar();
}

export async function deleteRecord() {
    const date = document.getElementById('modalDate').value;
    const period = parseInt(document.getElementById('modalPeriod').value);
    // 刪除紀錄
    await db.records.where('[date+period]').equals([date, period]).delete();
    editModal.hide();
    renderCalendar();
}