/**
 * assets/js/main.js
 * V9.0 完整版：整合 Google AI 深度解析、智慧文字匯入與雙模式
 */

import { parseFile } from './modules/fileHandler.js';
import { parseQuestionMixed, parseErrorText } from './modules/textParser.js';
import { fetchAvailableModels, parseWithGemini } from './modules/aiParser.js'; // AI 模組
import { createStudentSection, createTeacherKeySection, refreshMathJax } from './modules/viewRenderer.js';
import { initColumnManager, getColumnConfig } from './modules/columnManager.js';

// --- 資料狀態 ---
let state = {
    students: null,   // 學生資料
    questions: null,  // 題庫資料
    mode: 'quiz',     // 'quiz' or 'error'
    // AI 狀態
    ai: {
        key: '',
        model: '',
        available: false
    },
    // 暫存 AI 解析結果 (用於使用者預覽確認)
    tempAiParsed: null 
};

// --- DOM 元素快取 ---
const el = {
    // 模式切換與面板
    tabs: document.querySelectorAll('.mode-tab'),
    panelQuiz: document.getElementById('panel-quiz'),
    panelError: document.getElementById('panel-error'),
    
    // 狀態顯示
    qStatus: document.getElementById('q-status'),
    sStatus: document.getElementById('s-status'),

    // 主要操作按鈕
    btnGenerate: document.getElementById('btn-generate'),
    btnPrint: document.getElementById('btn-print'),
    
    // 輸入欄位
    inputTitle: document.getElementById('input-title'),
    inputRange: document.getElementById('input-range'), 
    
    // 智慧貼上相關 (題目匯入 Modal)
    txtRawQ: document.getElementById('txt-raw-q'),
    txtRawA: document.getElementById('txt-raw-a'),
    previewQ: document.getElementById('preview-parsed-q'),
    previewCount: document.getElementById('preview-count'),
    
    // 錯題速記相關 (Modal)
    txtRawS: document.getElementById('txt-raw-s'),

    // AI 相關
    btnAiSettings: document.getElementById('btn-ai-settings'),
    btnAiParse: document.getElementById('btn-ai-parse'),
    inputApiKey: document.getElementById('input-api-key'),
    btnCheckModels: document.getElementById('btn-check-models'),
    selectModel: document.getElementById('select-model'),
    modelSelectArea: document.getElementById('model-select-area'),
    btnSaveAi: document.getElementById('btn-save-ai'),
    aiModelBadge: document.getElementById('ai-model-badge'),
    currentModelName: document.getElementById('current-model-name'),
    
    // 進階選項
    chkRandomize: document.getElementById('chk-randomize'),
    chkPageBreak: document.getElementById('chk-page-break'),
    chkTeacherKey: document.getElementById('chk-teacher-key')
};

// --- 初始化 ---
initColumnManager();
setupEventListeners();
setupModals();
loadAiSettings(); // 載入儲存的 API Key

// --- 事件監聽 ---
function setupEventListeners() {
    // 1. 模式切換
    el.tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            el.tabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            
            state.mode = e.target.dataset.mode;
            el.panelQuiz.style.display = state.mode === 'quiz' ? 'block' : 'none';
            el.panelError.style.display = state.mode === 'error' ? 'block' : 'none';
            
            updateReadyState();
        });
    });

    // 2. 檔案上傳
    document.getElementById('file-questions').addEventListener('change', async (e) => {
        try {
            const data = await parseFile(e.target.files[0]);
            state.questions = data;
            updateStatus('q', `已載入檔案：${data.length} 題`, true);
        } catch(err) { alert(err.message); }
    });

    document.getElementById('file-students').addEventListener('change', async (e) => {
        try {
            const data = await parseFile(e.target.files[0]);
            state.students = data;
            updateStatus('s', `已載入檔案：${data.length} 位學生`, true);
        } catch(err) { alert(err.message); }
    });

    // 3. 生成與列印
    el.btnGenerate.addEventListener('click', runGeneration);
    el.btnPrint.addEventListener('click', () => window.print());
}

