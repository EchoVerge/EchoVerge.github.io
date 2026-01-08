import { state } from './state.js';
import { db } from './db.js';
import { renderCalendar } from './calendar.js';

let semModal;
let baseSlotModal; // 新增：單格編輯視窗實例

export function initSemesterModal() {
    semModal = new bootstrap.Modal(document.getElementById('semesterModal'));
    baseSlotModal = new bootstrap.Modal(document.getElementById('baseSlotModal'));
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

// --- 改寫：視覺化課表編輯器 ---
export async function editBaseSchedule(semId) {
    state.currentEditingSemId = semId;
    const sem = await db.semesters.get(semId);
    document.getElementById('editorTitle').innerText = `編輯 ${sem.name} 基本課表`;
    document.getElementById('baseScheduleEditor').style.display = 'block';
    
    const tbody = document.getElementById('baseScheduleBody');
    tbody.innerHTML = '';
    
    // 產生 1-9 節 (可視需求增加到 12)
    for(let p=1; p<=9; p++) {
        let tr = `<tr><td class="align-middle fw-bold bg-light">${p}</td>`;
        for(let d=1; d<=5; d++) {
            const key = `${d}-${p}`;
            const cellData = sem.baseSchedule[key];
            
            let content = `<span class="text-muted small" style="opacity:0.3">+</span>`;
            let style = "background-color: white;"; // 預設白底
            
            if (cellData && cellData.type) {
                // 根據課程類別找顏色
                const typeConfig = state.courseTypes.find(t => t.name === cellData.type);
                const color = typeConfig ? typeConfig.color : '#6c757d';
                
                // 設定樣式
                style = `background-color: ${color}; color: white; border: 1px solid rgba(0,0,0,0.1);`;
                content = `
                    <div class="fw-bold small">${cellData.type}</div>
                    ${cellData.className ? `<div style="font-size:0.7em; opacity:0.9;">${cellData.className}</div>` : ''}
                `;
            }

            // 產生格子，綁定 onclick 事件
            tr += `<td class="p-1" style="height: 60px; vertical-align: middle; cursor: pointer;" onclick="openBaseSlotModal(${d}, ${p})">
                <div class="h-100 w-100 d-flex flex-column justify-content-center align-items-center rounded shadow-sm transition-hover" style="${style}">
                    ${content}
                </div>
            </td>`;
        }
        tr += `</tr>`;
        tbody.innerHTML += tr;
    }
}

// --- 新增：開啟單格編輯視窗 ---
export function openBaseSlotModal(day, period) {
    document.getElementById('baseSlotDay').value = day;
    document.getElementById('baseSlotPeriod').value = period;
    
    const dayNames = ['一', '二', '三', '四', '五'];
    document.getElementById('baseSlotTitle').innerText = `週${dayNames[day-1]} 第 ${period} 節`;
    
    // 1. 填入課程類別選項
    const select = document.getElementById('baseSlotType');
    select.innerHTML = '';
    state.courseTypes.forEach(t => {
        select.innerHTML += `<option value="${t.name}">${t.name}</option>`;
    });
    
    // 2. 讀取目前設定 (如果有的話)
    db.semesters.get(state.currentEditingSemId).then(sem => {
        const key = `${day}-${period}`;
        const cellData = sem.baseSchedule[key];
        
        if (cellData) {
            select.value = cellData.type;
            document.getElementById('baseSlotClass').value = cellData.className || '';
        } else {
            // 預設選第一個類別，清空班級
            select.value = state.courseTypes[0]?.name || '';
            document.getElementById('baseSlotClass').value = '';
        }
        
        baseSlotModal.show();
    });
}

// --- 新增：儲存單格設定 ---
export async function saveBaseSlot() {
    const day = document.getElementById('baseSlotDay').value;
    const period = document.getElementById('baseSlotPeriod').value;
    const type = document.getElementById('baseSlotType').value;
    const className = document.getElementById('baseSlotClass').value;
    
    const semId = state.currentEditingSemId;
    const sem = await db.semesters.get(semId);
    
    const key = `${day}-${period}`;
    if (!sem.baseSchedule) sem.baseSchedule = {};
    
    // 寫入資料
    sem.baseSchedule[key] = { type, className };
    
    await db.semesters.update(semId, { baseSchedule: sem.baseSchedule });
    
    baseSlotModal.hide();
    editBaseSchedule(semId); // 重新繪製表格
    
    // 如果當前正在檢視此學期，同步更新主畫面行事曆
    if(state.currentSemester && state.currentSemester.id === semId) renderCalendar();
}

// --- 新增：刪除單格設定 ---
export async function deleteBaseSlot() {
    const day = document.getElementById('baseSlotDay').value;
    const period = document.getElementById('baseSlotPeriod').value;
    const semId = state.currentEditingSemId;
    
    const sem = await db.semesters.get(semId);
    const key = `${day}-${period}`;
    
    if (sem.baseSchedule && sem.baseSchedule[key]) {
        delete sem.baseSchedule[key];
        await db.semesters.update(semId, { baseSchedule: sem.baseSchedule });
    }
    
    baseSlotModal.hide();
    editBaseSchedule(semId); // 重新繪製表格
    if(state.currentSemester && state.currentSemester.id === semId) renderCalendar();
}