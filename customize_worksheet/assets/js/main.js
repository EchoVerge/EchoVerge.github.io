/**
 * assets/js/main.js
 * V12 完整版：整合文檔解析、AI、Wizard 與所見即所得編輯器
 */

import { parseFile } from './modules/fileHandler.js'; // Excel/CSV
import { extractTextFromFile } from './modules/fileExtractor.js'; // V12: Word/PDF
import { parseQuestionMixed, parseErrorText } from './modules/textParser.js'; // Regex Parsing
import { fetchAvailableModels, parseWithGemini } from './modules/aiParser.js'; // AI Parsing
import { createStudentSection, createTeacherKeySection, refreshMathJax } from './modules/viewRenderer.js';
import { initColumnManager, getColumnConfig } from './modules/columnManager.js';
import { StepManager } from './modules/stepManager.js'; // Wizard Logic

// --- 資料狀態 ---
let state = {
    students: null,
    questions: null,
    mode: 'quiz', // 'quiz' | 'error'
    ai: { key: '', model: '', available: false },
    sourceType: 'text' // 'text' | 'file'
};

// --- DOM 元素快取 ---
const el = {
    // 編輯器
    txtRawQ: document.getElementById('txt-raw-q'),
    previewQ: document.getElementById('preview-parsed-q'),
    previewCount: document.getElementById('preview-count'),
    btnUploadFile: document.getElementById('btn-upload-file'),
    fileQuestions: document.getElementById('file-questions'),
    btnDemoData: document.getElementById('btn-demo-data'),
    btnAiParse: document.getElementById('btn-ai-parse'),
    btnClearQ: document.getElementById('btn-clear-q'),
    aiStatusBadge: document.getElementById('ai-status-badge'),
    
    // 錯題模式
    txtRawS: document.getElementById('txt-raw-s'),
    btnUploadStudent: document.getElementById('btn-upload-student'),
    fileStudents: document.getElementById('file-students'),
    sStatus: document.getElementById('s-status'),

    // 設定與輸出
    tabs: document.querySelectorAll('.mode-tab'),
    panelQuiz: document.getElementById('panel-quiz'),
    panelError: document.getElementById('panel-error'),
    inputRange: document.getElementById('input-range'),
    chkRandomize: document.getElementById('chk-randomize'),
    inputTitle: document.getElementById('input-title'),
    chkPageBreak: document.getElementById('chk-page-break'),
    chkTeacherKey: document.getElementById('chk-teacher-key'),
    
    btnGenerate: document.getElementById('btn-generate'),
    btnPrint: document.getElementById('btn-print'),
    outputArea: document.getElementById('output-area'),

    // AI 設定 Modal
    btnAiSettings: document.getElementById('btn-ai-settings'),
    modalAi: document.getElementById('modal-ai-settings'),
    inputApiKey: document.getElementById('input-api-key'),
    btnCheckModels: document.getElementById('btn-check-models'),
    selectModel: document.getElementById('select-model'),
    modelSelectArea: document.getElementById('model-select-area'),
    btnSaveAi: document.getElementById('btn-save-ai')
};

// --- 初始化 ---
initColumnManager();
loadAiSettings();
setupEventListeners();
setupAiModalLogic();

// ★ 步驟管理器 (Wizard) ★
const stepManager = new StepManager(3, {
    validate: (step) => {
        // Step 1: 檢查是否有題目
        if (step === 1) {
            if (!state.questions || state.questions.length === 0) {
                alert("請先輸入題目或匯入檔案！");
                return false;
            }
        }
        // Step 2: 錯題模式需檢查學生資料
        if (step === 2 && state.mode === 'error') {
            if (!state.students || state.students.length === 0) {
                alert("錯題訂正模式需要輸入學生資料！");
                return false;
            }
        }
        return true;
    },
    onStepChange: (step) => {
        if(step === 3) el.btnGenerate.disabled = false;
    }
});

