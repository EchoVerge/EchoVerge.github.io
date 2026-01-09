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

// 渲染關於頁面
function renderAboutTab() {
    const container = document.getElementById('about-content');
    if (!container) return;

    // 讀取本地快取的期限
    const expiryStr = localStorage.getItem('site_pro_expiry');
    const expiryDisplay = expiryStr ? new Date(expiryStr).toLocaleDateString() : '未知';
    const isPro = state.isPro;

    const sponsorLink = "https://ko-fi.com/s/36a556be22"; 

container.innerHTML = `
        <div class="text-center py-3">
            <img src="./assets/img/icon-192.png" style="width: 80px; border-radius: 20px;" class="mb-3 shadow-sm">
            <h5>教師課務薪資系統</h5>
            
            <hr>

            <div class="card mb-3 ${isPro ? 'border-success' : 'border-primary'}">
                <div class="card-body">
                    <h6 class="card-title fw-bold">
                        ${isPro ? '<i class="bi bi-check-circle-fill text-success"></i> 專業版已啟用' : '<i class="bi bi-lock-fill text-primary"></i> 免費版模式'}
                    </h6>
                    
                    ${isPro ? `
                        <div class="alert alert-success bg-opacity-10 small mt-3 text-start">
                            <strong><i class="bi bi-shield-check"></i> 授權狀態良好</strong><br>
                            效期至：${expiryDisplay}<br>
                            已綁定序號：<span class="font-monospace">${localStorage.getItem('site_pro_key')}</span>
                        </div>
                        <p class="small text-muted mb-0">感謝您的支持，祝教學順心！</p>
                    ` : `
                        <div class="alert alert-warning small text-start mt-2 mb-3 border">
                            <strong><i class="bi bi-exclamation-circle-fill"></i> 購買前請注意：</strong>
                            <ol class="m-0 ps-3 mt-1" style="line-height: 1.6;">
                                <li>Ko-fi 平台需 <strong>註冊或登入</strong> 才能付款。</li>
                                <li>啟用序號將寄至您的 <strong>Ko-fi 帳號信箱</strong>。</li>
                                <li>請務必確認信箱正確，以免收不到序號。</li>
                            </ol>
                        </div>

                        <p class="card-text small text-muted mb-3">
                            購買 <strong>專業版授權 (一年期)</strong><br>
                            費用：<strong>$ 1 USD</strong> (約 NT$32 )
                        </p>
                        
                        <a href="${sponsorLink}" target="_blank" class="btn btn-danger w-100 fw-bold mb-2" style="background-color: #FF5E5B; border: none; box-shadow: 0 4px 6px rgba(255, 94, 91, 0.3);">
                            <i class="bi bi-cup-hot-fill"></i> 前往 Ko-fi 購買
                        </a>
                        
                        <div class="small text-muted mb-3" style="font-size: 0.75em;">
                            支援 信用卡 / PayPal 付款
                        </div>
                    `}
                    
                    ${!isPro ? `
                    <hr class="text-muted opacity-25">
                    <label class="form-label small text-muted text-start w-100">已有序號？請在此啟用：</label>
                    <div class="input-group">
                        <input type="text" class="form-control" id="activationKeyInput" placeholder="在此貼上收到的序號">
                        <button class="btn btn-outline-secondary" onclick="activatePro()">綁定</button>
                    </div>
                    ` : ''}
                </div>
            </div>
            
            <div class="text-start small text-muted mt-3 px-2">
                <strong><i class="bi bi-info-circle"></i> 綁定說明：</strong><br>
                序號綁定後即與目前的 Google 帳號連結。未來換手機或電腦時，只需登入同一個 Google 帳號，權限就會自動恢復。
            </div>
        </div>
    `;
}