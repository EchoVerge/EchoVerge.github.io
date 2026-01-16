/**
 * assets/js/modules/gradingController.js
 * 閱卷控制器 - 負責協調 UI 與閱卷邏輯
 * V3.6: 支援匯出時加入空白公式欄位與測驗資訊分頁
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
        
        // 為了相容性，重複定義 keyInput
        keyInput: document.getElementById('input-answer-key') 
    };

    // 初始化答案儲存區 (若尚未存在)
    if (!state.studentAnswerMap) state.studentAnswerMap = {};

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

            // 2. 檔案選擇後的處理 (核心閱卷流程)
            el.fileImg.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if(!file) return;

                const isLocal = el.chkLocal && el.chkLocal.checked;
                
                showToast("正在處理影像，請稍候...", "info");

                try {
                    let images = [];
                    if (file.type === 'application/pdf') {
                        images = await convertPdfToImages(file);
                    } else {
                        const base64 = await fileToBase64(file);
                        const raw = base64.split(',')[1];
                        images = [raw];
                    }

                    const BATCH_SIZE = 1; 
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

                        // 處理回傳結果
                        if (results && results.length > 0) {
                            const result = results[0];
                            
                            if (result.debugImage && el.previewImg) {
                                el.previewImg.src = result.debugImage;
                            } else if (el.previewImg) {
                                el.previewImg.src = "data:image/jpeg;base64," + chunk[0];
                            }

                            // 填入辨識出的座號
                            let displaySeat = result.seat.replace('Local_', '').replace('CV_', '');
                            if (displaySeat === 'Check_Img') displaySeat = '未偵測';
                            
                            if(el.inputSeat) el.inputSeat.value = displaySeat;
                            
                            // 比對答案並生成詳細列表
                            const studentAns = result.answers || [];
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
                                            <span style="font-weight:bold; color:${isCorrect?'#2e7d32':'#c62828'}; margin-right:10px;">
                                                ${ans || "(未答)"}
                                            </span>
                                            <span style="color:#757575; font-size:0.9em;">(正解: ${correct})</span>
                                        </div>
                                    </div>
                                `;
                            });

                            if(el.detailsList) el.detailsList.innerHTML = detailsHtml;
                            if(el.errorIds) el.errorIds.innerText = errorList.join(', ');

                            if(el.modal) el.modal.style.display = 'block';

                            // 暫存當前資料
                            state.currentReviewData = {
                                seat: displaySeat,
                                errors: errorList.join(', '), 
                                rawDetails: detailsHtml,
                                answers: studentAns
                            };
                        }
                        
                        allResults = allResults.concat(results);
                        
                        if(results[0].error) {
                            showToast(`警告: ${results[0].error}`, "warning");
                        }
                    }
                    
                    showToast("閱卷完成，請確認結果", "success");

                } catch(err) {
                    console.error(err);
                    showToast("閱卷發生錯誤: " + err.message, "error");
                }
                e.target.value = '';
            });
        }

        // 3. Modal 確認按鈕
        if(el.btnConfirm) {
            el.btnConfirm.addEventListener('click', () => {
                if(!state.currentReviewData) return;
                
                const finalSeat = el.inputSeat ? el.inputSeat.value : state.currentReviewData.seat;
                const errorStr = el.errorIds ? el.errorIds.innerText : "";
                
                // 儲存答案
                if (state.currentReviewData.answers) {
                    const seatKey = String(finalSeat).trim();
                    state.studentAnswerMap[seatKey] = state.currentReviewData.answers;
                }

                // 寫入畫面
                const line = `${finalSeat}: ${errorStr}\n`;
                if(el.txtRaw) {
                    el.txtRaw.value += line;
                    el.txtRaw.scrollTop = el.txtRaw.scrollHeight;
                }
                
                if(el.statusBadge && el.txtRaw) {
                    const count = el.txtRaw.value.trim().split('\n').filter(l => l.trim() !== '').length;
                    el.statusBadge.innerText = `目前人數: ${count}`;
                }

                if(el.modal) el.modal.style.display = 'none';
                showToast(`已匯入座號 ${finalSeat} 的成績`, "success");
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

        // 5. 匯出 Excel
        if(el.btnExportExcel) {
             el.btnExportExcel.addEventListener('click', () => {
                 const hasData = Object.keys(state.studentAnswerMap || {}).length > 0;
                 
                 if(!hasData && el.txtRaw && el.txtRaw.value.trim()) {
                     return alert("偵測到舊版數據 (僅有錯題記錄)，請重新閱卷以取得完整作答明細。");
                 }
                 
                 if(!hasData) return alert("目前沒有成績資料可匯出");

                 showToast("正在準備匯出成績...", "info");
                 
                 const fullScore = parseFloat(el.inputFullScore.value) || 100;
                 // ★ 新增：取得試卷標題，若無則用預設值
                 const examTitle = el.infoTitle ? el.infoTitle.value.trim() : "測驗成績";

                 import('./scoreCalculator.js').then(module => {
                     if (module.exportGradesToExcel) {
                         // ★ 修改：多傳入 examTitle
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
}