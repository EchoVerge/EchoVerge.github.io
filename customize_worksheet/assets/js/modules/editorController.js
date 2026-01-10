/**
 * assets/js/modules/editorController.js
 * 負責 Step 1: 題目編輯、檔案匯入、AI 解析預覽、類題生成、歷史紀錄
 */

import { state } from './state.js';
import { parseFile } from './fileHandler.js';
import { extractTextFromFile } from './fileExtractor.js';
import { parseQuestionMixed } from './textParser.js';
// [新增] 引入新函式
import { parseWithGemini, generateSimilarQuestionsBatch } from './aiParser.js';
import { saveHistory, getHistoryList, loadHistory, deleteHistory } from './historyManager.js';

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
        
        // [新增] 按鈕與 Modal
        btnGenSimilar: document.getElementById('btn-gen-similar'),
        btnHistory: document.getElementById('btn-history'),
        modalHistory: document.getElementById('modal-history'),
        historyList: document.getElementById('history-list')
    };

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
                    expl: row.expl || row['解析'] || row['answer'] || row['Answer'] || ''
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

    // 3. AI 分析 (原功能)
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
            
            // [新增] 分析完自動存個檔
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

    // 5. [新增] 生成類題 (Batch)
    if (el.btnGenSimilar) {
        el.btnGenSimilar.addEventListener('click', async () => {
            if (!state.ai.available) return alert("請先設定 AI Key");
            if (!state.questions || state.questions.length === 0) return alert("請先建立題庫！");

            if (!confirm(`即將為 ${state.questions.length} 道題目生成類題。\n這可能需要一點時間，確定嗎？`)) return;

            const originalBtnText = el.btnGenSimilar.textContent;
            el.btnGenSimilar.disabled = true;
            el.btnGenSimilar.textContent = "⏳ 初始化...";

            try {
                // 分批處理：每次處理 5 題
                const BATCH_SIZE = 5;
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

                // [重要] 生成完畢後，自動存檔
                saveHistory(state.questions, `包含類題 - ${total} 題`);

                // 更新介面
                renderPreview(state.questions, 'AI+類題');
                alert("🎉 類題生成完畢！已自動儲存到歷史紀錄。");

            } catch (e) {
                console.error(e);
                alert("生成過程中斷：" + e.message);
            } finally {
                el.btnGenSimilar.disabled = false;
                el.btnGenSimilar.textContent = originalBtnText;
            }
        });
    }

    // 6. [新增] 歷史紀錄功能
    if (el.btnHistory) {
        // 開啟 Modal
        el.btnHistory.addEventListener('click', () => {
            el.modalHistory.style.display = 'flex';
            renderHistoryList();
        });

        // 關閉 Modal (通用)
        document.querySelectorAll('.close-modal, .close-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.target || 'modal-history';
                document.getElementById(targetId).style.display = 'none';
            });
        });
    }

    // 內部函式：渲染歷史列表
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

        // 綁定動態生成的按鈕事件
        document.querySelectorAll('.btn-load-hist').forEach(b => {
            b.addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                const record = loadHistory(id);
                if (record) {
                    if(confirm(`確定載入「${record.title}」？\n這將覆蓋目前的編輯內容。`)) {
                        state.questions = record.data; // 載入資料
                        state.sourceType = 'history';
                        el.txtRawQ.value = `[歷史紀錄] ${record.title}\n時間：${record.dateStr}`;
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
                    renderHistoryList(); // 重新渲染
                }
            });
        });
    }

    // --- 內部函式 (保持原本邏輯) ---
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
                <div class="parsed-header">
                    <span class="parsed-id">#${q.id}</span> 
                    <span class="parsed-badge">${source}</span>
                    ${q.similar ? '<span class="parsed-badge" style="background:#9c27b0;">★類題</span>' : ''}
                </div>
                <div class="parsed-text">${q.text.substring(0,60)}...</div>
            </div>
        `).join('');
    }
}