import { state } from './state.js';
import { db } from './db.js';
import { formatDate, getWeekNumber, getClassColor, getTagColorVariation } from './utils.js';
import { getPeriodTimes } from './settings.js';

// 輔助函式：將 "HH:mm" 轉為分鐘數 (例如 "08:10" -> 490)
function timeToMinutes(timeStr) {
    if (!timeStr) return -1;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

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

        let displayStr = `${tempDate.getMonth() + 1}/${tempDate.getDate()} - ${endDate.getMonth() + 1}/${endDate.getDate()}`;
        let dateValue = formatDate(tempDate);
        let isActive = (i === 0) ? 'active' : '';

        list.innerHTML += `
            <div class="week-card ${isActive}" onclick="jumpToSpecificDate('${dateValue}')">
                <span class="week-card-date">W${getWeekNumber(tempDate)}: ${displayStr}</span>
            </div>`;
    }
}

// 檢查並標註當前與即將開始的課程
export async function checkActivePeriod() {
    const times = await getPeriodTimes();
    const now = new Date();
    const currentDayStr = formatDate(now);

    // 取得當前總分鐘數 (例如 08:10 = 490)
    const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();

    // 1. 移除舊的標註 (包含進行中與即將開始)
    document.querySelectorAll('.period-cell.now-playing').forEach(el => el.classList.remove('now-playing'));
    document.querySelectorAll('.period-cell.coming-soon').forEach(el => el.classList.remove('coming-soon'));

    // 2. 檢查每一個節次
    for (let p = 1; p <= 12; p++) {
        const t = times[p];
        if (t && t.start && t.end) {
            const startMin = timeToMinutes(t.start);
            const endMin = timeToMinutes(t.end);

            // 找到對應的格子
            const selector = `.period-cell[data-date="${currentDayStr}"][data-period="${p}"]`;
            const cell = document.querySelector(selector);

            if (cell) {
                // A. 判斷是否「正在進行」 (Current)
                if (currentTotalMinutes >= startMin && currentTotalMinutes <= endMin) {
                    cell.classList.add('now-playing');
                }
                // B. 判斷是否「即將開始」 (Preview: 開課前 15 分鐘內)
                // 條件：(現在時間 >= 開始時間-15) 且 (現在時間 < 開始時間)
                else if (currentTotalMinutes >= (startMin - 15) && currentTotalMinutes < startMin) {
                    cell.classList.add('coming-soon');
                }
            }
        }
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
    if (rangeLabel) rangeLabel.innerText = `${formatDate(startOfWeek)} ~ ${formatDate(endOfWeek)}`;

    renderSidebar(state.currentDate);

    let checkDate = new Date(startOfWeek); checkDate.setDate(checkDate.getDate() + 3);
    state.currentSemester = await determineSemester(checkDate);

    const semLabel = document.getElementById('currentSemesterLabel');
    const alertBox = document.getElementById('semesterAlert');

    if (semLabel) {
        if (state.currentSemester) {
            semLabel.innerText = state.currentSemester.name;
            if (alertBox) alertBox.style.display = 'none';
        } else {
            semLabel.innerText = "無學期設定";
            if (alertBox) alertBox.style.display = 'block';
        }
    }

    grid.innerHTML = '';
    const weekDays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
    let headerHtml = `<div class="header-cell">節次</div>`;
    for (let i = 0; i < 7; i++) {
        let d = new Date(startOfWeek); d.setDate(d.getDate() + i);
        let isWeekend = (i === 0 || i === 6) ? 'weekend' : '';
        headerHtml += `<div class="header-cell ${isWeekend}">${weekDays[i]}<br><small class="fw-normal">${d.getMonth() + 1}/${d.getDate()}</small></div>`;
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

            let displayType = "", displayClass = "", displayTag = "", displayColor = "", displayNote = "", isPreview = false;

            if (record) {
                displayType = record.type;
                displayClass = record.className || "";
                displayTag = record.tag || "";
                displayColor = record.color || ""; // 讀取手動顏色
                displayNote = record.note || "";
            } else if (baseInfo && baseInfo.type) {
                displayType = baseInfo.type;
                displayClass = baseInfo.className || "";
                displayTag = baseInfo.tag || "";
                displayColor = baseInfo.color || ""; // 讀取手動顏色
                isPreview = true;
            }

            let cellContent = "";
            let isDraggable = false;

            if (displayType || displayClass) {
                isDraggable = true;

                let typeColor = "#6c757d";
                let typeConfig = state.courseTypes.find(t => t.name === displayType);
                if (typeConfig) typeColor = typeConfig.color;

                // 2. 決定班級底色：如果有手動選擇就用手動的，否則依賴自動 Hash 分配
                let baseClassColor = displayColor ? displayColor : getClassColor(displayClass);
                let classColor = getTagColorVariation(baseClassColor, displayTag);

                let style = isPreview
                    ? `background-color: ${classColor}; color: white; border: 2px dashed rgba(255,255,255,0.8); opacity: 0.85;`
                    : `background-color: ${classColor}; color: white;`;

                let badgeStyle = `background-color: ${typeColor}; box-shadow: 0 2px 5px rgba(0,0,0,0.6), 0 0 1px rgba(255,255,255,0.8); border-radius: 4px; padding: 2px 6px; font-size: 0.75rem; margin-top: 4px; display: inline-block; line-height: 1.2;`;

                let classDisplayHtml = `<span class="fw-bold">${displayClass || '未填班級'}</span>`;
                if (displayTag) {
                    classDisplayHtml += `<div style="font-size:0.85rem; font-weight:bold; opacity:0.95; margin-top:2px;">${displayTag}</div>`;
                }

                cellContent = `
                    <div class="class-block" style="${style}">
                        ${classDisplayHtml}
                        <div style="${badgeStyle}">${displayType}</div>
                        ${displayNote ? `<small style="margin-top:3px; opacity:0.9;">(${displayNote})</small>` : ''}
                    </div>`;
            }

            const safe = (s) => s ? s.replace(/'/g, "&apos;") : "";
            const baseTypeSafe = baseInfo ? safe(baseInfo.type) : "";

            grid.innerHTML += `
                <div class="period-cell" 
                     draggable="${isDraggable}" 
                     data-date="${dateStr}"
                     data-period="${p}"
                     onclick="openEditModal('${dateStr}', ${p}, '${safe(displayType)}', '${safe(displayClass)}', '${safe(displayTag)}', '${safe(displayColor)}', '${safe(displayNote)}', ${!!record}, '${baseTypeSafe}')">
                    ${cellContent}
                </div>`;
        }
    }

    // 渲染完畢後，立即檢查一次目前時間
    checkActivePeriod();
}