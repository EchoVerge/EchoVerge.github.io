import { db } from './db.js';
import { state } from './state.js';
// 引入新的 redeemCode
import { redeemCode } from './cloud.js'; 

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
    renderAboutTab();
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

// --- 贊助與權限相關 ---

// [修改] 檢查狀態 (直接回傳 state.isPro)
export function checkProStatus() {
    return state.isPro;
}

// [修改] 按下啟用按鈕的動作
export async function activatePro() {
    const inputKey = document.getElementById('activationKeyInput').value.trim();
    if (inputKey) {
        // 呼叫 cloud.js 的啟用函式
        const success = await redeemCode(inputKey);
        if (success) {
            renderAboutTab(); // 成功後重繪 UI
        }
    } else {
        alert("請輸入序號");
    }
}

// [修改] 渲染關於頁面
function renderAboutTab() {
    const container = document.getElementById('about-content');
    if (!container) return;

    // 讀取本地快取的期限，用來顯示
    const expiryStr = localStorage.getItem('site_pro_expiry');
    const expiryDisplay = expiryStr ? new Date(expiryStr).toLocaleDateString() : '未知';
    const isPro = state.isPro;

    const sponsorLink = "https://www.buymeacoffee.com/echovergepe"; 

    container.innerHTML = `
        <div class="text-center py-3">
            <img src="./assets/img/icon-192.png" style="width: 80px; border-radius: 20px;" class="mb-3 shadow-sm">
            <h5>教師課務薪資系統</h5>
            
            <hr>

            <div class="card mb-3 ${isPro ? 'border-success' : 'border-warning'}">
                <div class="card-body">
                    <h6 class="card-title fw-bold">
                        ${isPro ? '<i class="bi bi-check-circle-fill text-success"></i> 專業版已啟用' : '<i class="bi bi-lock-fill text-warning"></i> 免費版模式'}
                    </h6>
                    
                    ${isPro ? `
                        <p class="text-success small mt-2">
                            狀態：授權有效<br>
                            效期至：${expiryDisplay}<br>
                            已綁定序號：${localStorage.getItem('site_pro_key')}
                        </p>
                    ` : `
                        <p class="card-text small text-start mt-2">
                            雲端同步與備份為贊助功能。請輸入序號進行綁定。
                        </p>
                         <a href="${sponsorLink}" target="_blank" class="btn btn-warning w-100 fw-bold mb-2">
                            <i class="bi bi-heart-fill"></i> 贊助並獲取序號
                        </a>
                    `}
                    
                    ${!isPro ? `
                    <div class="input-group mt-3">
                        <input type="text" class="form-control" id="activationKeyInput" placeholder="輸入序號 (例如: VIP-2025-001)">
                        <button class="btn btn-outline-secondary" onclick="activatePro()">綁定</button>
                    </div>
                    ` : ''}
                </div>
            </div>
            <div class="text-start small text-muted">
                <strong>說明：</strong><br>
                序號一經綁定即與 Google 帳號連結。更換裝置時，只需登入同一 Google 帳號即可自動恢復權限，無需重新輸入。
            </div>
        </div>
    `;
}