// --- 事件監聽 ---
function setupEventListeners() {

    // 1. 編輯器輸入監聽 (Debounce)
    let timeout;
    el.txtRawQ.addEventListener('input', () => {
        if (state.sourceType === 'file') return; // 檔案模式不可編輯
        
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            state.sourceType = 'text';
            updateQPreview();
        }, 300);
    });

    // 錯題速記輸入
    el.txtRawS.addEventListener('input', () => {
        const parsed = parseErrorText(el.txtRawS.value);
        state.students = parsed;
        el.sStatus.textContent = parsed.length > 0 ? `✅ 已辨識 ${parsed.length} 人` : '尚未輸入';
        el.sStatus.className = parsed.length > 0 ? 'status-text ok' : 'status-text';
    });

    // 2. 匯入檔案 (V12 核心升級)
    el.btnUploadFile.addEventListener('click', () => el.fileQuestions.click());
    
    el.fileQuestions.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if(!file) return;

        const fileName = file.name.toLowerCase();
        
        // UI 提示
        el.txtRawQ.value = "📂 正在讀取檔案內容...";
        el.txtRawQ.disabled = true;

        try {
            // 分流：Excel/CSV vs Word/PDF
            if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
                // A. 結構化資料
                const data = await parseFile(file);
                state.questions = data;
                state.sourceType = 'file';
                
                el.txtRawQ.value = `[已匯入 Excel] ${file.name}\n包含 ${data.length} 筆資料。\n\n⚠️ 此模式下無法編輯文字，如需修改請編輯原檔後重新匯入。`;
                renderQPreview(data, 'File');
            
            } else if (fileName.endsWith('.docx') || fileName.endsWith('.pdf')) {
                // B. 非結構化文件 (Word/PDF)
                const rawText = await extractTextFromFile(file); // 呼叫 V12 fileExtractor
                
                el.txtRawQ.value = rawText; // 填入文字
                el.txtRawQ.disabled = false; // 開放編輯！
                state.sourceType = 'text'; // 轉為文字模式
                
                // 嘗試初步解析
                updateQPreview(); 
                alert(`檔案文字已提取！\n若格式混亂，請點擊「✨ AI 深度分析」進行整理。`);
            }

        } catch(err) {
            alert("讀取失敗：" + err.message);
            el.txtRawQ.value = "";
            el.txtRawQ.disabled = false;
        }
        e.target.value = '';
    });

    // 3. 範例與清空
    el.btnDemoData.addEventListener('click', () => {
        if(state.sourceType === 'file') resetEditor();
        el.txtRawQ.value = `1. 墨家思想的核心為何？\n(A)仁愛 (B)兼愛 (C)無為\n\n解析：\n1. 答案(B)。墨家主張兼愛非攻。`;
        updateQPreview();
    });

    el.btnClearQ.addEventListener('click', () => {
        if(confirm("確定清空？")) resetEditor();
    });

    // 4. AI 分析
    el.btnAiParse.addEventListener('click', async () => {
        if (!state.ai.available) return alert("請先設定 AI Key");
        
        const text = el.txtRawQ.value.trim();
        if (text.length < 5) return alert("請先輸入或匯入題目文字");

        const originalText = el.btnAiParse.textContent;
        el.btnAiParse.textContent = "🧠 分析中...";
        el.btnAiParse.disabled = true;
        
        try {
            const parsed = await parseWithGemini(state.ai.key, state.ai.model, text);
            state.questions = parsed;
            renderQPreview(parsed, 'AI');
        } catch(e) { 
            alert(e.message); 
            // 失敗退回 Regex 解析
            updateQPreview();
        } finally {
            el.btnAiParse.textContent = originalText;
            el.btnAiParse.disabled = false;
        }
    });

    // 5. 學生檔上傳
    el.btnUploadStudent.addEventListener('click', () => el.fileStudents.click());
    el.fileStudents.addEventListener('change', async (e) => {
        try {
            const data = await parseFile(e.target.files[0]);
            state.students = data;
            el.txtRawS.value = `[已匯入] ${e.target.files[0].name} (${data.length}人)`;
            el.sStatus.textContent = `✅ 已載入 ${data.length} 人`;
            el.sStatus.className = 'status-text ok';
        } catch(e) { alert(e.message); }
    });

    // 6. 模式切換
    el.tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            el.tabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            state.mode = e.target.dataset.mode;
            el.panelQuiz.style.display = state.mode === 'quiz' ? 'block' : 'none';
            el.panelError.style.display = state.mode === 'error' ? 'block' : 'none';
        });
    });

    // 7. 生成與列印
    el.btnGenerate.addEventListener('click', runGeneration);
    el.btnPrint.addEventListener('click', () => window.print());
}

