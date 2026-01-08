// --- 全域變數 ---
let currentDate = new Date();
let currentSemester = null; 
let courseTypes = []; 
let currentEditingSemId = null;

// --- 初始化 ---
window.onload = async function() {
    // 從 db.js 呼叫 loadSettings
    courseTypes = await loadSettings();
    jumpToToday();
};

// --- 核心邏輯：行事曆渲染 ---
async function determineSemester(date) {
    const dateStr = formatDate(date);
    const semesters = await db.semesters.toArray();
    const found = semesters.find(s => dateStr >= s.startDate && dateStr <= s.endDate);
    return found || null;
}

async function renderCalendar() {
    const grid = document.getElementById('calendar');
    grid.innerHTML = '<div class="col-12 text-center py-5">載入資料中...</div>';

    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay()); // 週日
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); // 週六
    
    // UI 更新
    document.getElementById('currentWeekRange').innerText = `${formatDate(startOfWeek)} ~ ${formatDate(endOfWeek)}`;
    
    // *** 這裡呼叫修復後的 renderSidebar ***
    renderSidebar(currentDate);

    // 1. 判斷學期 (檢查週三)
    let checkDate = new Date(startOfWeek); checkDate.setDate(checkDate.getDate()+3);
    currentSemester = await determineSemester(checkDate);

    const semLabel = document.getElementById('currentSemesterLabel');
    const alertBox = document.getElementById('semesterAlert');
    
    if(currentSemester) {
        semLabel.innerText = currentSemester.name;
        alertBox.style.display = 'none';
    } else {
        semLabel.innerText = "無學期設定";
        alertBox.style.display = 'block';
    }

    // 2. 準備 Grid HTML
    grid.innerHTML = '';
    const weekDays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
    let headerHtml = `<div class="header-cell">節次</div>`;
    for(let i=0; i<7; i++) {
        let d = new Date(startOfWeek); d.setDate(d.getDate() + i);
        let isWeekend = (i===0 || i===6) ? 'weekend' : '';
        headerHtml += `<div class="header-cell ${isWeekend}">${weekDays[i]}<br><small class="fw-normal">${d.getMonth()+1}/${d.getDate()}</small></div>`;
    }
    grid.innerHTML += headerHtml;

    // 3. 讀取此週紀錄
    const startStr = formatDate(startOfWeek);
    const endStr = formatDate(endOfWeek);
    const records = await db.records.where('date').between(startStr, endStr, true, true).toArray();
    let recordMap = {};
    records.forEach(r => recordMap[`${r.date}-${r.period}`] = r);

    // 4. 繪製格子
    for (let p = 1; p <= 12; p++) {
        grid.innerHTML += `<div class="header-cell d-flex align-items-center justify-content-center bg-light">${p}</div>`;
        
        for (let col = 0; col < 7; col++) {
            let cellDate = new Date(startOfWeek); cellDate.setDate(cellDate.getDate() + col);
            let dateStr = formatDate(cellDate);
            let dayOfWeek = cellDate.getDay(); 

            let record = recordMap[`${dateStr}-${p}`];
            let baseInfo = null;

            if (currentSemester && currentSemester.baseSchedule && dayOfWeek >= 1 && dayOfWeek <= 5) {
                baseInfo = currentSemester.baseSchedule[`${dayOfWeek}-${p}`];
            }

            let displayType = "", displayClass = "", displayNote = "", isPreview = false;
            let colorCode = "#6c757d"; 

            if (record) {
                displayType = record.type;
                displayClass = record.className || "";
                displayNote = record.note || "";
                let typeConfig = courseTypes.find(t => t.name === displayType);
                if(typeConfig) colorCode = typeConfig.color;
            } else if (baseInfo && baseInfo.type) {
                displayType = baseInfo.type;
                displayClass = baseInfo.className || "";
                isPreview = true;
                let typeConfig = courseTypes.find(t => t.name === displayType);
                if(typeConfig) colorCode = typeConfig.color;
            }

            let cellContent = "";
            if (displayType) {
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
            
            grid.innerHTML += `
                <div class="period-cell" onclick="openEditModal('${dateStr}', ${p}, '${safe(displayType)}', '${safe(displayClass)}', '${safe(displayNote)}', ${!!record}, '${baseTypeSafe}')">
                    ${cellContent}
                </div>`;
        }
    }
}

// --- 側邊欄導覽功能 (已修復) ---
function jumpToSpecificDate(dateStr) {
    currentDate = new Date(dateStr);
    renderCalendar();
}

