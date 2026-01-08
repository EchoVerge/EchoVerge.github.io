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
    const date = document.getElementById('modalDate').value;
    const period = parseInt(document.getElementById('modalPeriod').value);
    const type = document.getElementById('modalType').value;
    const className = document.getElementById('modalClass').value;
    const note = document.getElementById('modalNote').value;

    const existing = await db.records.where('[date+period]').equals([date, period]).first();
    const data = {
        date: date, period: period, type: type, className: className, note: note,
        semesterId: state.currentSemester ? state.currentSemester.id : null
    };

    if (existing) await db.records.update(existing.id, data);
    else await db.records.add(data);

    editModal.hide();
    renderCalendar();
}

export async function deleteRecord() {
    const date = document.getElementById('modalDate').value;
    const period = parseInt(document.getElementById('modalPeriod').value);
    await db.records.where('[date+period]').equals([date, period]).delete();
    editModal.hide();
    renderCalendar();
}