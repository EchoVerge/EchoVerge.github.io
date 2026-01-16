/**
 * assets/js/modules/gradingController.js
 * 閱卷控制器 - 負責協調 UI 與閱卷邏輯
 * V4.0: 支援批次閱卷清單、多圖校對、與完整 Excel 匯出
 */
import { state } from './state.js';
import { parseFile, fileToBase64 } from './fileHandler.js';
import { convertPdfToImages } from './fileExtractor.js';
import { analyzeAnswerSheetBatch } from './aiParser.js';
import { analyzeAnswerSheetLocal } from './localParser.js';
import { showToast } from './toast.js';

export function initGradingController() {
    // 定義 UI 元件
    const el = {
        // 工具列按鈕
        btnCam: document.getElementById('btn-camera-grade'),
        fileImg: document.getElementById('file-grade-image'),
        chkLocal: document.getElementById('chk-use-local'), // 本地運算開關
        
        btnUploadStudent: document.getElementById('btn-upload-student'),
        fileStudents: document.getElementById('file-students'),
        
        // 計分設定區
        inputFullScore: document.getElementById('input-full-score'),
        selScoring: document.getElementById('sel-scoring-mode'),
        btnExportExcel: document.getElementById('btn-export-excel'),
        
        // 成績輸入區 (主畫面)
        txtRaw: document.getElementById('txt-raw-s'),
        statusBadge: document.getElementById('s-status-badge'),
        
        // 抓取試卷標題 (用於匯出)
        infoTitle: document.getElementById('current-exam-title'),

        // 校對 Modal 相關元件
        modal: document.getElementById('modal-grade-result'),
        previewImg: document.getElementById('grade-img-preview'),
        inputAnsKey: document.getElementById('input-answer-key'),
        inputSeat: document.getElementById('grade-seat-val'),
        detailsList: document.getElementById('grade-details-list'),
        errorIds: document.getElementById('grade-error-ids'),
        btnConfirm: document.getElementById('btn-confirm-grade'),
        
        // 新增：批次結果顯示區 (若 HTML 無此 ID，會動態建立)
        batchArea: document.getElementById('batch-results-area') 
    };

    // 若 HTML 尚未建立 batch-results-area，我們動態插入到 txt-raw-s 上方
    if (!el.batchArea && el.txtRaw) {
        const div = document.createElement('div');
        div.id = 'batch-results-area';
        div.style.marginBottom = '15px';
        div.style.maxHeight = '300px';
        div.style.overflowY = 'auto';
        div.style.border = '1px solid #ddd';
        div.style.padding = '10px';
        div.style.background = '#fafafa';
        div.style.display = 'none'; // 預設隱藏
        el.txtRaw.parentNode.insertBefore(div, el.txtRaw);
        el.batchArea = div;
    }

    // 初始化答案儲存區 (若尚未存在)
    if (!state.studentAnswerMap) state.studentAnswerMap = {};
    
    // 初始化批次暫存區
    state.batchResults = [];

    // 初始化事件監聽
    setupEventListeners(el);

    // --- 內部輔助函式 ---

    function setupEventListeners(el) {
        
        // 1. 點擊「拍照/閱卷」按鈕
        if(el.btnCam && el.fileImg) {
            el.btnCam.addEventListener('click', () => {
                const isLocal = el.chkLocal && el.chkLocal.checked;
                
                // 檢查必要條件
                if (!isLocal && !state.ai.available) {
                    return alert("請先設定 AI Key，或勾選「使用本地運算」");
                }
                if(!state.questions || !state.questions.length) {
                    return alert("請先建立題庫 (無標準答案無法閱卷)");
                }

                // 自動產生標準答案 (Answer Key)
                const keys = state.questions.map(q => {
                     if (q.ans) return q.ans.toUpperCase();
                     const m = ((q.expl||"")+(q.text||"")).match(/答案[:：\s]*([ABCDE])|[\(（]([ABCDE])[\)）]/i);
                     return m ? (m[1]||m[2]).toUpperCase() : "?";
                });
                
                // 將答案存入全域 state 與輸入框
                state.tempAnswerKey = keys; 
                if(el.inputAnsKey) el.inputAnsKey.value = keys.join(',');

                // 觸發檔案選擇
                el.fileImg.click();
            });

            // 2. 檔案選擇後的處理 (核心閱卷流程 - 批次版)
            el.fileImg.addEventListener('change', async (e) => {
                const files = e.target.files;
                if(!files || files.length === 0) return;

                const file = files[0]; // 暫時只取第一個檔案 (若 input 支援 multiple 可改為 loop)
                const isLocal = el.chkLocal && el.chkLocal.checked;
                
                showToast("正在處理影像，請稍候...", "info");

                // 重置介面與暫存
                state.batchResults = [];
                renderBatchList([]);

                try {
                    let images = [];
                    if (file.type === 'application/pdf') {
                        images = await convertPdfToImages(file);
                    } else {
                        const base64 = await fileToBase64(file);
                        const raw = base64.split(',')[1];
                        images = [raw];
                    }

                    showToast(`共 ${images.length} 張影像，開始辨識...`, "info");

                    const BATCH_SIZE = 5; // 加大批次量
                    let allResults = [];

                    for (let i = 0; i < images.length; i += BATCH_SIZE) {
                        const chunk = images.slice(i, i + BATCH_SIZE);
                        
                        let results;
                        if (isLocal) {
                            console.log("呼叫本地閱卷 (Local Analysis)...");
                            results = await analyzeAnswerSheetLocal(chunk, state.questions.length);
                        } else {
                            console.log("呼叫 AI 閱卷 (Cloud AI)...");
                            results = await analyzeAnswerSheetBatch(chunk, state.ai.model, state.ai.key, state.questions.length);
                        }

                        // 補充圖片資料 (供預覽用)
                        results.forEach((r, idx) => {
                            if (!r.originalImage) r.originalImage = chunk[idx]; 
                            r.status = 'pending'; // 狀態: 待確認
                            if (!r.uuid) r.uuid = Date.now() + "_" + i + "_" + idx;
                        });
                        
                        allResults = allResults.concat(results);
                        showToast(`已處理 ${Math.min(i + BATCH_SIZE, images.length)} / ${images.length} 張`, "info");
                    }

                    // 儲存並顯示清單
                    state.batchResults = allResults;
                    renderBatchList(state.batchResults);
                    
                    showToast("辨識完成，請點擊清單項目進行校對", "success");

                } catch(err) {
                    console.error(err);
                    showToast("閱卷發生錯誤: " + err.message, "error");
                }
                e.target.value = '';
            });
        }

        // 3. Modal 確認按鈕 (校對完成)
        if(el.btnConfirm) {
            el.btnConfirm.addEventListener('click', () => {
                if(!state.currentReviewData) return;
                
                const finalSeat = el.inputSeat ? el.inputSeat.value.trim() : state.currentReviewData.seat;
                const currentUUID = state.currentReviewData.uuid;

                // 更新暫存清單中的資料
                const targetItem = state.batchResults.find(r => r.uuid === currentUUID);
                if (targetItem) {
                    targetItem.seat = finalSeat;
                    targetItem.status = 'confirmed';
                    // 若有修改錯題功能，這裡也應更新 answers (此範例假設僅修改座號)
                }

                // 正式寫入全域 Map (供 Excel 使用)
                if (state.currentReviewData.answers) {
                    state.studentAnswerMap[finalSeat] = state.currentReviewData.answers;
                }

                // 更新列表 UI (打勾)
                renderBatchList(state.batchResults);

                // 更新舊版文字框 (txtRaw)
                const errorStr = el.errorIds ? el.errorIds.innerText : "";
                if(el.txtRaw) {
                    el.txtRaw.value += `${finalSeat}: ${errorStr}\n`;
                    el.txtRaw.scrollTop = el.txtRaw.scrollHeight;
                }
                
                // 更新計數
                if(el.statusBadge && el.txtRaw) {
                    const count = el.txtRaw.value.trim().split('\n').filter(l => l.trim() !== '').length;
                    el.statusBadge.innerText = `目前人數: ${count}`;
                }

                if(el.modal) el.modal.style.display = 'none';
                showToast(`已確認座號 ${finalSeat}`, "success");
            });
        }

        // 4. 關閉 Modal
        document.querySelectorAll('.close-modal, .close-modal-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.target.dataset.target;
                const modal = targetId ? document.getElementById(targetId) : e.target.closest('.modal');
                if(modal) modal.style.display = 'none';
            });
        });

        // 5. 匯出 Excel (保持您要求的完整功能)
        if(el.btnExportExcel) {
             el.btnExportExcel.addEventListener('click', () => {
                 const hasData = Object.keys(state.studentAnswerMap || {}).length > 0;
                 
                 if(!hasData && el.txtRaw && el.txtRaw.value.trim()) {
                     return alert("偵測到舊版數據，請重新閱卷以取得完整作答明細。");
                 }
                 if(!hasData) return alert("目前沒有成績資料可匯出");

                 showToast("正在準備匯出成績...", "info");
                 
                 const fullScore = parseFloat(el.inputFullScore.value) || 100;
                 const examTitle = el.infoTitle ? el.infoTitle.value.trim() : "測驗成績";

                 import('./scoreCalculator.js').then(module => {
                     if (module.exportGradesToExcel) {
                         module.exportGradesToExcel(state.studentAnswerMap, state.questions, fullScore, examTitle);
                     } else {
                         alert("匯出功能模組尚未載入");
                     }
                 }).catch(err => {
                     console.error(err);
                     alert("無法載入匯出模組");
                 });
             });
        }
        
        // 6. 上傳學生成績 Excel
        if(el.btnUploadStudent && el.fileStudents) {
            el.btnUploadStudent.addEventListener('click', () => el.fileStudents.click());
            el.fileStudents.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                showToast("成績 Excel 上傳功能 (目前僅支援手動輸入或閱卷)", "info");
                e.target.value = '';
            });
        }
    }

    // --- Helper: 渲染批次結果清單 ---
    function renderBatchList(items) {
        if (!el.batchArea) return;
        
        if (items.length === 0) {
            el.batchArea.style.display = 'none';
            return;
        }

        el.batchArea.style.display = 'block';
        el.batchArea.innerHTML = `<h4 style="margin:0 0 10px 0; font-size:1.1em;">📋 待校對清單 (${items.length} 份)</h4>`;
        
        const list = document.createElement('div');
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.gap = '8px';

        items.forEach((item, idx) => {
            const row = document.createElement('div');
            // 樣式：已確認變綠色，未確認顯示橘色
            const isConfirmed = item.status === 'confirmed';
            const bgColor = isConfirmed ? '#e8f5e9' : '#fff3e0';
            const borderColor = isConfirmed ? '#c8e6c9' : '#ffe0b2';
            
            // 處理座號顯示
            let displaySeat = (item.seat || "").replace('Local_', '').replace('CV_', '');
            if (displaySeat === 'Check_Img' || !displaySeat) displaySeat = '未偵測';

            row.style.cssText = `
                padding: 10px; 
                border: 1px solid ${borderColor}; 
                background: ${bgColor}; 
                border-radius: 5px; 
                cursor: pointer; 
                display: flex; 
                justify-content: space-between; 
                align-items: center;
                transition: background 0.2s;
            `;
            row.onmouseover = () => row.style.background = isConfirmed ? '#c8e6c9' : '#ffe0b2';
            row.onmouseout = () => row.style.background = bgColor;
            
            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-weight:bold; color:#555;">#${idx+1}</span>
                    <span>座號: <b style="font-size:1.1em;">${displaySeat}</b></span>
                    ${item.error ? '<span style="color:red; font-size:0.8em;">⚠️ 辨識異常</span>' : ''}
                </div>
                <div>
                    ${isConfirmed ? '<span style="color:green; font-weight:bold;">✅ 已確認</span>' : '<button class="btn-small" style="padding:4px 8px;">校對</button>'}
                </div>
            `;

            // 點擊開啟 Modal
            row.addEventListener('click', () => openCorrectionModal(item));
            list.appendChild(row);
        });

        el.batchArea.appendChild(list);
    }

    // --- Helper: 開啟校對視窗 ---
    function openCorrectionModal(item) {
        // 1. 設定圖片 (優先使用有畫線的 Debug 圖)
        if (item.debugImage && el.previewImg) {
            el.previewImg.src = item.debugImage;
        } else if (item.originalImage && el.previewImg) {
            el.previewImg.src = "data:image/jpeg;base64," + item.originalImage;
        }

        // 2. 設定座號
        let displaySeat = (item.seat || "").replace('Local_', '').replace('CV_', '');
        if (displaySeat === 'Check_Img') displaySeat = '';
        if(el.inputSeat) el.inputSeat.value = displaySeat;

        // 3. 比對答案並生成詳細列表
        const studentAns = item.answers || [];
        const correctKey = state.tempAnswerKey || [];
        let errorList = []; 
        let detailsHtml = "";

        studentAns.forEach((ans, idx) => {
            const correct = correctKey[idx] || "?";
            const isCorrect = (ans && ans.trim().toUpperCase() === correct.trim().toUpperCase());
            if(!isCorrect) errorList.push(idx + 1);
            
            detailsHtml += `
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding:8px 5px; ${!isCorrect ? 'background:#ffebee;' : ''}">
                    <span style="font-weight:500;">第 ${idx+1} 題</span>
                    <div style="text-align:right;">
                        <span style="font-weight:bold; color:${isCorrect?'#2e7d32':'#c62828'}; margin-right:10px;">${ans || "(未答)"}</span>
                        <span style="color:#757575; font-size:0.9em;">(正解: ${correct})</span>
                    </div>
                </div>
            `;
        });

        if(el.detailsList) el.detailsList.innerHTML = detailsHtml;
        if(el.errorIds) el.errorIds.innerText = errorList.join(', ');

        // 4. 暫存當前正在編輯的項目
        state.currentReviewData = {
            uuid: item.uuid,
            seat: displaySeat,
            answers: studentAns,
            errors: errorList.join(', ')
        };

        if(el.modal) el.modal.style.display = 'block';
    }
}