function renderSidebar(centerDate) {
    const list = document.getElementById('sidebarList');
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

function getWeekNumber(d) {
    var date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    var week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

// --- Modal 操作與其他邏輯 ---
const editModal = new bootstrap.Modal(document.getElementById('editModal'));

function openEditModal(date, period, currentType, currentClass, currentNote, hasRecord, baseType) {
    document.getElementById('modalDate').value = date;
    document.getElementById('modalPeriod').value = period;
    document.getElementById('modalBaseInfo').innerText = baseType || "空堂";
    
    const select = document.getElementById('modalType');
    select.innerHTML = '';
    courseTypes.forEach(t => {
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

async function saveRecord() {
    const date = document.getElementById('modalDate').value;
    const period = parseInt(document.getElementById('modalPeriod').value);
    const type = document.getElementById('modalType').value;
    const className = document.getElementById('modalClass').value;
    const note = document.getElementById('modalNote').value;

    const existing = await db.records.where('[date+period]').equals([date, period]).first();
    const data = {
        date: date, period: period, type: type, className: className, note: note,
        semesterId: currentSemester ? currentSemester.id : null
    };

    if (existing) await db.records.update(existing.id, data);
    else await db.records.add(data);

    editModal.hide();
    renderCalendar();
}

async function deleteRecord() {
    const date = document.getElementById('modalDate').value;
    const period = parseInt(document.getElementById('modalPeriod').value);
    await db.records.where('[date+period]').equals([date, period]).delete();
    editModal.hide();
    renderCalendar();
}

// --- 學期設定邏輯 ---
const semModal = new bootstrap.Modal(document.getElementById('semesterModal')); // 需確保 HTML 有此 ID
function openSemesterModal() {
    loadSemesterList();
    document.getElementById('baseScheduleEditor').style.display = 'none';
    semModal.show();
}

async function loadSemesterList() {
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

async function saveSemester() {
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

async function editBaseSchedule(semId) {
    currentEditingSemId = semId;
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

async function updateBaseCell(semId, day, period, field, value) {
    const sem = await db.semesters.get(semId);
    const key = `${day}-${period}`;
    if (!sem.baseSchedule[key]) sem.baseSchedule[key] = {};
    sem.baseSchedule[key][field] = value;
    if (field === 'type' && value === '') delete sem.baseSchedule[key];
    await db.semesters.update(semId, { baseSchedule: sem.baseSchedule });
    if(currentSemester && currentSemester.id === semId) renderCalendar();
}

// --- 課程類別設定 ---
const settingsModal = new bootstrap.Modal(document.getElementById('settingsModal')); // 需確保 HTML 有此 ID
function openSettingsModal() { renderSettingsTable(); settingsModal.show(); }

function renderSettingsTable() {
    const tbody = document.getElementById('courseTypesBody');
    tbody.innerHTML = '';
    courseTypes.forEach((t, idx) => {
        tbody.innerHTML += `
            <tr>
                <td><input type="text" class="form-control form-control-sm" value="${t.name}" onchange="updateType(${idx}, 'name', this.value)"></td>
                <td><input type="number" class="form-control form-control-sm" value="${t.rate}" onchange="updateType(${idx}, 'rate', this.value)"></td>
                <td><input type="color" class="form-control form-control-sm form-control-color" value="${t.color}" onchange="updateType(${idx}, 'color', this.value)"></td>
                <td><button class="btn btn-sm btn-outline-danger" onclick="removeType(${idx})"><i class="bi bi-trash"></i></button></td>
            </tr>`;
    });
}
async function addCourseType() {
    const name = document.getElementById('newTypeName').value;
    const rate = document.getElementById('newTypeRate').value;
    const color = document.getElementById('newTypeColor').value;
    if(!name) return;
    courseTypes.push({ name, rate: parseInt(rate)||0, color });
    await db.settings.put({ key: 'courseTypes', value: courseTypes });
    document.getElementById('newTypeName').value = '';
    renderSettingsTable(); renderCalendar();
}
async function updateType(index, field, value) {
    courseTypes[index][field] = (field === 'rate') ? parseInt(value) : value;
    await db.settings.put({ key: 'courseTypes', value: courseTypes });
    renderCalendar();
}
async function removeType(index) {
    if(confirm('確定刪除此類別？')) {
        courseTypes.splice(index, 1);
        await db.settings.put({ key: 'courseTypes', value: courseTypes });
        renderSettingsTable(); renderCalendar();
    }
}

// --- 統計報表 ---
const statsModal = new bootstrap.Modal(document.getElementById('statsModal')); // 需確保 HTML 有此 ID
function openStatsModal() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById('statsStart').value = formatDate(firstDay);
    document.getElementById('statsEnd').value = formatDate(today);
    statsModal.show();
}

async function calculateStats() {
    const startStr = document.getElementById('statsStart').value;
    const endStr = document.getElementById('statsEnd').value;
    const quota = parseInt(document.getElementById('weeklyQuota').value) || 16;
    
    const records = await db.records.where('date').between(startStr, endStr, true, true).toArray();
    
    let totalCounts = {};
    courseTypes.forEach(t => totalCounts[t.name] = 0);
    
    let currentDateIter = new Date(startStr);
    const endDateIter = new Date(endStr);
    let weeklyCounts = {};
    let recordMap = {};
    records.forEach(r => recordMap[`${r.date}-${r.period}`] = r);
    const allSems = await db.semesters.toArray();

    while(currentDateIter <= endDateIter) {
        let dStr = formatDate(currentDateIter);
        let day = currentDateIter.getDay();
        let weekKey = getWeekKey(currentDateIter);
        if(!weeklyCounts[weekKey]) weeklyCounts[weekKey] = 0;

        let sem = allSems.find(s => dStr >= s.startDate && dStr <= s.endDate);

        for(let p=1; p<=12; p++) {
            let type = null;
            if (recordMap[`${dStr}-${p}`]) type = recordMap[`${dStr}-${p}`].type;
            else if (sem && sem.baseSchedule && sem.baseSchedule[`${day}-${p}`]) type = sem.baseSchedule[`${day}-${p}`].type;

            if (type) {
                if(!totalCounts[type]) totalCounts[type] = 0;
                totalCounts[type]++;
                if (!type.includes('代課') && !type.includes('晚自習') && !type.includes('請假')) {
                    weeklyCounts[weekKey]++;
                }
            }
        }
        currentDateIter.setDate(currentDateIter.getDate() + 1);
    }

    let overtimeTotal = 0;
    for(let wk in weeklyCounts) {
        if (weeklyCounts[wk] > quota) overtimeTotal += (weeklyCounts[wk] - quota);
    }

    const tbody = document.getElementById('statsBody');
    tbody.innerHTML = '';
    let moneyTotal = 0;

    courseTypes.forEach(t => {
        let count = totalCounts[t.name] || 0;
        if (count > 0) {
            let sub = count * t.rate;
            moneyTotal += sub;
            tbody.innerHTML += `<tr><td>${t.name}</td><td>${count}</td><td>${t.rate}</td><td>${sub}</td></tr>`;
        }
    });

    if (overtimeTotal > 0) {
        let overRate = 420; 
        tbody.innerHTML += `<tr class="table-warning fw-bold"><td>[系統試算] 超出基本節數</td><td>${overtimeTotal}</td><td>${overRate}</td><td>(僅供參考)</td></tr>`;
    }
    document.getElementById('statsTotal').innerText = `$${moneyTotal}`;
}

function exportStatsExcel() {
    const table = document.querySelector("#statsModal table");
    const wb = XLSX.utils.table_to_book(table);
    XLSX.writeFile(wb, "薪資統計.xlsx");
}

// --- 備份與還原 ---
const backupModal = new bootstrap.Modal(document.getElementById('backupModal')); // 需確保 HTML 有此 ID
function openBackupModal() { backupModal.show(); }

async function exportBackup() {
    const data = { semesters: await db.semesters.toArray(), records: await db.records.toArray(), settings: await db.settings.toArray() };
    const blob = new Blob([JSON.stringify(data)], {type: "application/json;charset=utf-8"});
    saveAs(blob, `TeacherSalary_Backup_${formatDate(new Date())}.json`);
}

async function importBackup() {
    const fileInput = document.getElementById('importFile');
    if(!fileInput.files.length) return;
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            await db.transaction('rw', db.semesters, db.records, db.settings, async () => {
                await db.semesters.clear(); await db.records.clear(); await db.settings.clear();
                if(data.semesters) await db.semesters.bulkAdd(data.semesters);
                if(data.records) await db.records.bulkAdd(data.records);
                if(data.settings) await db.settings.bulkAdd(data.settings);
            });
            alert('還原成功！'); location.reload();
        } catch(err) { alert('檔案格式錯誤'); }
    };
    reader.readAsText(file);
}

// --- 輔助函式 ---
function jumpToToday() { currentDate = new Date(); renderCalendar(); }
function changeWeek(d) { currentDate.setDate(currentDate.getDate() + d); renderCalendar(); }
function formatDate(d) { return d.toISOString().split('T')[0]; }
function getWeekKey(d) {
    let target = new Date(d);
    target.setDate(target.getDate() - target.getDay());
    return formatDate(target);
}