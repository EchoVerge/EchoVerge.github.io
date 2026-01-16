/**
 * assets/js/modules/gradingController.js
 * 閱卷控制器 V6.0
 * 功能: 隱藏列表、單一入口校對、視窗頂部檔案切換導航
 */
import { state } from './state.js';
import { fileToBase64 } from './fileHandler.js';
import { convertPdfToImages } from './fileExtractor.js';
import { analyzeAnswerSheetBatch } from './aiParser.js';
import { analyzeAnswerSheetLocal } from './localParser.js';
import { showToast } from './toast.js';

export function initGradingController() {
    // 定義 UI 元件
    const el = {
        btnCam: document.getElementById('btn-camera-grade'),
        fileImg: document.getElementById('file-grade-image'),
        chkLocal: document.getElementById('chk-use-local'),
        
        // 新增入口按鈕與計數
        btnOpenBatch: document.getElementById('btn-open-batch-review'),
        reviewCountBadge: document.getElementById('review-count-badge'),
        
        btnUploadStudent: document.getElementById('btn-upload-student'),
        fileStudents: document.getElementById('file-students'),
        inputFullScore: document.getElementById('input-full-score'),
        btnExportExcel: document.getElementById('btn-export-excel'),
        infoTitle: document.getElementById('current-exam-title'),
        
        txtRaw: document.getElementById('txt-raw-s'),
        statusBadge: document.getElementById('s-status-badge'),
        // 移除 batchArea，因為我們不需要顯示列表了

        // Modal 相關
        modal: document.getElementById('modal-grade-result'),
        navBar: document.getElementById('grade-file-nav'), // 頂部導航容器
        
        previewImg: document.getElementById('grade-img-preview'),
        inputSeat: document.getElementById('grade-seat-val'),
        inputAnsKey: document.getElementById('input-answer-key'),
        detailsList: document.getElementById('grade-details-list'),
        errorIds: document.getElementById('grade-error-ids'),
        errorCount: document.getElementById('error-count-display'),
        statusBadgeModal: document.getElementById('grade-status-badge'),
        
        btnConfirm: document.getElementById('btn-confirm-grade'),
        btnPrev: document.getElementById('btn-prev-student'),
        btnNext: document.getElementById('btn-next-student')
    };

    // 初始化狀態
    if (!state.studentAnswerMap) state.studentAnswerMap = {};
    if (!state.batchResults) state.batchResults = [];
    state.currentReviewIndex = -1;

    setupEventListeners(el);

    function setupEventListeners(el) {
        
        // 1. 拍照/閱卷
        if(el.btnCam && el.fileImg) {
            el.btnCam.addEventListener('click', () => {
                const isLocal = el.chkLocal && el.chkLocal.checked;
                if (!isLocal && !state.ai.available) return alert("請先設定 AI Key，或勾選「使用本地運算」");
                if(!state.questions || !state.questions.length) return alert("請先建立題庫");

                // 準備 Answer Key
                const keys = state.questions.map(q => {
                     if (q.ans) return q.ans.toUpperCase();
                     const m = ((q.expl||"")+(q.text||"")).match(/答案[:：\s]*([ABCDE])|[\(（]([ABCDE])[\)）]/i);
                     return m ? (m[1]||m[2]).toUpperCase() : "?";
                });
                state.tempAnswerKey = keys; 
                if(el.inputAnsKey) el.inputAnsKey.value = keys.join(',');

                el.fileImg.click();
            });

            el.fileImg.addEventListener('change', async (e) => {
                const files = e.target.files;
                if(!files || files.length === 0) return;

                // 初始化
                state.batchResults = [];
                state.currentReviewIndex = -1;
                // 隱藏入口按鈕，直到辨識完成
                if(el.btnOpenBatch) el.btnOpenBatch.style.display = 'none';
                
                showToast(`準備處理 ${files.length} 個檔案...`, "info");

                let allImages = [];
                for (let file of files) {
                    if (file.type === 'application/pdf') {
                        const pdfImgs = await convertPdfToImages(file);
                        allImages.push(...pdfImgs);
                    } else {
                        const base64 = await fileToBase64(file);
                        allImages.push(base64.split(',')[1]);
                    }
                }

                const isLocal = el.chkLocal && el.chkLocal.checked;
                let results;
                if (isLocal) {
                    results = await analyzeAnswerSheetLocal(allImages, state.questions.length);
                } else {
                    results = await analyzeAnswerSheetBatch(allImages, state.ai.model, state.ai.key, state.questions.length);
                }

                results.forEach((r, i) => {
                    r.uuid = Date.now() + "_" + i;
                    r.originalImage = allImages[i];
                    r.status = 'pending';
                    if (!r.answers) r.answers = [];
                    while(r.answers.length < state.questions.length) r.answers.push("");
                });

                state.batchResults = results;

                // [修改] 辨識完成後，顯示入口按鈕，並直接開啟校對視窗
                if (el.btnOpenBatch) {
                    el.btnOpenBatch.style.display = 'inline-flex';
                    if(el.reviewCountBadge) el.reviewCountBadge.innerText = results.length;
                }
                
                showToast(`辨識完成，共 ${results.length} 份`, "success");
                
                // 自動開啟第一張進行校對
                if (results.length > 0) {
                    openCorrectionModalByIndex(0);
                }
                e.target.value = '';
            });
        }

        // 2. 入口按鈕點擊事件
        if (el.btnOpenBatch) {
            el.btnOpenBatch.addEventListener('click', () => {
                if (state.batchResults.length > 0) {
                    // 若有上次紀錄，打開上次的位置，否則開第一張
                    const idx = state.currentReviewIndex >= 0 ? state.currentReviewIndex : 0;
                    openCorrectionModalByIndex(idx);
                } else {
                    alert("目前沒有待校對的資料");
                }
            });
        }

        // 3. 校對視窗操作
        if (el.btnConfirm) {
            el.btnConfirm.addEventListener('click', () => {
                saveCurrentReview();
                // 自動跳下一張 (如果有的話)
                if (state.currentReviewIndex < state.batchResults.length - 1) {
                    openCorrectionModalByIndex(state.currentReviewIndex + 1);
                } else {
                    showToast("已是最後一張", "success");
                }
            });
        }

        if (el.btnPrev) {
            el.btnPrev.addEventListener('click', () => {
                saveCurrentReview(); 
                if (state.currentReviewIndex > 0) openCorrectionModalByIndex(state.currentReviewIndex - 1);
            });
        }

        if (el.btnNext) {
            el.btnNext.addEventListener('click', () => {
                saveCurrentReview(); 
                if (state.currentReviewIndex < state.batchResults.length - 1) openCorrectionModalByIndex(state.currentReviewIndex + 1);
            });
        }

        document.querySelectorAll('.close-modal, .close-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                saveCurrentReview(); 
                el.modal.style.display = 'none';
            });
        });

        // 4. 匯出 Excel
        if(el.btnExportExcel) {
             el.btnExportExcel.addEventListener('click', () => {
                 const hasData = Object.keys(state.studentAnswerMap || {}).length > 0;
                 if(!hasData && (!el.txtRaw || !el.txtRaw.value.trim())) return alert("目前沒有成績資料可匯出");

                 const fullScore = parseFloat(el.inputFullScore.value) || 100;
                 const examTitle = el.infoTitle ? el.infoTitle.value.trim() : "測驗成績";

                 import('./scoreCalculator.js').then(module => {
                     if (module.exportGradesToExcel) {
                         module.exportGradesToExcel(state.studentAnswerMap, state.questions, fullScore, examTitle);
                     }
                 });
             });
        }
    }

    // ============================================================
    //  校對視窗邏輯
    // ============================================================

    function openCorrectionModalByIndex(index) {
        if (index < 0 || index >= state.batchResults.length) return;
        
        state.currentReviewIndex = index;
        const item = state.batchResults[index];
        
        // 1. 圖片
        if (item.debugImage && el.previewImg) el.previewImg.src = item.debugImage;
        else if (item.originalImage && el.previewImg) el.previewImg.src = "data:image/jpeg;base64," + item.originalImage;

        // 2. 座號
        let displaySeat = (item.seat || "").replace('Local_', '').replace('CV_', '');
        if (displaySeat === 'Check_Img') displaySeat = '';
        if (el.inputSeat) el.inputSeat.value = displaySeat;

        // 3. 狀態
        if (el.statusBadgeModal) {
            const isConfirmed = item.status === 'confirmed';
            el.statusBadgeModal.innerText = isConfirmed ? "✅ 已確認" : "⚠️ 待確認";
            el.statusBadgeModal.style.background = isConfirmed ? "#e8f5e9" : "#fff3e0";
            el.statusBadgeModal.style.color = isConfirmed ? "#2e7d32" : "#f57c00";
        }

        // 4. 按鈕狀態
        el.btnPrev.disabled = (index === 0);
        el.btnNext.disabled = (index === state.batchResults.length - 1);

        // 5. 渲染頂部導航列
        renderNavBar();

        // 6. 渲染表格
        renderGradeTable(item.answers);

        if (el.modal) el.modal.style.display = 'block';
    }

    // [新增] 渲染頂部導航列 (所有檔案的小按鈕)
    function renderNavBar() {
        if (!el.navBar) return;
        el.navBar.innerHTML = "";

        state.batchResults.forEach((item, idx) => {
            const btn = document.createElement('button');
            const isCurrent = (idx === state.currentReviewIndex);
            const isConfirmed = (item.status === 'confirmed');
            
            // 顯示文字：座號 或 索引
            let label = (item.seat || "").replace('Local_', '').replace('CV_', '');
            if (!label || label === 'Check_Img') label = `#${idx+1}`;
            
            // 樣式設定
            btn.className = "nav-file-btn"; // 可在 CSS 定義 hover 效果
            btn.style.cssText = `
                padding: 5px 12px;
                border: 1px solid ${isCurrent ? '#1976d2' : '#ddd'};
                background: ${isCurrent ? '#e3f2fd' : (isConfirmed ? '#f1f8e9' : '#fff')};
                color: ${isCurrent ? '#1565c0' : (isConfirmed ? '#33691e' : '#666')};
                border-radius: 15px;
                cursor: pointer;
                font-size: 0.9em;
                font-weight: ${isCurrent ? 'bold' : 'normal'};
                transition: all 0.2s;
            `;
            
            // 如果有異常，加紅點
            if (item.error) {
                btn.style.borderColor = "#ffcdd2";
                btn.innerHTML = `<span style="color:red">●</span> ${label}`;
            } else if (isConfirmed) {
                btn.innerHTML = `✓ ${label}`;
            } else {
                btn.innerText = label;
            }

            // 點擊切換
            btn.addEventListener('click', () => {
                saveCurrentReview(); // 切換前存檔
                openCorrectionModalByIndex(idx);
            });

            el.navBar.appendChild(btn);
            
            // 自動捲動到當前按鈕
            if (isCurrent) {
                setTimeout(() => btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }), 50);
            }
        });
    }

    function renderGradeTable(studentAnswers) {
        if (!el.detailsList) return;
        
        const correctKey = state.tempAnswerKey || [];
        let html = '';
        let errorList = [];
        let errorCount = 0;

        studentAnswers.forEach((ans, idx) => {
            const correct = correctKey[idx] || "?";
            const isCorrect = (ans && ans.replace(/\s/g,'').toUpperCase() === correct.replace(/\s/g,'').toUpperCase());
            
            if (!isCorrect) {
                errorList.push(idx + 1);
                errorCount++;
            }

            const rowColor = isCorrect ? '#fff' : '#ffebee';
            const scoreColor = isCorrect ? '#2e7d32' : '#d32f2f';

            html += `
            <div class="grade-row" style="display: grid; grid-template-columns: 50px 1fr 1fr; gap: 10px; padding: 6px 15px; border-bottom: 1px solid #eee; align-items: center; background: ${rowColor};">
                <div style="text-align: center; color: #666;">${idx + 1}</div>
                <div style="text-align: center; font-weight: bold; color: #555;">${correct}</div>
                <div>
                    <input type="text" class="student-ans-input" data-idx="${idx}" value="${ans}" 
                        style="width: 100%; text-align: center; font-weight: bold; color: ${scoreColor}; border: 1px solid #eee; background: rgba(255,255,255,0.8); padding: 4px; border-radius: 4px;">
                </div>
            </div>`;
        });

        el.detailsList.innerHTML = html;
        if (el.errorIds) el.errorIds.innerText = errorList.join(', ');
        if (el.errorCount) el.errorCount.innerText = errorCount;

        // 綁定輸入事件
        const inputs = el.detailsList.querySelectorAll('.student-ans-input');
        inputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                const newAns = e.target.value.trim().toUpperCase();
                
                // 更新資料
                const currentItem = state.batchResults[state.currentReviewIndex];
                if (currentItem) currentItem.answers[idx] = newAns;
                
                recalcRowStyle(e.target, idx, newAns);
            });
        });
    }

    function recalcRowStyle(inputEl, idx, newAns) {
        const correctKey = state.tempAnswerKey || [];
        const correct = correctKey[idx] || "?";
        const isCorrect = (newAns.replace(/\s/g,'') === correct.replace(/\s/g,''));
        
        const row = inputEl.closest('.grade-row');
        inputEl.style.color = isCorrect ? '#2e7d32' : '#d32f2f';
        row.style.background = isCorrect ? '#fff' : '#ffebee';
        
        updateErrorStats();
    }

    function updateErrorStats() {
        const currentItem = state.batchResults[state.currentReviewIndex];
        const correctKey = state.tempAnswerKey || [];
        let errors = [];
        currentItem.answers.forEach((ans, idx) => {
            const correct = correctKey[idx] || "?";
            if (ans.replace(/\s/g,'').toUpperCase() !== correct.replace(/\s/g,'').toUpperCase()) {
                errors.push(idx + 1);
            }
        });
        if (el.errorIds) el.errorIds.innerText = errors.join(', ');
        if (el.errorCount) el.errorCount.innerText = errors.length;
    }

    function saveCurrentReview() {
        if (state.currentReviewIndex === -1) return;
        const item = state.batchResults[state.currentReviewIndex];
        const finalSeat = el.inputSeat.value.trim();
        
        item.seat = finalSeat;
        item.status = 'confirmed';

        state.studentAnswerMap[finalSeat] = item.answers;
        
        // 更新導航列狀態 (打勾)
        renderNavBar();
        
        // 更新舊版文字框
        if (el.txtRaw) {
             const errorStr = el.errorIds.innerText;
             // 簡單防止重複堆疊
             if(!el.txtRaw.value.includes(finalSeat + ":")) {
                 el.txtRaw.value += `${finalSeat}: ${errorStr}\n`;
                 el.txtRaw.scrollTop = el.txtRaw.scrollHeight;
             }
        }
        if(el.statusBadge && el.txtRaw) {
             const count = el.txtRaw.value.trim().split('\n').filter(l => l.trim() !== '').length;
             el.statusBadge.innerText = `目前人數: ${count}`;
        }
    }
}