/**
 * assets/js/modules/editorController.js
 * V4.0: 增強版編輯器 (Phase 1 完成版)
 * - 支援圖片上傳、壓縮與預覽 (Base64)
 * - 全面升級為 IndexedDB 非同步存取 (解決容量限制)
 * - 支援編輯正確答案 & 類題答案
 * - 支援多選題格式
 */

import { state } from './state.js';
import { parseFile } from './fileHandler.js';
import { extractTextFromFile } from './fileExtractor.js';
import { parseQuestionMixed } from './textParser.js';
import { parseWithGemini, generateSimilarQuestionsBatch } from './aiParser.js';
// [修改] 引入新的 async history manager (需配合 V3.0 historyManager.js 與 db.js)
import { saveHistory, getHistoryList, loadHistory, deleteHistory, renameHistory, updateHistory } from './historyManager.js';
import { createAnswerSheet } from './answerSheetRenderer.js';
import { createTeacherKeySection } from './viewRenderer.js';
import { exportToWord } from './wordExporter.js';

// [新增] 圖片壓縮工具函式
function compressImage(file, maxWidth = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // 等比例縮放
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                // 輸出壓縮後的 Base64
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

// 用來追蹤目前正在編輯的歷史紀錄 ID
let currentHistoryId = null;

export function initEditorController() {
    const el = {
        txtRawQ: document.getElementById('txt-raw-q'),
        previewQ: document.getElementById('preview-parsed-q'),
        infoTitle: document.getElementById('current-exam-title'),
        infoCount: document.getElementById('current-question-count'),
        
        btnUploadFile: document.getElementById('btn-upload-file'),
        fileQuestions: document.getElementById('file-questions'),
        btnDemoData: document.getElementById('btn-demo-data'),
        btnAiParse: document.getElementById('btn-ai-parse'),
        btnClearQ: document.getElementById('btn-clear-q'),
        
        // 儲存按鈕
        btnSaveQ: document.getElementById('btn-save-q'),
        btnSaveAsQ: document.getElementById('btn-save-as-q'),
        
        btnGenSimilar: document.getElementById('btn-gen-similar'),
        btnHistory: document.getElementById('btn-history'),
        modalHistory: document.getElementById('modal-history'),
        historyList: document.getElementById('history-list'),

        // Editor Modal Inputs
        modalEditor: document.getElementById('modal-question-editor'),
        btnSaveEdit: document.getElementById('btn-save-edit'),
        inpIndex: document.getElementById('edit-q-index'),
        inpId: document.getElementById('edit-q-id'),
        inpAns: document.getElementById('edit-q-ans'),
        inpText: document.getElementById('edit-q-text'),
        inpExpl: document.getElementById('edit-q-expl'),
        inpSimAns: document.getElementById('edit-q-sim-ans'),
        inpSimText: document.getElementById('edit-q-sim-text'),
        inpSimExpl: document.getElementById('edit-q-sim-expl'),

        // [新增] 圖片相關元件
        inpImg: document.getElementById('edit-q-img-input'),
        imgPreview: document.getElementById('edit-q-img-preview'),
        imgPlaceholder: document.getElementById('edit-q-img-placeholder'),
        btnClearImg: document.getElementById('btn-clear-img'),

        btnPrintSheet1: document.getElementById('btn-print-sheet-step1'),
        btnPrintKey1: document.getElementById('btn-print-key-step1'),
        btnExportWordStudent: document.getElementById('btn-export-word-student'),
        btnExportWordTeacher: document.getElementById('btn-export-word-teacher'),

        outputArea: document.getElementById('output-area'),
        modalPreview: document.getElementById('modal-print-preview')
    };

    // [暫存] 編輯時的圖片 DataURL
    let tempEditingImg = null;

    // --- 初始化拖曳排序 (SortableJS) ---
    if (el.previewQ) {
        new Sortable(el.previewQ, {
            animation: 150,
            handle: '.parsed-item', // 整個區塊都可拖曳，或指定 .parsed-header
            ghostClass: 'sortable-ghost',
            onEnd: function (evt) {
                // 拖曳結束後，同步更新 state.questions 陣列順序
                const movedItem = state.questions.splice(evt.oldIndex, 1)[0];
                state.questions.splice(evt.newIndex, 0, movedItem);
                
                // 重新渲染以更新題號 (如果需要) 或保持 DOM 狀態
                // 這裡我們選擇重新渲染，確保 index 屬性與陣列一致
                renderPreview(state.questions, state.sourceType || 'Reordered');
            }
        });
        
        // 加入 CSS 樣式讓拖曳更明顯
        const style = document.createElement('style');
        style.innerHTML = `.sortable-ghost { opacity: 0.4; background: #e3f2fd; } .parsed-item { cursor: grab; } .parsed-item:active { cursor: grabbing; }`;
        document.head.appendChild(style);
    }

    // --- Word 匯出功能 (分流) ---
    if (el.btnExportWordStudent) {
        el.btnExportWordStudent.addEventListener('click', () => {
            const title = el.infoTitle.value.trim() || "測驗卷";
            exportToWord(state.questions, title, 'student');
        });
    }

    if (el.btnExportWordTeacher) {
        el.btnExportWordTeacher.addEventListener('click', () => {
            const title = el.infoTitle.value.trim() || "測驗卷";
            exportToWord(state.questions, title, 'teacher');
        });
    }

    // --- 0. 儲存與另存功能 (改為 async) ---
    // [儲存]
    if(el.btnSaveQ) {
        el.btnSaveQ.addEventListener('click', async () => {
            if (!state.questions || state.questions.length === 0) return alert("沒有題目可儲存！");
            
            const title = el.infoTitle.value.trim() || "未命名試卷";
            
            try {
                if (currentHistoryId) {
                    // 更新現有紀錄 (Await DB)
                    const success = await updateHistory(currentHistoryId, state.questions, title);
                    if (success) {
                        alert(`已儲存變更至「${title}」`);
                    } else {
                        // 若 ID 不存在 (可能被刪除)，轉為新存檔
                        currentHistoryId = await saveHistory(state.questions, title);
                        alert(`原紀錄已不存在，已另存為新紀錄「${title}」`);
                    }
                } else {
                    // 尚未有 ID，建立新紀錄
                    currentHistoryId = await saveHistory(state.questions, title);
                    alert(`已儲存為新紀錄「${title}」`);
                }
            } catch (e) {
                console.error(e);
                alert("儲存失敗：" + e.message);
            }
        });
    }

    // [另存新檔]
    if(el.btnSaveAsQ) {
        el.btnSaveAsQ.addEventListener('click', async () => {
            if (!state.questions || state.questions.length === 0) return alert("沒有題目可儲存！");
            
            const defaultTitle = el.infoTitle.value.trim() + " (副本)";
            const newTitle = prompt("另存新檔名稱：", defaultTitle);
            
            if (newTitle) {
                el.infoTitle.value = newTitle;
                try {
                    // 強制產生新 ID (Await DB)
                    currentHistoryId = await saveHistory(state.questions, newTitle);
                    alert(`已另存為「${newTitle}」`);
                } catch (e) {
                    console.error(e);
                    alert("另存失敗：" + e.message);
                }
            }
        });
    }

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

        const currentTitle = el.infoTitle.value.trim() || "測驗卷";
        const title = prompt("請確認試卷標題：", currentTitle);
        if (title === null) return;
        
        if(title) el.infoTitle.value = title;

        let html = "";
        if (type === 'sheet') {
            html = createAnswerSheet(title || currentTitle, state.questions.length);
        } else if (type === 'key') {
            html = createTeacherKeySection(state.questions);
        }

        el.outputArea.innerHTML = html;
        el.modalPreview.style.display = 'flex';
        
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise().catch(e => console.error(e));
        }
    }

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
        
        currentHistoryId = null; // [重置 ID] 匯入新檔視為全新開始
        
        const pureName = file.name.replace(/\.[^/.]+$/, "");
        el.infoTitle.value = pureName; // 自動填入檔名

        el.txtRawQ.value = "📂 讀取中...";
        el.txtRawQ.disabled = true;

        try {
            if(file.name.match(/\.(xls|xlsx|csv)$/i)) {
                const rawData = await parseFile(file);
                state.questions = rawData.map((row, index) => ({
                    id: String(row.id || row['題號'] || index + 1).trim(),
                    text: row.text || row['題目'] || '',
                    expl: row.expl || row['解析'] || '',
                    ans: row.ans || row['答案'] || ''
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
            
            // AI 分析後自動存一份 (Await DB)
            const title = el.infoTitle.value || "AI 分析結果";
            currentHistoryId = await saveHistory(parsed, title);
            
        } catch (e) {
            alert(e.message);
        } finally {
            el.btnAiParse.textContent = originalText;
            el.btnAiParse.disabled = false;
        }
    });

    // 4. 清空
    el.btnClearQ.addEventListener('click', () => {
        if (confirm("清空？")) {
            el.txtRawQ.value = '';
            el.txtRawQ.disabled = false;
            state.questions = [];
            state.sourceType = 'text';
            el.infoTitle.value = "未命名試卷";
            currentHistoryId = null; // [重置 ID]
            updatePreview();
        }
    });

    el.btnDemoData.addEventListener('click', () => {
        el.txtRawQ.value = `1. 題目範例...\n(A)選項\n解析：答案(A)`;
        el.txtRawQ.disabled = false;
        el.infoTitle.value = "範例試卷";
        currentHistoryId = null; // 範例視為新檔
        updatePreview();
    });

    // 5. 類題生成 (巢狀結構)
    if (el.btnGenSimilar) {
        el.btnGenSimilar.addEventListener('click', async () => {
            if (!state.ai.available) return alert("請先設定 AI Key");
            if (!state.questions || state.questions.length === 0) return alert("請先建立題庫！");

            if (!confirm(`即將為 ${state.questions.length} 道題目生成類題。\n這將歸入當前題庫作為子題。確定嗎？`)) return;

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
                                // [重要] 確保巢狀結構包含答案
                                targetQ.similar = {
                                    text: res.similarText || "生成失敗",
                                    expl: res.similarExpl || "",
                                    ans: res.similarAns || "" // 新增答案
                                };
                            }
                        });
                    }
                    processed += batch.length;
                }

                const newTitle = el.infoTitle.value + " (含類題)";
                el.infoTitle.value = newTitle;
                
                // 類題生成完畢後，視為一次「新存檔」或「更新」 (Await DB)
                if(currentHistoryId) {
                    await updateHistory(currentHistoryId, state.questions, newTitle);
                } else {
                    currentHistoryId = await saveHistory(state.questions, newTitle);
                }
                
                renderPreview(state.questions, 'AI+類題');
                alert("🎉 類題生成完畢！已歸入各題之下並自動儲存。");

            } catch (e) {
                console.error(e);
                alert("生成過程中斷：" + e.message);
            } finally {
                el.btnGenSimilar.disabled = false;
                el.btnGenSimilar.textContent = originalBtnText;
            }
        });
    }

    // 6. 歷史紀錄 (改為 Async 渲染)
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

    // 7. 單題編輯 (開啟 Modal)
    el.previewQ.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-edit-q');
        if (btn) openEditModal(btn.dataset.index);
        
        const btnDel = e.target.closest('.btn-del-q');
        if (btnDel) {
            const index = btnDel.dataset.index;
            if(confirm('確定刪除此題？')) {
                state.questions.splice(index, 1);
                renderPreview(state.questions, state.sourceType || 'Edit');
            }
        }
    });

    // --- 圖片處理邏輯 ---

    // 監聽圖片上傳
    if (el.inpImg) {
        el.inpImg.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                // 壓縮圖片並轉為 Base64
                tempEditingImg = await compressImage(file);
                el.imgPreview.src = tempEditingImg;
                el.imgPreview.style.display = 'block';
                el.imgPlaceholder.style.display = 'none';
            } catch (err) {
                console.error(err);
                alert("圖片處理失敗");
            }
        });
    }

    // 清除圖片
    if (el.btnClearImg) {
        el.btnClearImg.addEventListener('click', () => {
            el.inpImg.value = '';
            tempEditingImg = null;
            el.imgPreview.src = '';
            el.imgPreview.style.display = 'none';
            el.imgPlaceholder.style.display = 'block';
        });
    }

    function openEditModal(index) {
        const q = state.questions[index];
        if (!q) return;
        el.inpIndex.value = index;
        el.inpId.value = q.id || '';
        el.inpAns.value = q.ans || '';
        el.inpText.value = q.text || '';
        el.inpExpl.value = q.expl || '';
        
        // 載入圖片 (若有)
        tempEditingImg = q.img || null;
        if (tempEditingImg) {
            el.imgPreview.src = tempEditingImg;
            el.imgPreview.style.display = 'block';
            el.imgPlaceholder.style.display = 'none';
        } else {
            el.imgPreview.style.display = 'none';
            el.imgPlaceholder.style.display = 'block';
            el.inpImg.value = '';
        }

        if (q.similar) {
            el.inpSimText.value = q.similar.text || '';
            el.inpSimExpl.value = q.similar.expl || '';
            el.inpSimAns.value = q.similar.ans || '';
        } else {
            el.inpSimText.value = '';
            el.inpSimExpl.value = '';
            el.inpSimAns.value = '';
        }
        el.modalEditor.style.display = 'flex';
    }

    el.btnSaveEdit.addEventListener('click', () => {
        const index = parseInt(el.inpIndex.value);
        if (isNaN(index) || index < 0 || index >= state.questions.length) return;
        const q = state.questions[index];
        q.id = el.inpId.value;
        q.ans = el.inpAns.value.trim();
        q.text = el.inpText.value;
        q.expl = el.inpExpl.value;
        q.img = tempEditingImg; // 儲存圖片 DataURL
        
        const simText = el.inpSimText.value.trim();
        const simExpl = el.inpSimExpl.value.trim();
        const simAns = el.inpSimAns.value.trim();
        
        if (simText) {
            q.similar = { text: simText, expl: simExpl, ans: simAns };
        } else {
            delete q.similar;
        }
        
        el.modalEditor.style.display = 'none';
        renderPreview(state.questions, state.sourceType || 'Edited');
    });

    function updatePreview() {
        const parsed = parseQuestionMixed(el.txtRawQ.value, '');
        state.questions = parsed;
        renderPreview(parsed, 'Regex');
    }

    function renderPreview(questions, source) {
        if (!Array.isArray(questions)) questions = [];
        el.infoCount.textContent = questions.length;
        if (!questions.length) {
            el.previewQ.innerHTML = '<div class="empty-state">等待輸入...</div>'; return;
        }
        el.previewQ.innerHTML = questions.map((q, i) => `
            <div class="parsed-item ${q.expl?'has-expl':''}">
                <div class="parsed-actions">
                    <button class="btn-icon-small btn-edit-q" data-index="${i}" title="編輯">✏️</button>
                    <button class="btn-icon-small btn-del-q" data-index="${i}" title="刪除" style="color:#d32f2f;">🗑️</button>
                </div>
                <div class="parsed-header">
                    <span class="parsed-id">#${q.id}</span> 
                    <span class="parsed-badge" style="background:${q.ans?'#e8f5e9':'#ffebee'}">${q.ans || '未填答'}</span>
                    <span class="parsed-badge">${source}</span>
                    ${q.img ? '<span class="parsed-badge" style="background:#2196F3; color:white;">🖼️ 圖</span>' : ''}
                    ${q.similar ? '<span class="parsed-badge" style="background:#9c27b0; color:white;">★類題</span>' : ''}
                </div>
                <div class="parsed-text">
                    ${q.img ? `<img src="${q.img}" style="height:40px; vertical-align:middle; border:1px solid #ddd; margin-right:5px;">` : ''}
                    ${q.text.substring(0,60)}...
                </div>
            </div>
        `).join('');
    }

    // [核心修改] 渲染歷史紀錄列表 (包含改名按鈕，且全改為 async/await)
    async function renderHistoryList() {
        el.historyList.innerHTML = '<div style="text-align:center; padding:20px;">讀取中...</div>';
        
        // Await DB
        const list = await getHistoryList();
        
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
                    <button class="btn-small btn-tool btn-rename-hist" data-id="${item.id}" data-title="${item.title}" title="改名">✏️</button>
                    <button class="btn-small btn-secondary btn-append-hist" data-id="${item.id}" title="加入到目前題庫">➕ 追加</button>
                    <button class="btn-small btn-green btn-load-hist" data-id="${item.id}" title="覆蓋目前題庫">📂 載入</button>
                    <button class="btn-small btn-red btn-del-hist" data-id="${item.id}" title="刪除">🗑️</button>
                </div>
            </div>
        `).join('');

        // 綁定載入按鈕
        document.querySelectorAll('.btn-load-hist').forEach(b => {
            b.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                const record = await loadHistory(id); // Await DB
                if (record) {
                    if(confirm(`確定載入「${record.title}」？\n這將【覆蓋】目前的編輯內容。`)) {
                        state.questions = JSON.parse(JSON.stringify(record.data));
                        state.sourceType = 'history';
                        el.infoTitle.value = record.title; 
                        currentHistoryId = id; // [重要] 設定當前 ID
                        el.txtRawQ.value = `[歷史紀錄] ${record.title}\n時間：${record.dateStr}`;
                        el.txtRawQ.disabled = true;
                        renderPreview(state.questions, 'History');
                        el.modalHistory.style.display = 'none';
                    }
                }
            });
        });

        // 綁定追加按鈕
        document.querySelectorAll('.btn-append-hist').forEach(b => {
            b.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                const record = await loadHistory(id); // Await DB
                if (record) {
                    const newQs = JSON.parse(JSON.stringify(record.data));
                    const startId = state.questions.length + 1;
                    newQs.forEach((q, idx) => { q.id = String(startId + idx); });
                    state.questions = state.questions.concat(newQs);
                    renderPreview(state.questions, 'Append');
                    alert(`已追加 ${newQs.length} 題！`);
                    el.modalHistory.style.display = 'none';
                }
            });
        });

        // 綁定刪除按鈕
        document.querySelectorAll('.btn-del-hist').forEach(b => {
            b.addEventListener('click', async (e) => {
                if(confirm("確定刪除此紀錄？")) {
                    await deleteHistory(e.target.dataset.id); // Await DB
                    renderHistoryList();
                }
            });
        });

        // 綁定改名按鈕
        document.querySelectorAll('.btn-rename-hist').forEach(b => {
            b.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                const oldTitle = e.target.dataset.title;
                const newTitle = prompt("請輸入新名稱：", oldTitle);
                if (newTitle && newTitle.trim() !== "") {
                    await renameHistory(id, newTitle.trim()); // Await DB
                    renderHistoryList();
                }
            });
        });
    }
}