import { state } from './state.js';
import { db } from './db.js';
import { renderCalendar } from './calendar.js';

let settingsModal;

export function initSettingsModal() {
    settingsModal = new bootstrap.Modal(document.getElementById('settingsModal'));
}

export function openSettingsModal() { 
    renderSettingsTable(); 
    settingsModal.show(); 
}

export function renderSettingsTable() {
    const tbody = document.getElementById('courseTypesBody');
    tbody.innerHTML = '';
    state.courseTypes.forEach((t, idx) => {
        tbody.innerHTML += `
            <tr>
                <td><input type="text" class="form-control form-control-sm" value="${t.name}" onchange="updateType(${idx}, 'name', this.value)"></td>
                <td><input type="number" class="form-control form-control-sm" value="${t.rate}" onchange="updateType(${idx}, 'rate', this.value)"></td>
                <td><input type="color" class="form-control form-control-sm form-control-color" value="${t.color}" onchange="updateType(${idx}, 'color', this.value)"></td>
                <td><button class="btn btn-sm btn-outline-danger" onclick="removeType(${idx})"><i class="bi bi-trash"></i></button></td>
            </tr>`;
    });
}

export async function addCourseType() {
    const name = document.getElementById('newTypeName').value;
    const rate = document.getElementById('newTypeRate').value;
    const color = document.getElementById('newTypeColor').value;
    if(!name) return;
    state.courseTypes.push({ name, rate: parseInt(rate)||0, color });
    await db.settings.put({ key: 'courseTypes', value: state.courseTypes });
    document.getElementById('newTypeName').value = '';
    renderSettingsTable(); 
    renderCalendar();
}

export async function updateType(index, field, value) {
    state.courseTypes[index][field] = (field === 'rate') ? parseInt(value) : value;
    await db.settings.put({ key: 'courseTypes', value: state.courseTypes });
    renderCalendar();
}

export async function removeType(index) {
    if(confirm('確定刪除此類別？')) {
        state.courseTypes.splice(index, 1);
        await db.settings.put({ key: 'courseTypes', value: state.courseTypes });
        renderSettingsTable(); 
        renderCalendar();
    }
}