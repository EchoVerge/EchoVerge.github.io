import { state } from './state.js';
import { db } from './db.js';
import { formatDate, getWeekNumber } from './utils.js';

// 判斷學期
export async function determineSemester(date) {
    const dateStr = formatDate(date);
    const semesters = await db.semesters.toArray();
    const found = semesters.find(s => dateStr >= s.startDate && dateStr <= s.endDate);
    return found || null;
}

// 導覽功能
export function jumpToToday() { 
    state.currentDate = new Date(); 
    renderCalendar(); 
}

export function changeWeek(d) { 
    state.currentDate.setDate(state.currentDate.getDate() + d); 
    renderCalendar(); 
}

export function jumpToSpecificDate(dateStr) {
    state.currentDate = new Date(dateStr);
    renderCalendar();
}

// 渲染側邊欄
export function renderSidebar(centerDate) {
    const list = document.getElementById('sidebarList');
    if (!list) return;
    
    list.innerHTML = '';
    let lastMonthLabel = '';

    let baseDate = new Date(centerDate);
    baseDate.setDate(baseDate.getDate() - baseDate.getDay());

    for (let i = -4; i <= 4; i++) {
        let tempDate = new Date(baseDate);
        tempDate.setDate(tempDate.getDate() + (i * 7));

        let monthLabel = tempDate.toLocaleString('zh-TW', { year: 'numeric', month: 'long' });
        if (monthLabel !== lastMonthLabel) {
            list.innerHTML += `<div class="month-header">${monthLabel}</div>`;
            lastMonthLabel = monthLabel;
        }

        let endDate = new Date(tempDate);
        endDate.setDate(endDate.getDate() + 6);

        let displayStr = `${tempDate.getMonth()+1}/${tempDate.getDate()} - ${endDate.getMonth()+1}/${endDate.getDate()}`;
        let dateValue = formatDate(tempDate); 
        let isActive = (i === 0) ? 'active' : '';

        list.innerHTML += `
            <div class="week-card ${isActive}" onclick="jumpToSpecificDate('${dateValue}')">
                <span class="week-card-date">W${getWeekNumber(tempDate)}: ${displayStr}</span>
            </div>`;
    }
}

// 渲染主行事曆
export async function renderCalendar() {
    const grid = document.getElementById('calendar');
    if (!grid) return;
    
    grid.innerHTML = '<div class="col-12 text-center py-5">載入資料中...</div>';

    const startOfWeek = new Date(state.currentDate);
    startOfWeek.setDate(state.currentDate.getDate() - state.currentDate.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    
    const rangeLabel = document.getElementById('currentWeekRange');
    if(rangeLabel) rangeLabel.innerText = `${formatDate(startOfWeek)} ~ ${formatDate(endOfWeek)}`;
    
    renderSidebar(state.currentDate);

    let checkDate = new Date(startOfWeek); checkDate.setDate(checkDate.getDate()+3);
    state.currentSemester = await determineSemester(checkDate);

    const semLabel = document.getElementById('currentSemesterLabel');
    const alertBox = document.getElementById('semesterAlert');
    
    if (semLabel) {
        if(state.currentSemester) {
            semLabel.innerText = state.currentSemester.name;
            if(alertBox) alertBox.style.display = 'none';
        } else {
            semLabel.innerText = "無學期設定";
            if(alertBox) alertBox.style.display = 'block';
        }
    }

    grid.innerHTML = '';
    const weekDays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
    let headerHtml = `<div class="header-cell">節次</div>`;
    for(let i=0; i<7; i++) {
        let d = new Date(startOfWeek); d.setDate(d.getDate() + i);
        let isWeekend = (i===0 || i===6) ? 'weekend' : '';
        headerHtml += `<div class="header-cell ${isWeekend}">${weekDays[i]}<br><small class="fw-normal">${d.getMonth()+1}/${d.getDate()}</small></div>`;
    }
    grid.innerHTML += headerHtml;

    const startStr = formatDate(startOfWeek);
    const endStr = formatDate(endOfWeek);
    const records = await db.records.where('date').between(startStr, endStr, true, true).toArray();
    let recordMap = {};
    records.forEach(r => recordMap[`${r.date}-${r.period}`] = r);

    for (let p = 1; p <= 12; p++) {
        grid.innerHTML += `<div class="header-cell d-flex align-items-center justify-content-center bg-light">${p}</div>`;
        
        for (let col = 0; col < 7; col++) {
            let cellDate = new Date(startOfWeek); cellDate.setDate(cellDate.getDate() + col);
            let dateStr = formatDate(cellDate);
            let dayOfWeek = cellDate.getDay(); 

            let record = recordMap[`${dateStr}-${p}`];
            let baseInfo = null;

            if (state.currentSemester && state.currentSemester.baseSchedule && dayOfWeek >= 1 && dayOfWeek <= 5) {
                baseInfo = state.currentSemester.baseSchedule[`${dayOfWeek}-${p}`];
            }

            let displayType = "", displayClass = "", displayNote = "", isPreview = false;
            let colorCode = "#6c757d"; 

            if (record) {
                displayType = record.type;
                displayClass = record.className || "";
                displayNote = record.note || "";
                let typeConfig = state.courseTypes.find(t => t.name === displayType);
                if(typeConfig) colorCode = typeConfig.color;
            } else if (baseInfo && baseInfo.type) {
                displayType = baseInfo.type;
                displayClass = baseInfo.className || "";
                isPreview = true;
                let typeConfig = state.courseTypes.find(t => t.name === displayType);
                if(typeConfig) colorCode = typeConfig.color;
            }

            let cellContent = "";
            let isDraggable = false; // [新增] 是否可拖曳旗標

            if (displayType) {
                isDraggable = true; // [新增] 有內容才可拖曳
                
                let style = isPreview 
                    ? `background-color: #e9ecef; color: black; border: 2px dashed ${colorCode};` 
                    : `background-color: ${colorCode}; color: white;`;
                
                cellContent = `
                    <div class="class-block" style="${style}">
                        <span class="fw-bold">${displayType}</span>
                        ${displayClass ? `<div class="class-name-tag">${displayClass}</div>` : ''}
                        ${displayNote ? `<small>(${displayNote})</small>` : ''}
                    </div>`;
            }

            const safe = (s) => s ? s.replace(/'/g, "&apos;") : "";
            const baseTypeSafe = baseInfo ? safe(baseInfo.type) : "";
            
            // [修改] 加入 draggable 屬性
            grid.innerHTML += `
                <div class="period-cell" 
                     draggable="${isDraggable}"
                     onclick="openEditModal('${dateStr}', ${p}, '${safe(displayType)}', '${safe(displayClass)}', '${safe(displayNote)}', ${!!record}, '${baseTypeSafe}')">
                    ${cellContent}
                </div>`;
        }
    }
}