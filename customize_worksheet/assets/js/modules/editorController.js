/**
 * assets/js/modules/editorController.js
 * V2.1: 新增 Step 1 直接輸出功能 (答題卡/教師卷)，標題採 Prompt 詢問
 */

import { state } from './state.js';
import { parseFile } from './fileHandler.js';
import { extractTextFromFile } from './fileExtractor.js';
import { parseQuestionMixed } from './textParser.js';
import { parseWithGemini, generateSimilarQuestionsBatch } from './aiParser.js';
import { saveHistory, getHistoryList, loadHistory, deleteHistory } from './historyManager.js';
// [新增] 引入渲染器
import { createAnswerSheet } from './answerSheetRenderer.js';
import { createTeacherKeySection } from './viewRenderer.js';

export function initEditorController() {
    const el = {
        txtRawQ: document.getElementById('txt-raw-q'),
        previewQ: document.getElementById('preview-parsed-q'),
        previewCount: document.getElementById('preview-count'),
        btnUploadFile: document.getElementById('btn-upload-file'),
        fileQuestions: document.getElementById('file-questions'),
        btnDemoData: document.getElementById('btn-demo-data'),
        btnAiParse: document.getElementById('btn-ai-parse'),
        btnClearQ: document.getElementById('btn-clear-q'),
        
        btnGenSimilar: document.getElementById('btn-gen-similar'),
        btnHistory: document.getElementById('btn-history'),
        modalHistory: document.getElementById('modal-history'),
        historyList: document.getElementById('history-list'),

        modalEditor: document.getElementById('modal-question-editor'),
        btnSaveEdit: document.getElementById('btn-save-edit'),
        inpIndex: document.getElementById('edit-q-index'),
        inpId: document.getElementById('edit-q-id'),
        inpText: document.getElementById('edit-q-text'),
        inpExpl: document.getElementById('edit-q-expl'),
        inpSimText: document.getElementById('edit-q-sim-text'),
        inpSimExpl: document.getElementById('edit-q-sim-expl'),

        // [新增] Step 1 輸出按鈕
        btnPrintSheet1: document.getElementById('btn-print-sheet-step1'),
        btnPrintKey1: document.getElementById('btn-print-key-step1'),
        outputArea: document.getElementById('output-area')
    };

    // --- Step 1 輸出功能 ---
    if (el.btnPrintSheet1) {
        el.btnPrintSheet1.addEventListener('click', () => handleExport('sheet'));
    }
    if (el.btnPrintKey1) {
        el.btnPrintKey1.addEventListener('click', () => handleExport('key'));
    }

    function handleExport(type) {
        if (!state.questions || state.questions.length === 0) {
            return alert("請先建立題庫！");
        }

        // [Prompt] 詢問標題，預設為「測驗卷」
        const defaultTitle = "測驗卷";
        const title = prompt("請輸入試卷標題：", defaultTitle);
        
        // 若使用者按取消，則終止
        if (title === null) return;

        let html = "";
        if (type === 'sheet') {
            html = createAnswerSheet(title || defaultTitle, state.questions.length);
        } else if (type === 'key') {
            html = createTeacherKeySection(state.questions);
            // 補上標題 (因為 createTeacherKeySection 只有表格)
            // 其實 viewRenderer 裡面已經有了標題 header，但這裡我們可以再確認一下
            // 為了完整性，我們通常直接用 viewRenderer 出來的 HTML 即可，因為它有包含 css class
        }

        // 寫入 Output Area 並列印
        el.outputArea.innerHTML = html;
        
        // 渲染數學公式 (如果有)
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise().then(() => {
                setTimeout(() => window.print(), 200);
            });
        } else {
            setTimeout(() => window.print(), 200);
        }
    }

    // ... (以下為原本的編輯器邏輯，保持不變) ...
    // 1. 編輯器輸入監聽
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
            if(fileName.endsWith('xls') || fileName.endsWith('xlsx') || fileName.endsWith('csv')) {
                const rawData = await parseFile(file);
                state.questions = rawData.map((row, index) => ({
                    id: String(row.id || row['題號'] || row['ID'] || index + 1).trim(),
                    text: row.text || row['題目'] || row['question'] || row['Question'] || '',
                    expl: row.expl || row['解析'] || row['answer'] || row['Answer'] || '',
                    ans: row.ans || row['答案'] || row['Ans'] || ''
                }));
                state.sourceType = 'file';
                el.txtRawQ.value = `[已匯入檔案] ${file.name}\n${state.questions.length} 題`;
                renderPreview(state.questions, 'File'); 
            } else {
                const text = await extractTextFromFile(file);
                el.txtRawQ.value = text;
                el.txtRawQ.disabled = false;
                state.sourceType = 'text';
                updatePreview();
                alert("文字已提取！建議使用 AI 分析整理格式。");
            }
        } catch (err) {
            console.error(err);
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
            saveHistory(parsed, `AI 分析結果 - ${parsed.length} 題`);
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

    // 5. 生成類題 (Batch)
    if (el.btnGenSimilar) {
        el.btnGenSimilar.addEventListener('click', async () => {
            if (!state.ai.available) return alert("請先設定 AI Key");
            if (!state.questions || state.questions.length === 0) return alert("請先建立題庫！");

            if (!confirm(`即將為 ${state.questions.length} 道題目生成類題。\n這可能需要一點時間，確定嗎？`)) return;

            const originalBtnText = el.btnGenSimilar.textContent;
            el.btnGenSimilar.disabled = true;
            el.btnGenSimilar.textContent = "⏳ 初始化...";

            try {
                const BATCH_SIZE = 10;
                const total = state.questions.length;
                let processed = 0;
                const qMap = new Map();
                state.questions.forEach(q => qMap.set(String(q.id), q));

                for (let i = 0; i < total; i += BATCH_SIZE) {
                    el.btnGenSimilar.textContent = `⏳ 生成中 (${processed}/${total})...`;
                    const batch = state.questions.slice(i, i + BATCH_SIZE);
                    const results = await generateSimilarQuestionsBatch(batch, state.ai.model, state.ai.key);
                    
                    if (Array.isArray(results)) {
                        results.forEach(res => {
                            const targetQ = qMap.get(String(res.id));
                            if (targetQ) {
                                targetQ.similar = {
                                    text: res.similarText || "生成失敗",
                                    expl: res.similarExpl || ""
                                };
                            }
                        });
                    }
                    processed += batch.length;
                }

                const timeStr = new Date().toLocaleTimeString('zh-TW', {hour:'2-digit', minute:'2-digit'});
                saveHistory(state.questions, `${timeStr} 題庫備份【包含複測類題】`);
                renderPreview(state.questions, 'AI+類題');
                alert("🎉 類題生成完畢！");

            } catch (e) {
                console.error(e);
                alert("生成過程中斷：" + e.message);
            } finally {
                el.btnGenSimilar.disabled = false;
                el.btnGenSimilar.textContent = originalBtnText;
            }
        });
    }

    // 6. 歷史紀錄
    if (el.btnHistory) {
        el.btnHistory.addEventListener('click', () => {
            el.modalHistory.style.display = 'flex';
            renderHistoryList();
        });
        document.querySelectorAll('.close-modal, .close-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.target;
                if(targetId) document.getElementById(targetId).style.display = 'none';
            });
        });
    }

    // 7. 單題編輯
    el.previewQ.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-edit-q');
        if (btn) {
            openEditModal(btn.dataset.index);
        }
        const btnDel = e.target.closest('.btn-del-q');
        if (btnDel) {
            const index = btnDel.dataset.index;
            if(confirm('確定刪除此題？')) {
                state.questions.splice(index, 1);
                renderPreview(state.questions, state.sourceType || 'Edit');
            }
        }
    });

    function openEditModal(index) {
        const q = state.questions[index];
        if (!q) return;
        el.inpIndex.value = index;
        el.inpId.value = q.id || '';
        el.inpText.value = q.text || '';
        el.inpExpl.value = q.expl || '';
        if (q.similar) {
            el.inpSimText.value = q.similar.text || '';
            el.inpSimExpl.value = q.similar.expl || '';
        } else {
            el.inpSimText.value = '';
            el.inpSimExpl.value = '';
        }
        el.modalEditor.style.display = 'flex';
    }

    el.btnSaveEdit.addEventListener('click', () => {
        const index = parseInt(el.inpIndex.value);
        if (isNaN(index) || index < 0 || index >= state.questions.length) return;
        const q = state.questions[index];
        q.id = el.inpId.value;
        q.text = el.inpText.value;
        q.expl = el.inpExpl.value;
        const simText = el.inpSimText.value.trim();
        const simExpl = el.inpSimExpl.value.trim();
        if (simText) {
            q.similar = { text: simText, expl: simExpl };
        } else {
            delete q.similar;
        }
        el.modalEditor.style.display = 'none';
        renderPreview(state.questions, state.sourceType || 'Edited');
    });

    // Helper Functions
    function updatePreview() {
        const parsed = parseQuestionMixed(el.txtRawQ.value, '');
        state.questions = parsed;
        renderPreview(parsed, 'Regex');
    }

    function renderPreview(questions, source) {
        if (!Array.isArray(questions)) questions = [];
        el.previewCount.textContent = questions.length;
        if (!questions.length) {
            el.previewQ.innerHTML = '<div class="empty-state">等待輸入...</div>';
            return;
        }
        el.previewQ.innerHTML = questions.map((q, i) => `
            <div class="parsed-item ${q.expl?'has-expl':''}">
                <div class="parsed-actions">
                    <button class="btn-icon-small btn-edit-q" data-index="${i}" title="編輯題目">✏️</button>
                    <button class="btn-icon-small btn-del-q" data-index="${i}" title="刪除題目" style="color:#d32f2f;">🗑️</button>
                </div>
                <div class="parsed-header">
                    <span class="parsed-id">#${q.id}</span> 
                    <span class="parsed-badge">${source}</span>
                    ${q.similar ? '<span class="parsed-badge" style="background:#9c27b0;">★類題</span>' : ''}
                </div>
                <div class="parsed-text">${q.text.substring(0,60)}...</div>
            </div>
        `).join('');
    }

    function renderHistoryList() {
        const list = getHistoryList();
        if (list.length === 0) {
            el.historyList.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">尚無紀錄</div>';
            return;
        }
        el.historyList.innerHTML = list.map(item => `
            <div class="history-item">
                <div class="hist-info">
                    <span class="hist-title">${item.title}</span>
                    <span class="hist-meta">${item.dateStr} • ${item.count} 題</span>
                </div>
                <div class="hist-actions">
                    <button class="btn-small btn-green btn-load-hist" data-id="${item.id}">📂 載入</button>
                    <button class="btn-small btn-red btn-del-hist" data-id="${item.id}">🗑️</button>
                </div>
            </div>
        `).join('');

        document.querySelectorAll('.btn-load-hist').forEach(b => {
            b.addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                const record = loadHistory(id);
                if (record) {
                    if(confirm(`確定載入「${record.title}」？\n這將覆蓋目前的編輯內容。`)) {
                        state.questions = JSON.parse(JSON.stringify(record.data));
                        state.sourceType = 'history';
                        el.txtRawQ.value = `[歷史紀錄] ${record.title}\n時間：${record.dateStr}`;
                        el.txtRawQ.disabled = true;
                        renderPreview(state.questions, 'History');
                        el.modalHistory.style.display = 'none';
                    }
                }
            });
        });

        document.querySelectorAll('.btn-del-hist').forEach(b => {
            b.addEventListener('click', (e) => {
                if(confirm("確定刪除此紀錄？")) {
                    deleteHistory(e.target.dataset.id);
                    renderHistoryList();
                }
            });
        });
    }
}