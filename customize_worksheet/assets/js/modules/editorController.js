/**
 * assets/js/modules/editorController.js
 * 負責 Step 1: 題目編輯、檔案匯入、AI 解析預覽
 */

import { state } from './state.js';
import { parseFile } from './fileHandler.js';
import { extractTextFromFile } from './fileExtractor.js';
import { parseQuestionMixed } from './textParser.js';
import { parseWithGemini, generateSimilarQuestions, rewriteExplanation } from './aiParser.js';

export function initEditorController() {
    const el = {
        txtRawQ: document.getElementById('txt-raw-q'),
        previewQ: document.getElementById('preview-parsed-q'),
        previewCount: document.getElementById('preview-count'),
        btnUploadFile: document.getElementById('btn-upload-file'),
        fileQuestions: document.getElementById('file-questions'),
        btnDemoData: document.getElementById('btn-demo-data'),
        btnAiParse: document.getElementById('btn-ai-parse'),
        btnClearQ: document.getElementById('btn-clear-q')
    };

    // 1. 編輯器輸入監聽 (Debounce)
    let timeout;
    el.txtRawQ.addEventListener('input', () => {
        if (state.sourceType === 'file') return;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            state.sourceType = 'text';
            updatePreview();
        }, 300);
    });

    // 2. 檔案匯入
    el.btnUploadFile.addEventListener('click', () => el.fileQuestions.click());
    el.fileQuestions.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const fileName = file.name.toLowerCase();
        el.txtRawQ.value = "📂 讀取中...";
        el.txtRawQ.disabled = true;

        try {
            if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
                // Excel 模式
                const data = await parseFile(file);
                state.questions = data;
                state.sourceType = 'file';
                el.txtRawQ.value = `[已匯入] ${file.name}\n${data.length} 題`;
                renderPreview(data, 'File');
            } else {
                // Word/PDF 模式
                const text = await extractTextFromFile(file);
                el.txtRawQ.value = text;
                el.txtRawQ.disabled = false;
                state.sourceType = 'text';
                updatePreview();
                alert("文字已提取！建議使用 AI 分析整理格式。");
            }
        } catch (err) {
            alert(err.message);
            el.txtRawQ.disabled = false;
        }
        e.target.value = '';
    });

    // 3. AI 分析
    el.btnAiParse.addEventListener('click', async () => {
        if (!state.ai.available) return alert("請先設定 AI Key");
        const text = el.txtRawQ.value;
        if (text.length < 5) return alert("內容過短");

        const originalText = el.btnAiParse.textContent;
        el.btnAiParse.textContent = "🧠 分析中...";
        el.btnAiParse.disabled = true;

        try {
            const parsed = await parseWithGemini(state.ai.key, state.ai.model, text);
            state.questions = parsed;
            renderPreview(parsed, 'AI');
        } catch (e) {
            alert(e.message);
        } finally {
            el.btnAiParse.textContent = originalText;
            el.btnAiParse.disabled = false;
        }
    });

    // 4. 清空與範例
    el.btnClearQ.addEventListener('click', () => {
        if (confirm("清空？")) {
            el.txtRawQ.value = '';
            el.txtRawQ.disabled = false;
            state.questions = [];
            state.sourceType = 'text';
            updatePreview();
        }
    });

    el.btnDemoData.addEventListener('click', () => {
        el.txtRawQ.value = `1. 題目範例...\n(A)選項\n解析：答案(A)`;
        el.txtRawQ.disabled = false;
        updatePreview();
    });

    // --- 內部函式 ---
    function updatePreview() {
        const parsed = parseQuestionMixed(el.txtRawQ.value, '');
        state.questions = parsed;
        renderPreview(parsed, 'Regex');
    }

    function renderPreview(questions, source) {
        el.previewCount.textContent = questions ? questions.length : 0;
        if (!questions || !questions.length) {
            el.previewQ.innerHTML = '<div class="empty-state">等待輸入...</div>';
            return;
        }
        
        // 渲染列表 (省略部分 HTML 生成細節以節省篇幅，邏輯同 V13)
        // 這裡需要掛載 window.triggerSimilar 等全域函式給按鈕呼叫
        el.previewQ.innerHTML = questions.map((q, i) => `
            <div class="parsed-item ${q.expl?'has-expl':''}">
                <div class="parsed-header"><span class="parsed-id">#${q.id}</span> <span class="parsed-badge">${source}</span></div>
                <div class="parsed-text">${q.text.substring(0,60)}...</div>
                </div>
        `).join('');
    }
}