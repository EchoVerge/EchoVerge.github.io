import { db } from './db.js';

let settingsModal;

// 預設時間表
const defaultPeriodTimes = {
    1: { start: '08:10', end: '09:00' },
    2: { start: '09:10', end: '10:00' },
    3: { start: '10:10', end: '11:00' },
    4: { start: '11:10', end: '12:00' },
    5: { start: '13:00', end: '13:50' },
    6: { start: '14:00', end: '14:50' },
    7: { start: '15:10', end: '16:00' },
    8: { start: '16:10', end: '17:00' },
    9: { start: '17:30', end: '18:15' },
    10: { start: '18:20', end: '19:05' },
    11: { start: '19:15', end: '20:00' },
    12: { start: '20:10', end: '20:55' }
};

export function initSettingsModal() {
    settingsModal = new bootstrap.Modal(document.getElementById('settingsModal'));
}

export function openSettingsModal() {
    renderSettingsTable();
    renderPeriodTimesTable();
    settingsModal.show();
}

export async function renderSettingsTable() {
    const list = document.getElementById('courseTypesBody');
    const types = await db.settings.where('key').equals('courseTypes').first();
    const typeList = types ? types.value : [];
    
    list.innerHTML = '';
    typeList.forEach((t, index) => {
        list.innerHTML += `
            <tr>
                <td><input type="text" class="form-control form-control-sm" value="${t.name}" onchange="updateType(${index}, 'name', this.value)"></td>
                <td><input type="number" class="form-control form-control-sm" value="${t.rate}" onchange="updateType(${index}, 'rate', this.value)"></td>
                <td><input type="color" class="form-control form-control-sm form-control-color" value="${t.color}" onchange="updateType(${index}, 'color', this.value)"></td>
                <td><button class="btn btn-sm btn-outline-danger" onclick="removeType(${index})"><i class="bi bi-trash"></i></button></td>
            </tr>`;
    });
}

export async function addCourseType() {
    const name = document.getElementById('newTypeName').value;
    const rate = parseInt(document.getElementById('newTypeRate').value);
    const color = document.getElementById('newTypeColor').value;
    
    if(name && !isNaN(rate)) {
        const types = await db.settings.where('key').equals('courseTypes').first();
        let list = types ? types.value : [];
        list.push({ id: Date.now(), name, rate, color });
        
        await db.settings.put({ key: 'courseTypes', value: list });
        
        document.getElementById('newTypeName').value = '';
        document.getElementById('newTypeRate').value = '';
        renderSettingsTable();
    }
}

export async function updateType(index, field, value) {
    const types = await db.settings.where('key').equals('courseTypes').first();
    if(types) {
        types.value[index][field] = (field === 'rate') ? parseInt(value) : value;
        await db.settings.put(types);
    }
}

export async function removeType(index) {
    if(!confirm('確定刪除此類別？')) return;
    const types = await db.settings.where('key').equals('courseTypes').first();
    if(types) {
        types.value.splice(index, 1);
        await db.settings.put(types);
        renderSettingsTable();
    }
}

// --- 節次時間設定相關函式 ---

export async function renderPeriodTimesTable() {
    const tbody = document.getElementById('periodTimesBody');
    let setting = await db.settings.where('key').equals('periodTimes').first();
    let times = setting ? setting.value : defaultPeriodTimes;

    tbody.innerHTML = '';
    for (let p = 1; p <= 12; p++) {
        const t = times[p] || { start: '', end: '' };
        tbody.innerHTML += `
            <tr>
                <td class="text-center fw-bold">${p}</td>
                <td><input type="time" class="form-control form-control-sm period-start" data-period="${p}" value="${t.start}"></td>
                <td><input type="time" class="form-control form-control-sm period-end" data-period="${p}" value="${t.end}"></td>
            </tr>
        `;
    }
}

export async function savePeriodTimes() {
    const times = {};
    document.querySelectorAll('.period-start').forEach(input => {
        const p = input.dataset.period;
        if (!times[p]) times[p] = {};
        times[p].start = input.value;
    });
    
    document.querySelectorAll('.period-end').forEach(input => {
        const p = input.dataset.period;
        if (times[p]) times[p].end = input.value;
    });

    await db.settings.put({ key: 'periodTimes', value: times });
    alert('時間設定已儲存！');
    settingsModal.hide();
    
    if (window.checkActivePeriod) window.checkActivePeriod();
}

// 匯出給其他模組使用
export async function getPeriodTimes() {
    let setting = await db.settings.where('key').equals('periodTimes').first();
    return setting ? setting.value : defaultPeriodTimes;
}