import { db } from './db.js';
import { state } from './state.js'; // 必須引入 state 以儲存權限狀態

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
    checkProStatus(); // 初始化時檢查權限
}

export function openSettingsModal() {
    renderSettingsTable();
    renderPeriodTimesTable();
    renderAboutTab(); // [新增] 渲染贊助頁面
    settingsModal.show();
}

// ... (原有 renderSettingsTable, addCourseType, updateType, removeType 保持不變) ...
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

export async function getPeriodTimes() {
    let setting = await db.settings.where('key').equals('periodTimes').first();
    return setting ? setting.value : defaultPeriodTimes;
}

// --- [新增] 贊助與權限相關 ---

export function checkProStatus() {
    // 這裡只是前端 UI 判斷，真正的驗證在 Firebase Rules
    const proKey = localStorage.getItem('site_pro_key');
    state.isPro = !!proKey; // 只要有 Key 就先視為啟用，讓使用者嘗試連線驗證
    return state.isPro;
}

export function activatePro() {
    const inputKey = document.getElementById('activationKeyInput').value.trim();
    if (inputKey) {
        localStorage.setItem('site_pro_key', inputKey);
        state.isPro = true;
        alert("啟用碼已儲存！\n接下來請進行「雲端同步」，系統將連接伺服器驗證您的代碼。");
        renderAboutTab();
    }
}

function renderAboutTab() {
    const container = document.getElementById('about-content');
    if (!container) return;

    const isPro = checkProStatus();
    // 請替換成您的贊助連結
    const sponsorLink = "https://www.buymeacoffee.com/您的帳號"; 

    container.innerHTML = `
        <div class="text-center py-3">
            <img src="./assets/img/icon-192.png" style="width: 80px; border-radius: 20px;" class="mb-3 shadow-sm">
            <h5>教師課務薪資系統 <small class="text-muted">v1.1</small></h5>
            
            <hr>

            <div class="card mb-3 ${isPro ? 'border-success' : 'border-warning'}">
                <div class="card-body">
                    <h6 class="card-title fw-bold">
                        ${isPro ? '<i class="bi bi-check-circle-fill text-success"></i> 已輸入啟用碼' : '<i class="bi bi-lock-fill text-warning"></i> 免費版模式'}
                    </h6>
                    <p class="card-text small text-start mt-2">
                        ${isPro 
                            ? '您已設定啟用碼。請執行「雲端同步」以驗證權限並備份資料。' 
                            : '雲端同步與備份為贊助功能。啟用後可防止資料遺失並支援跨裝置使用。'}
                    </p>
                    
                    ${!isPro ? `
                        <a href="${sponsorLink}" target="_blank" class="btn btn-warning w-100 fw-bold mb-2">
                            <i class="bi bi-heart-fill"></i> 贊助並獲取啟用碼
                        </a>
                    ` : ''}
                    
                    <div class="input-group mt-3">
                        <input type="text" class="form-control" id="activationKeyInput" placeholder="輸入啟用碼" value="${localStorage.getItem('site_pro_key') || ''}">
                        <button class="btn btn-outline-secondary" onclick="activatePro()">儲存</button>
                    </div>
                </div>
            </div>
            <div class="text-start small text-muted">
                <strong>資安聲明：</strong><br>
                啟用碼將經由加密連線與伺服器驗證。唯有驗證通過的用戶可使用雲端空間。
            </div>
        </div>
    `;
}