// --- 邏輯功能 ---

function resetEditor() {
    el.txtRawQ.value = ''; el.txtRawQ.disabled = false;
    state.questions = null; state.sourceType = 'text';
    el.previewQ.innerHTML = '<div class="empty-state">👈 請輸入文字</div>';
    el.previewCount.textContent = '0';
}

function updateQPreview() {
    const parsed = parseQuestionMixed(el.txtRawQ.value, '');
    state.questions = parsed;
    renderQPreview(parsed, 'Regex');
}

function renderQPreview(questions, source) {
    el.previewCount.textContent = questions ? questions.length : 0;
    if(!questions || !questions.length) {
        el.previewQ.innerHTML = '<div class="empty-state">⚠️ 無法辨識題目</div>';
        return;
    }

    const badgeMap = { 'AI': 'AI 分析', 'File': '檔案', 'Regex': '文字辨識' };
    const badgeClass = source === 'AI' ? 'badge-ai' : (source === 'File' ? 'badge-file' : 'badge-regex');

    el.previewQ.innerHTML = questions.map(q => `
        <div class="parsed-item ${q.expl?'has-expl':''}">
            <div class="parsed-header">
                <span class="parsed-id">#${q.id}</span>
                <span class="parsed-badge ${badgeClass}">${badgeMap[source]}</span>
            </div>
            <div class="parsed-text">${escapeHtml(q.text)}</div>
            ${q.expl ? `<div class="parsed-expl">💡 ${escapeHtml(q.expl)}</div>` : ''}
        </div>
    `).join('');
}

// --- AI Modal 邏輯 ---
function setupAiModalLogic() {
    const modal = el.modalAi;
    el.btnAiSettings.addEventListener('click', () => modal.style.display = 'flex');
    document.querySelectorAll('.close-modal').forEach(b => b.addEventListener('click', () => modal.style.display = 'none'));

    el.btnCheckModels.addEventListener('click', async () => {
        const key = el.inputApiKey.value.trim();
        if(!key) return alert("請輸入 Key");
        try {
            const models = await fetchAvailableModels(key);
            el.selectModel.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
            el.modelSelectArea.style.display = 'block';
        } catch(e) { alert(e.message); }
    });

    el.btnSaveAi.addEventListener('click', () => {
        if(el.inputApiKey.value && el.selectModel.value) {
            state.ai = { key: el.inputApiKey.value, model: el.selectModel.value, available: true };
            localStorage.setItem('gemini_key', state.ai.key);
            localStorage.setItem('gemini_model', state.ai.model);
            
            el.aiStatusBadge.style.display = 'inline-block';
            el.aiStatusBadge.textContent = '🟢 AI Ready';
            el.aiStatusBadge.className = 'badge-ai';
            el.aiStatusBadge.style.padding = '2px 6px';
            el.aiStatusBadge.style.borderRadius = '4px';
            
            modal.style.display = 'none';
        }
    });
}

function loadAiSettings() {
    const k = localStorage.getItem('gemini_key');
    const m = localStorage.getItem('gemini_model');
    if(k && m) {
        state.ai = { key: k, model: m, available: true };
        el.inputApiKey.value = k;
        el.aiStatusBadge.style.display = 'inline-block';
        el.aiStatusBadge.textContent = '🟢 AI Ready';
        el.aiStatusBadge.className = 'badge-ai';
        el.aiStatusBadge.style.padding = '2px 6px';
        el.aiStatusBadge.style.borderRadius = '4px';
    }
}