// --- Modal 相關邏輯 ---
function setupModals() {
    // 開啟按鈕
    document.getElementById('btn-paste-questions').addEventListener('click', () => openModal('modal-paste-q'));
    document.getElementById('btn-paste-errors').addEventListener('click', () => openModal('modal-paste-s'));
    document.getElementById('btn-open-settings').addEventListener('click', () => openModal('settings-modal'));
    el.btnAiSettings.addEventListener('click', () => openModal('modal-ai-settings'));

    // 關閉按鈕
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => closeModal(e.target.dataset.target));
    });

    // === AI 設定邏輯 ===
    // 驗證 Key
    el.btnCheckModels.addEventListener('click', async () => {
        const key = el.inputApiKey.value.trim();
        if(!key) return alert("請輸入 API Key");
        
        el.btnCheckModels.textContent = "⏳ 連線中...";
        try {
            const models = await fetchAvailableModels(key);
            el.selectModel.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
            el.modelSelectArea.style.display = 'block';
            el.btnCheckModels.textContent = "✅ 驗證成功";
        } catch(err) {
            alert("驗證失敗: " + err.message);
            el.btnCheckModels.textContent = "🔄 驗證並偵測模型";
        }
    });

    // 儲存 AI 設定
    el.btnSaveAi.addEventListener('click', () => {
        const key = el.inputApiKey.value.trim();
        const model = el.selectModel.value;
        if(key && model) {
            state.ai.key = key;
            state.ai.model = model;
            state.ai.available = true;
            localStorage.setItem('gemini_api_key', key);
            localStorage.setItem('gemini_model', model);
            updateAiUI();
            closeModal('modal-ai-settings');
            alert("AI 設定已儲存！");
        } else {
            alert("請先驗證並選擇模型");
        }
    });

    // === 題目匯入與 AI 分析邏輯 ===
    
    // 即時預覽 (Regex)
    const updateQPreview = () => {
        // 如果使用者剛剛用過 AI，但現在又手動改了文字，我們暫時清空 AI 緩存，改回 Regex 預覽
        // 除非使用者是完全清空重貼，這裡我們簡單處理：每次打字都切回 Regex 預覽
        state.tempAiParsed = null; 
        const qVal = el.txtRawQ.value;
        const aVal = el.txtRawA.value;
        const parsed = parseQuestionMixed(qVal, aVal);
        renderQPreview(parsed, 'Regex');
    };
    el.txtRawQ.addEventListener('input', updateQPreview);
    el.txtRawA.addEventListener('input', updateQPreview);

    // ✨ AI 深度分析按鈕
    el.btnAiParse.addEventListener('click', async () => {
        if (!state.ai.available) return alert("請先點擊右上角設定 API Key");

        const rawText = el.txtRawQ.value + "\n" + el.txtRawA.value;
        if (rawText.trim().length < 5) return alert("請先貼上題目內容");

        // UI 鎖定
        el.btnAiParse.disabled = true;
        el.btnAiParse.textContent = "🧠 AI 分析中...";
        el.previewQ.innerHTML = '<div style="text-align:center; padding:20px; color:#2196F3;">🤖 AI 正在閱讀題目並進行結構化拆解...<br>這可能需要幾秒鐘</div>';

        try {
            // 呼叫 AI 解析
            const parsed = await parseWithGemini(state.ai.key, state.ai.model, rawText);
            
            // 暫存結果
            state.tempAiParsed = parsed;
            renderQPreview(parsed, 'AI'); // 渲染並標記為 AI 來源
            
        } catch(err) {
            alert("AI 分析失敗: " + err.message);
            updateQPreview(); // 失敗則切回 Regex 預覽
        } finally {
            el.btnAiParse.disabled = false;
            el.btnAiParse.textContent = "✨ AI 深度分析";
        }
    });

    // 確認匯入題目
    document.getElementById('btn-confirm-q').addEventListener('click', () => {
        let parsed = [];
        let source = 'Regex';

        // 優先使用 AI 暫存結果
        if (state.tempAiParsed && state.tempAiParsed.length > 0) {
            parsed = state.tempAiParsed;
            source = 'AI';
            state.tempAiParsed = null; // 清空
        } else {
            // 否則使用 Regex
            parsed = parseQuestionMixed(el.txtRawQ.value, el.txtRawA.value);
        }

        if (parsed.length > 0) {
            state.questions = parsed;
            updateStatus('q', `已匯入：${parsed.length} 題 (來源: ${source})`, true);
            closeModal('modal-paste-q');
        } else {
            alert("未偵測到有效題目，請確認格式或嘗試使用 AI 分析。");
        }
    });

    // 確認匯入錯題速記
    document.getElementById('btn-confirm-s').addEventListener('click', () => {
        const parsed = parseErrorText(el.txtRawS.value);
        if (parsed.length > 0) {
            state.students = parsed;
            updateStatus('s', `已匯入速記：${parsed.length} 位學生`, true);
            closeModal('modal-paste-s');
        } else {
            alert("格式錯誤，請使用 '座號: 題號' 格式");
        }
    });
}

