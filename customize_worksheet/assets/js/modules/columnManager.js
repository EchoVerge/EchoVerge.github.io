/**
 * assets/js/modules/columnManager.js
 * 欄位管理模組：負責產生設定介面與讀取欄位設定
 */

// 預設欄位設定
const DEFAULT_COLUMNS = [
    { type: 'id', header: '題號', width: 10 },
    { type: 'text', header: '題目', width: 40 },
    { type: 'expl', header: '解析', width: 30 },
    { type: 'blank', header: '訂正/筆記', width: 20 }
];

// 定義可選的資料來源
const DATA_TYPES = {
    'id': '題號',
    'text': '題目內容',
    'expl': '解析/詳解',
    'blank': '空白欄 (作答用)'
};

let currentColumns = [...DEFAULT_COLUMNS];

/**
 * 初始化欄位設定區域
 * @param {HTMLElement} container - 容器 DOM
 */
export function initColumnManager(container) {
    renderUI(container);
}

/**
 * 取得當前的使用者設定
 * @returns {Array} 欄位設定陣列
 */
export function getColumnConfig() {
    // 從 DOM 讀取最新數值 (防止使用者改了數值但沒按任何按鈕)
    const rows = document.querySelectorAll('.col-setting-row');
    const config = [];
    
    rows.forEach(row => {
        config.push({
            header: row.querySelector('.col-header').value,
            type: row.querySelector('.col-type').value,
            width: Number(row.querySelector('.col-width').value)
        });
    });

    return config;
}

/**
 * 內部渲染函式
 */
function renderUI(container) {
    container.innerHTML = `
        <div style="margin-bottom: 10px; font-weight:bold;">欄位設定 (總寬度建議 100%)</div>
        <div id="column-list"></div>
        <div style="margin-top: 10px;">
            <button id="btn-add-col" class="btn-small" style="background:#4CAF50; color:white;">+ 新增欄位</button>
            <button id="btn-reset-col" class="btn-small" style="background:#f44336; color:white;">重置預設</button>
        </div>
    `;

    const list = container.querySelector('#column-list');
    const btnAdd = container.querySelector('#btn-add-col');
    const btnReset = container.querySelector('#btn-reset-col');

    // 渲染列表
    function renderList() {
        list.innerHTML = '';
        currentColumns.forEach((col, index) => {
            const row = document.createElement('div');
            row.className = 'col-setting-row';
            row.style.display = 'flex';
            row.style.gap = '5px';
            row.style.marginBottom = '5px';
            row.style.alignItems = 'center';

            // 產生下拉選單選項
            let options = '';
            for (const [key, label] of Object.entries(DATA_TYPES)) {
                options += `<option value="${key}" ${col.type === key ? 'selected' : ''}>${label}</option>`;
            }

            row.innerHTML = `
                <input type="text" class="col-header" value="${col.header}" placeholder="標題" style="width: 80px;">
                <select class="col-type">${options}</select>
                <input type="number" class="col-width" value="${col.width}" placeholder="%" style="width: 50px;">
                <span>%</span>
                <button class="btn-del-col" data-index="${index}" style="background:#ddd; border:none; cursor:pointer; padding: 2px 8px;">×</button>
            `;
            list.appendChild(row);
        });

        // 綁定刪除按鈕
        list.querySelectorAll('.btn-del-col').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                currentColumns.splice(idx, 1);
                renderList();
            });
        });
    }

    // 綁定新增按鈕
    btnAdd.addEventListener('click', () => {
        currentColumns.push({ type: 'blank', header: '新欄位', width: 20 });
        renderList();
    });

    // 綁定重置按鈕
    btnReset.addEventListener('click', () => {
        // 深拷貝回預設值
        currentColumns = JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
        renderList();
    });

    renderList();
}