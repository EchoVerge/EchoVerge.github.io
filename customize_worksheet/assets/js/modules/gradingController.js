/**
 * assets/js/modules/gradingController.js
 * 閱卷控制器 - 負責協調 UI 與閱卷邏輯
 * V3.3: 修復 PDF 匯入錯誤，完整整合除錯顯示與成績校對
 */
import { state } from './state.js';
import { parseFile, fileToBase64 } from './fileHandler.js';
import { convertPdfToImages } from './fileExtractor.js'; // 必須與 fileExtractor.js 的 export 名稱一致
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
        
        // 校對 Modal 相關元件
        modal: document.getElementById('modal-grade-result'),
        previewImg: document.getElementById('grade-img-preview'),
        inputAnsKey: document.getElementById('input-answer-key'),
        inputSeat: document.getElementById('grade-seat-val'),
        detailsList: document.getElementById('grade-details-list'),
        errorIds: document.getElementById('grade-error-ids'),
        btnConfirm: document.getElementById('btn-confirm-grade'),
        
        // 為了相容性，重複定義 keyInput (AI Parser 可能會用到)
        keyInput: document.getElementById('input-answer-key') 
    };

    // 初始化事件監聽
    setupEventListeners(el);

    // --- 內部輔助函式 ---

    /**
     * 計算分數
     * (目前主要邏輯是在 Excel 匯出時計算，但這裡保留函式以備不時之需)
     */
    function calculateScore(studentAns, correctKey) {
        if (!correctKey || correctKey.length === 0) return 0;
        let correctCount = 0;
        studentAns.forEach((ans, idx) => {
            if (correctKey[idx] && ans === correctKey[idx]) correctCount++;
        });
        const scorePerQ = parseFloat(el.inputFullScore.value) / correctKey.length;
        return Math.round(correctCount * scorePerQ);
    }

    /**
     * 設定所有事件監聽器
     */
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
                // 優先使用題目物件中的 ans 屬性，若無則嘗試從解析或題目文字中 regex 抓取
                const keys = state.questions.map(q => {
                     if (q.ans) return q.ans.toUpperCase();
                     // 嘗試抓取 (A) 或 答案:A 的格式
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
                    // 根據檔案類型轉為 Base64 圖片陣列
                    if (file.type === 'application/pdf') {
                        // 呼叫 fileExtractor.js 中的函式
                        images = await convertPdfToImages(file);
                    } else {
                        const base64 = await fileToBase64(file);
                        const raw = base64.split(',')[1]; // 去除 data:image... 前綴
                        images = [raw];
                    }

                    // 批次處理設定
                    // 設定為 1，讓使用者可以逐張在 Modal 確認結果與除錯圖
                    const BATCH_SIZE = 1; 
                    let allResults = [];

                    for (let i = 0; i < images.length; i += BATCH_SIZE) {
                        const chunk = images.slice(i, i + BATCH_SIZE);
                        
                        let results;
                        if (isLocal) {
                            // [呼叫本地閱卷] - 使用 localParser.js
                            console.log("呼叫本地閱卷 (Local Analysis)...");
                            results = await analyzeAnswerSheetLocal(chunk, state.questions.length);
                        } else {
                            // [呼叫 AI 閱卷] - 使用 aiParser.js
                            console.log("呼叫 AI 閱卷 (Cloud AI)...");
                            results = await analyzeAnswerSheetBatch(chunk, state.ai.model, state.ai.key, state.questions.length);
                        }

                        // 處理回傳結果
                        if (results && results.length > 0) {
                            const result = results[0]; // 取批次中的第一張結果
                            
                            // [關鍵] 顯示除錯圖片
                            // 如果 localParser 有回傳 debugImage (帶有紅綠框的診斷圖)，優先顯示
                            if (result.debugImage && el.previewImg) {
                                console.log("顯示診斷圖片...");
                                el.previewImg.src = result.debugImage;
                            } else if (el.previewImg) {
                                // 否則顯示原圖 (AI 模式通常是原圖)
                                el.previewImg.src = "data:image/jpeg;base64," + chunk[0];
                            }

                            // 填入辨識出的座號 (移除內部代碼前綴)
                            let displaySeat = result.seat.replace('Local_', '').replace('CV_', '');
                            if (displaySeat === 'Check_Img') displaySeat = '未偵測';
                            
                            if(el.inputSeat) el.inputSeat.value = displaySeat;
                            
                            // 比對答案並生成詳細列表
                            const studentAns = result.answers || [];
                            const correctKey = state.tempAnswerKey || [];
                            
                            let errorList = []; // 存錯題 ID
                            let detailsHtml = "";
                            
                            studentAns.forEach((ans, idx) => {
                                const correct = correctKey[idx] || "?";
                                // 判斷是否正確 (忽略大小寫與前後空白)
                                const isCorrect = (ans && ans.trim().toUpperCase() === correct.trim().toUpperCase());
                                
                                if(!isCorrect) errorList.push(idx + 1); // 題號從 1 開始
                                
                                // 生成 HTML 條目
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

                            // 更新 UI
                            if(el.detailsList) el.detailsList.innerHTML = detailsHtml;
                            if(el.errorIds) el.errorIds.innerText = errorList.join(', ');

                            // 開啟 Modal 供使用者確認
                            if(el.modal) el.modal.style.display = 'block';

                            // 暫存當前資料，等待使用者按「確認並匯入」
                            state.currentReviewData = {
                                seat: displaySeat,
                                errors: errorList.join(', '), 
                                rawDetails: detailsHtml
                            };
                        }
                        
                        allResults = allResults.concat(results);
                        
                        // 如果有嚴重錯誤訊息，顯示 Toast
                        if(results[0].error) {
                            showToast(`警告: ${results[0].error}`, "warning");
                        }
                    }
                    
                    showToast("閱卷完成，請確認結果", "success");

                } catch(err) {
                    console.error(err);
                    showToast("閱卷發生錯誤: " + err.message, "error");
                }
                // 清空 input 讓同一檔案可重複選取
                e.target.value = '';
            });
        }

        // 3. Modal 中的「確認並匯入」按鈕
        if(el.btnConfirm) {
            el.btnConfirm.addEventListener('click', () => {
                if(!state.currentReviewData) return;
                
                // 取得使用者可能手動修正過的座號
                const finalSeat = el.inputSeat ? el.inputSeat.value : state.currentReviewData.seat;
                
                // 取得使用者可能手動修正過的錯題 ID (雖然目前是唯讀 span，但邏輯上應以此為主)
                const errorStr = el.errorIds ? el.errorIds.innerText : "";
                
                // 將結果寫入主畫面的 textarea (txtRaw)
                // 格式: "座號: 錯題ID, 錯題ID"
                const line = `${finalSeat}: ${errorStr}\n`;
                
                if(el.txtRaw) {
                    el.txtRaw.value += line;
                    // 自動捲動到底部
                    el.txtRaw.scrollTop = el.txtRaw.scrollHeight;
                }
                
                // 更新已閱卷人數狀態
                if(el.statusBadge && el.txtRaw) {
                    // 計算非空行數
                    const count = el.txtRaw.value.trim().split('\n').filter(l => l.trim() !== '').length;
                    el.statusBadge.innerText = `目前人數: ${count}`;
                }

                // 關閉 Modal
                if(el.modal) el.modal.style.display = 'none';
                showToast(`已匯入座號 ${finalSeat} 的成績`, "success");
            });
        }

        // 4. 通用：關閉 Modal 的按鈕 (X 或 取消)
        document.querySelectorAll('.close-modal, .close-modal-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // 尋找最近的 modal 父層或透過 data-target
                const targetId = e.target.dataset.target;
                if (targetId) {
                    const modal = document.getElementById(targetId);
                    if(modal) modal.style.display = 'none';
                } else {
                    // Fallback: 關閉最近的 modal
                    const modal = e.target.closest('.modal');
                    if(modal) modal.style.display = 'none';
                }
            });
        });

        // 5. 匯出 Excel (既有功能保留)
        if(el.btnExportExcel) {
             el.btnExportExcel.addEventListener('click', () => {
                 if(!el.txtRaw || !el.txtRaw.value.trim()) return alert("目前沒有成績資料可匯出");
                 showToast("正在準備匯出成績...", "info");
                 import('./scoreCalculator.js').then(module => {
                     if (module.exportGradesToExcel) {
                         module.exportGradesToExcel(el.txtRaw.value, state.questions.length);
                     } else {
                         alert("匯出功能模組尚未載入");
                     }
                 }).catch(err => {
                     console.error(err);
                     alert("無法載入匯出模組");
                 });
             });
        }
        
        // 6. 上傳學生成績 Excel (既有功能保留)
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