// --- 輔助函式 ---

function loadAiSettings() {
    const key = localStorage.getItem('gemini_api_key');
    const model = localStorage.getItem('gemini_model');
    if (key && model) {
        state.ai.key = key;
        state.ai.model = model;
        state.ai.available = true;
        el.inputApiKey.value = key;
        updateAiUI();
    }
}

function updateAiUI() {
    if (state.ai.available) {
        el.aiModelBadge.style.display = 'inline';
        el.currentModelName.textContent = state.ai.model;
    }
}

function renderQPreview(questions, source) {
    if(el.previewCount) el.previewCount.textContent = questions.length;
    
    // 顯示來源標記
    const sourceBadge = source === 'AI' 
        ? `<span style="background:#e0f2f1; color:#00695c; padding:4px 8px; border-radius:4px; font-size:0.8em; margin-bottom:10px; display:inline-block; border:1px solid #b2dfdb;">✨ AI 分析結果</span>`
        : `<span style="background:#f5f5f5; color:#666; padding:4px 8px; border-radius:4px; font-size:0.8em; margin-bottom:10px; display:inline-block;">Regex 快速分析</span>`;

    if (questions.length === 0) {
        el.previewQ.innerHTML = '<div style="color:#999; text-align:center; margin-top:20px;">等待輸入...</div>';
        return;
    }
    
    const listHtml = questions.map(q => {
        const hasExpl = q.expl && q.expl.trim().length > 0;
        const statusBadge = hasExpl 
            ? `<span style="background:#e8f5e9; color:#2e7d32; padding:2px 6px; border-radius:4px; font-size:12px;">✅ 含解析</span>`
            : `<span style="background:#f5f5f5; color:#999; padding:2px 6px; border-radius:4px; font-size:12px;">⚠️ 無解析</span>`;

        return `
        <div class="parsed-item" style="border-left: 3px solid ${hasExpl ? '#4CAF50' : '#ccc'}; padding:8px; margin-bottom:5px; background:white; border-radius:4px; border:1px solid #eee;">
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span class="parsed-id" style="color:#2196F3; font-weight:bold;">#${q.id}</span>
                ${statusBadge}
            </div>
            <div style="font-size:0.9em; color:#333; white-space:pre-wrap; overflow:hidden;">${q.text.substring(0, 60)}...</div>
            ${hasExpl ? `<div style="font-size:0.8em; color:#666; margin-top:4px; padding-top:4px; border-top:1px dashed #eee;">↳ ${q.expl.substring(0, 30)}...</div>` : ''}
        </div>
        `;
    }).join('');

    el.previewQ.innerHTML = `<div style="text-align:center;">${sourceBadge}</div>` + listHtml;
}