// --- 生成邏輯 ---
function runGeneration() {
    // 建立 Map
    const qMap = {};
    if(state.questions) {
        state.questions.forEach(q => qMap[String(q.id).trim()] = q);
    }
    
    const config = {
        title: el.inputTitle.value,
        columns: getColumnConfig(),
        pageBreak: el.chkPageBreak.checked
    };
    
    el.outputArea.innerHTML = '';
    let dataToPrint = [];

    // --- 分流處理 (邏輯不變) ---
    if(state.mode === 'quiz') {
        let targetIds = [];
        const range = el.inputRange.value.trim();
        if(range) {
            range.split(/[,，\s]+/).forEach(p => {
                if(p.includes('-')) {
                    const [s,e] = p.split('-').map(Number);
                    for(let i=s; i<=e; i++) targetIds.push(String(i));
                } else if(p) targetIds.push(p);
            });
        } else {
            if(state.questions) targetIds = state.questions.map(q => String(q.id));
        }
        
        if(el.chkRandomize.checked) targetIds.sort(() => Math.random() - 0.5);
        const qList = targetIds.map(id => qMap[id]).filter(q => q);
        
        if(qList.length) dataToPrint.push({ student: { '姓名': '___________', '座號': '__' }, qList });
        else return alert("找不到對應題目");
    } else {
        // Error mode
        if(state.students) {
            state.students.forEach(s => {
                let ids = [];
                if(s['錯題列表']) ids = s['錯題列表'].split(/[:：,，\s]+/).filter(x=>x);
                else {
                    Object.keys(s).forEach(k => {
                        if((k.includes('題') || k.toLowerCase().includes('question')) && !k.includes('列表')) {
                            if(s[k]) ids.push(String(s[k]));
                        }
                    });
                }
                const qList = ids.map(id => qMap[id]).filter(q => q);
                if(qList.length) dataToPrint.push({ student: s, qList });
            });
        }
    }

    if(!dataToPrint.length) return alert("無資料");

    // --- 渲染 HTML ---
    dataToPrint.forEach(d => {
        // 這裡將生成的 HTML 加入 DOM
        el.outputArea.innerHTML += createStudentSection(d.student, d.qList, config);
    });

    if(el.chkTeacherKey.checked) {
         const allQ = new Set();
         dataToPrint.forEach(d => d.qList.forEach(q => allQ.add(q)));
         const sortedQ = Array.from(allQ).sort((a,b) => parseInt(a.id) - parseInt(b.id));
         el.outputArea.innerHTML += createTeacherKeySection(sortedQ);
    }

    // --- [關鍵修改] 顯示按鈕並執行「雙面列印補頁」 ---
    el.btnPrint.style.display = 'inline-block';
    
    // 1. 先渲染數學公式
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise().then(() => {
            // 2. 公式渲染完畢後，高度確定了，才執行補頁計算
            ensureEvenPages();
        }).catch(err => console.error(err));
    } else {
        // 如果沒用 MathJax，直接計算
        ensureEvenPages();
    }
}

function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}


function ensureEvenPages() {
    const A4_HEIGHT_PX = 1123; // A4 height at 96 DPI (297mm)
    // 設定一個容許值，避免剛剛好滿版卻被誤判為下一頁
    const TOLERANCE = 50; 

    const sections = document.querySelectorAll('.student-section');
    
    let count = 0;
    
    sections.forEach(section => {
        // 取得實際渲染高度
        const height = section.scrollHeight;
        
        // 計算佔用頁數 (無條件進位)
        // 例如：高度 1500px / 1123 = 1.33 -> 2 頁 (偶數，OK)
        // 例如：高度 2500px / 1123 = 2.22 -> 3 頁 (奇數，需要補)
        const pages = Math.ceil((height - TOLERANCE) / A4_HEIGHT_PX);
        
        // 移除舊的 filler (避免重複生成導致無限增長)
        const oldFiller = section.querySelector('.blank-page-filler');
        if(oldFiller) oldFiller.remove();

        // 如果頁數是奇數 (1, 3, 5...)
        if (pages % 2 !== 0) {
            // 插入空白頁填充元素
            const filler = document.createElement('div');
            filler.className = 'blank-page-filler';
            // 可以在此加入文字提示，例如：
            // filler.innerHTML = '<div style="text-align:center; color:#ccc; padding-top:50%;">此頁留白 (雙面列印用)</div>';
            section.appendChild(filler);
            console.log(`Student section height: ${height}px (~${pages} pages). Added filler.`);
            count++;
        }
    });

    if(count > 0) {
        console.log(`已自動為 ${count} 位學生補上空白頁以符合雙面列印。`);
    }
}
