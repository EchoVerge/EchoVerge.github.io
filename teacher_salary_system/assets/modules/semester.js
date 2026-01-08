import { state } from './state.js';
import { db } from './db.js';
import { renderCalendar } from './calendar.js';

let semModal;

export function initSemesterModal() {
    semModal = new bootstrap.Modal(document.getElementById('semesterModal'));
}

export function openSemesterModal() {
    loadSemesterList();
    document.getElementById('baseScheduleEditor').style.display = 'none';
    semModal.show();
}

export async function loadSemesterList() {
    const list = document.getElementById('semesterList');
    const sems = await db.semesters.toArray();
    list.innerHTML = '';
    sems.forEach(s => {
        list.innerHTML += `
            <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" onclick="editBaseSchedule(${s.id})">
                <div><strong>${s.name}</strong> <small class="text-muted">(${s.startDate} ~ ${s.endDate})</small></div>
                <span class="badge bg-secondary rounded-pill">編輯課表</span>
            </button>`;
    });
}

export async function saveSemester() {
    const name = document.getElementById('semName').value;
    const start = document.getElementById('semStart').value;
    const end = document.getElementById('semEnd').value;
    if(!name || !start || !end) { alert('請填寫完整資訊'); return; }

    const existing = await db.semesters.where('name').equals(name).first();
    if(existing) await db.semesters.update(existing.id, { startDate: start, endDate: end });
    else await db.semesters.add({ name: name, startDate: start, endDate: end, baseSchedule: {} });

    document.getElementById('semName').value = '';
    loadSemesterList();
    renderCalendar();
}

export async function editBaseSchedule(semId) {
    state.currentEditingSemId = semId;
    const sem = await db.semesters.get(semId);
    document.getElementById('editorTitle').innerText = `編輯 ${sem.name} 基本課表`;
    document.getElementById('baseScheduleEditor').style.display = 'block';
    
    const tbody = document.getElementById('baseScheduleBody');
    tbody.innerHTML = '';
    for(let p=1; p<=9; p++) {
        let tr = `<tr><td>${p}</td>`;
        for(let d=1; d<=5; d++) {
            const key = `${d}-${p}`;
            const cellData = sem.baseSchedule[key] || {};
            const type = cellData.type || "";
            const cls = cellData.className || "";
            tr += `<td class="p-1">
                <input type="text" class="form-control form-control-sm mb-1" placeholder="科目" 
                    value="${type}" onchange="updateBaseCell(${semId}, ${d}, ${p}, 'type', this.value)">
                <input type="text" class="form-control form-control-sm" placeholder="班級" style="font-size:0.7rem;"
                    value="${cls}" onchange="updateBaseCell(${semId}, ${d}, ${p}, 'className', this.value)">
            </td>`;
        }
        tr += `</tr>`;
        tbody.innerHTML += tr;
    }
}

export async function updateBaseCell(semId, day, period, field, value) {
    const sem = await db.semesters.get(semId);
    const key = `${day}-${period}`;
    if (!sem.baseSchedule[key]) sem.baseSchedule[key] = {};
    sem.baseSchedule[key][field] = value;
    if (field === 'type' && value === '') delete sem.baseSchedule[key];
    await db.semesters.update(semId, { baseSchedule: sem.baseSchedule });
    if(state.currentSemester && state.currentSemester.id === semId) renderCalendar();
}