function updateStatus(type, msg, isOk) {
    const label = type === 'q' ? el.qStatus : el.sStatus;
    label.textContent = msg;
    label.className = isOk ? 'status-text ok' : 'status-text';
    if(isOk) label.style.color = '#4CAF50';
    updateReadyState();
}

function updateReadyState() {
    let ready = false;
    if (state.questions && state.questions.length > 0) {
        if (state.mode === 'quiz') ready = true;
        else if (state.students && state.students.length > 0) ready = true;
    }
    el.btnGenerate.disabled = !ready;
}

function runGeneration() {
    const qMap = buildQuestionMap(state.questions);
    const config = {
        title: el.inputTitle.value || "測驗卷",
        columns: getColumnConfig(),
        pageBreak: el.chkPageBreak.checked
    };
    
    const output = document.getElementById('output-area');
    output.innerHTML = '';
    let dataToPrint = [];

    // 分流處理
    if (state.mode === 'quiz') {
        // === 模式 A: 自由出題 ===
        let targetIds = [];
        const rangeStr = el.inputRange.value.trim();
        
        if (rangeStr) {
            targetIds = parseRangeString(rangeStr);
        } else {
            targetIds = state.questions.map(q => q.id); // 全選
        }

        if (el.chkRandomize.checked) {
            targetIds.sort(() => Math.random() - 0.5);
        }
        
        const qList = targetIds.map(id => qMap[id]).filter(q => q);
        if (qList.length > 0) {
            dataToPrint.push({ student: { '座號': '__________', '姓名': '' }, qList: qList });
        } else {
            alert("找不到對應題號，請檢查範圍");
            return;
        }
    } else {
        // === 模式 B: 錯題訂正 ===
        state.students.forEach(student => {
            const ids = extractQuestionIds(student);
            const qList = ids.map(id => qMap[id]).filter(q => q);
            if (el.chkRandomize.checked) qList.sort(() => Math.random() - 0.5);
            if (qList.length > 0) dataToPrint.push({ student, qList });
        });
    }

    if (dataToPrint.length === 0) {
        output.innerHTML = '<div style="text-align:center; padding:50px;">沒有資料可生成</div>';
        return;
    }

    // 渲染
    dataToPrint.forEach(item => {
        output.innerHTML += createStudentSection(item.student, item.qList, config);
    });

    // 解答卷
    if (el.chkTeacherKey.checked) {
        const allUsedQ = new Set();
        dataToPrint.forEach(d => d.qList.forEach(q => allUsedQ.add(q)));
        if (allUsedQ.size > 0) output.innerHTML += createTeacherKeySection(Array.from(allUsedQ));
    }

    el.btnPrint.style.display = 'inline-block';
    refreshMathJax();
}

// --- 基礎工具 ---
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function buildQuestionMap(data) {
    const map = {};
    data.forEach(q => {
        const id = String(q.id || q['題號'] || '').trim();
        if(id) {
            map[id] = {
                id: id,
                text: q.text || q['題目'] || '',
                expl: q.expl || q['解析'] || ''
            };
        }
    });
    return map;
}

function parseRangeString(str) {
    const result = new Set();
    const parts = str.split(/[,，、\s]+/);
    parts.forEach(part => {
        if (part.includes('-')) {
            const [s, e] = part.split('-').map(Number);
            if (!isNaN(s) && !isNaN(e)) for(let i=s; i<=e; i++) result.add(String(i));
        } else if(part) result.add(part.trim());
    });
    return Array.from(result);
}

function extractQuestionIds(student) {
    if (student['錯題列表']) return parseRangeString(String(student['錯題列表']));
    let ids = [];
    Object.keys(student).forEach(k => {
        const key = k.toLowerCase();
        if((key.includes('question') || key.includes('題')) && !key.includes('列表')) {
            if(student[k]) ids.push(String(student[k]).trim());
        }
    });
    const listCol = student['list'] || student['errors'];
    if (listCol) ids = ids.concat(parseRangeString(String(listCol)));
    return [...new Set(ids)];
}