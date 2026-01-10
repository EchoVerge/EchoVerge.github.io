// assets/js/modules/columnManager.js

const STORAGE_KEY = 'worksheet_generator_config';
const DEFAULT_COLUMNS = [
    { type: 'id', header: '題號', width: 10 },
    { type: 'text', header: '題目', width: 40 },
    { type: 'expl', header: '解析', width: 30 },
    { type: 'blank', header: '訂正/筆記', width: 20 }
];

const DATA_TYPES = {
    'id': '題號',
    'text': '題目內容',
    'expl': '解析/詳解',
    'blank': '空白欄 (作答用)'
};

let currentColumns = [];
let modalEl = null;

// 初始化
export function initColumnManager() {
    modalEl = document.getElementById('settings-modal');
    
    // 1. 嘗試讀取舊設定
    loadFromStorage();

    // 2. 綁定按鈕
    document.getElementById('btn-open-settings').addEventListener('click', openModal);
    document.querySelector('.close-modal').addEventListener('click', closeModal);
    document.getElementById('btn-save-settings').addEventListener('click', () => {
        saveToStorage(); // 儲存
        closeModal();
    });
    window.addEventListener('click', (e) => { if(e.target === modalEl) closeModal(); });

    document.getElementById('btn-add-col-modal').addEventListener('click', () => {
        currentColumns.push({ type: 'blank', header: '新欄位', width: 20 });
        renderSettingsList();
        updatePreview();
    });

    document.getElementById('btn-reset-col-modal').addEventListener('click', () => {
        if(confirm("確定要重置回預設值嗎？")) {
            currentColumns = JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
            renderSettingsList();
            updatePreview();
        }
    });
}

function loadFromStorage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            currentColumns = JSON.parse(saved);
        } catch(e) {
            console.error("讀取設定失敗，使用預設值");
            currentColumns = JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
        }
    } else {
        currentColumns = JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
    }
}

function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentColumns));
    // 可以在這裡加一個小提示
    // alert("設定已儲存！");
}

export function getColumnConfig() {
    return currentColumns;
}

function openModal() {
    renderSettingsList();
    updatePreview();
    modalEl.style.display = 'flex';
}

function closeModal() {
    modalEl.style.display = 'none';
}

function renderSettingsList() {
    const list = document.getElementById('modal-column-list');
    list.innerHTML = '';

    currentColumns.forEach((col, index) => {
        const row = document.createElement('div');
        row.className = 'col-setting-row';

        let options = '';
        for (const [key, label] of Object.entries(DATA_TYPES)) {
            options += `<option value="${key}" ${col.type === key ? 'selected' : ''}>${label}</option>`;
        }

        row.innerHTML = `
            <span>${index + 1}.</span>
            <input type="text" class="input-header" value="${col.header}" placeholder="標題" style="width:80px">
            <select class="input-type">${options}</select>
            <input type="number" class="input-width" value="${col.width}" placeholder="%"> %
            <button class="btn-del btn-red" data-index="${index}" style="padding:2px 6px;">×</button>
        `;

        list.appendChild(row);

        const inputs = row.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.addEventListener('input', (e) => {
                if (e.target.classList.contains('input-header')) col.header = e.target.value;
                if (e.target.classList.contains('input-type')) col.type = e.target.value;
                if (e.target.classList.contains('input-width')) col.width = Number(e.target.value);
                updatePreview();
            });
        });

        row.querySelector('.btn-del').addEventListener('click', (e) => {
            currentColumns.splice(index, 1);
            renderSettingsList();
            updatePreview();
        });
    });
}

function updatePreview() {
    const previewArea = document.getElementById('modal-preview-area');
    const dummyData = { id: "1", text: "範例題目...", expl: "範例解析...", blank: "" };

    let theadHtml = '<tr>';
    currentColumns.forEach(col => theadHtml += `<th style="width:${col.width}%;">${col.header}</th>`);
    theadHtml += '</tr>';

    let tbodyHtml = '';
    tbodyHtml += '<tr>';
    currentColumns.forEach(col => {
        let content = dummyData[col.type] || "";
        let style = col.type === 'blank' ? 'height:40px;' : '';
        tbodyHtml += `<td style="width:${col.width}%; ${style}">${content}</td>`;
    });
    tbodyHtml += '</tr>';

    previewArea.innerHTML = `
        <div style="text-align:center; padding:10px;"><h3>預覽</h3></div>
        <table class="preview-table"><thead>${theadHtml}</thead><tbody>${tbodyHtml}</tbody></table>
    `;
}