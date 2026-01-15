/**
 * assets/js/modules/gradingController.js
 * V3.3: Excel 匯出格式優化 (三層表頭：資訊/配分/正確答案)
 */

import { state } from './state.js';
import { parseFile, fileToBase64 } from './fileHandler.js';
import { parseErrorText } from './textParser.js';
import { analyzeAnswerSheetBatch } from './aiParser.js'; 
import { calculateScoreRatio, ScoringModes } from './scoreCalculator.js';

export function initGradingController() {
    state.gradedData = []; 
    
    const el = {
        txtS: document.getElementById('txt-raw-s'),
        statusBadge: document.getElementById('s-status-badge'),
        
        btnUp: document.getElementById('btn-upload-student'),
        file: document.getElementById('file-students'),
        btnCam: document.getElementById('btn-camera-grade'),
        fileImg: document.getElementById('file-grade-image'),
        
        // Modals
        modal: document.getElementById('modal-grade-result'),
        imgPrev: document.getElementById('grade-img-preview'),
        keyInput: document.getElementById('input-answer-key'),
        seatVal: document.getElementById('grade-seat-val'),
        detailList: document.getElementById('grade-details-list'),
        errDisplay: document.getElementById('grade-error-ids'),
        btnConfirm: document.getElementById('btn-confirm-grade'),
        closeBtns: document.querySelectorAll('.close-modal'),

        // Score Handler
        btnExportExcel: document.getElementById('btn-export-excel'),
        selScoringMode: document.getElementById('sel-scoring-mode'),
        inputFullScore: document.getElementById('input-full-score')
    };

    // 1. 加入校對按鈕 (動態)
    if (el.txtS) {
        const btnReview = document.createElement('button');
        btnReview.id = 'btn-review-grading';
        btnReview.className = 'btn-tool';
        btnReview.style.cssText = 'background:#ff9800; color:white; display:none; margin-left:10px;';
        btnReview.textContent = '🔍 校對模式';
        
        // 插入到工具列
        const toolbar = document.querySelector('.grading-toolbar');
        if(toolbar) toolbar.appendChild(btnReview);

        btnReview.addEventListener('click', () => {
            if (state.gradedData.length === 0) return alert("無閱卷資料");
            openReviewModal(0);
        });
    }

    // 2. 輸入監聽 & 狀態統計
    if (el.txtS) {
        el.txtS.addEventListener('input', () => {
            const parsed = parseErrorText(el.txtS.value);
            state.students = parsed;
            if(el.statusBadge) {
                el.statusBadge.textContent = `目前人數: ${parsed.length}`;
            }
        });
    }

    // 3. Excel 上傳
    if (el.btnUp && el.file) {
        el.btnUp.addEventListener('click', () => el.file.click());
        el.file.addEventListener('change', async (e) => {
            try {
                const data = await parseFile(e.target.files[0]);
                state.students = data;
                el.txtS.value = `[檔案] ${e.target.files[0].name} (${data.length}人)`;
                el.txtS.dispatchEvent(new Event('input'));
            } catch(err) { alert(err.message); }
            e.target.value = '';
        });
    }

    // 4. 批次閱卷
    if(el.btnCam && el.fileImg) {
        el.btnCam.addEventListener('click', () => {
            if(!state.ai.available) return alert("請先設定 AI Key");
            if(!state.questions || !state.questions.length) return alert("請先建立題庫");
            
            const keys = state.questions.map(q => {
                if (q.ans) return q.ans.toUpperCase();
                const m = ((q.expl||"")+(q.text||"")).match(/答案[:：\s]*([ABCDE])|[\(（]([ABCDE])[\)）]/i);
                return m ? (m[1]||m[2]).toUpperCase() : "?";
            });
            el.keyInput.value = keys.join(',');
            el.fileImg.click();
        });

        el.fileImg.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if(!file) return;
            
            state.gradedData = []; 
            const btnReview = document.getElementById('btn-review-grading');
            if(btnReview) btnReview.style.display = 'none';
            
            el.modal.style.display = 'flex';
            el.imgPrev.src = '';
            el.btnConfirm.style.display = 'none';
            
            try {
                let images = [];
                if (file.type === 'application/pdf') {
                    el.detailList.innerHTML = '<div style="text-align:center;">📄 PDF 轉換中...</div>';
                    images = await convertPdfToImages(file, (c, t) => el.detailList.innerHTML = `📄 轉檔 ${c}/${t}...`);
                } else if (file.type.startsWith('image/')) {
                    el.detailList.innerHTML = '🖼️ 讀取圖片...';
                    images = [await fileToBase64(file)];
                } else { throw new Error("格式錯誤"); }

                const BATCH_SIZE = 3; 
                let resultsText = "";
                let successCount = 0;

                for (let i = 0; i < images.length; i += BATCH_SIZE) {
                    const chunkImages = images.slice(i, i + BATCH_SIZE);
                    const rawBase64s = chunkImages.map(img => img.split(',')[1]);

                    const progressMsg = `🤖 正在分析第 ${i+1}~${i+chunkImages.length} 頁 (共 ${images.length} 頁)...`;
                    el.detailList.innerHTML = `<div style="text-align:center; color:#1565c0; font-weight:bold;">${progressMsg}</div>`;
                    el.imgPrev.src = chunkImages[0];

                    try {
                        const results = await analyzeAnswerSheetBatch(rawBase64s, state.ai.model, state.ai.key, state.questions.length);
                        
                        if (Array.isArray(results)) {
                            results.forEach((res, idx) => {
                                const realIndex = i + idx;
                                const seat = res.seat && res.seat !== "unknown" ? res.seat : `??_${realIndex+1}`;
                                const wrongs = gradePaper(res.answers, el.keyInput.value, false);
                                const errStr = wrongs.length === 0 ? "" : wrongs.join(', ');

                                state.gradedData.push({
                                    id: realIndex,
                                    base64: chunkImages[idx],
                                    seat: seat,
                                    rawAnswers: res.answers,
                                    errors: wrongs
                                });

                                resultsText += `${seat}: ${errStr}\n`;
                                successCount++;
                            });
                        }
                    } catch (err) {
                        console.error(err);
                        resultsText += `[錯誤] 第 ${i+1}~${i+chunkImages.length} 批次失敗\n`;
                    }

                    const curVal = el.txtS.value;
                    const prefix = curVal && !curVal.endsWith('\n') ? '\n' : '';
                    el.txtS.value = curVal + prefix + resultsText;
                    resultsText = ""; 
                    el.txtS.dispatchEvent(new Event('input'));
                }

                el.detailList.innerHTML = `<div style="text-align:center; color:green;">✅ 完成！共 ${successCount} 筆。</div>`;
                el.btnConfirm.textContent = "關閉視窗";
                el.btnConfirm.style.display = 'inline-block';
                el.btnConfirm.onclick = () => { 
                    el.modal.style.display = 'none';
                    if (state.gradedData.length > 0 && btnReview) btnReview.style.display = 'inline-block';
                };

            } catch(err) { 
                alert("錯誤: " + err.message); 
                el.modal.style.display = 'none'; 
            }
            e.target.value = '';
        });

        el.closeBtns.forEach(b => b.addEventListener('click', () => el.modal.style.display = 'none'));
    }

    // 5. 校對視窗邏輯
    let currentReviewIndex = 0;
    function openReviewModal(index) {
        if (index < 0 || index >= state.gradedData.length) return;
        currentReviewIndex = index;
        const data = state.gradedData[index];
        const el = {
            modal: document.getElementById('modal-grade-result'),
            imgPrev: document.getElementById('grade-img-preview'),
            seatVal: document.getElementById('grade-seat-val'),
            keyInput: document.getElementById('input-answer-key'),
            detailList: document.getElementById('grade-details-list')
        };
        el.modal.style.display = 'flex';
        el.imgPrev.src = data.base64;
        el.seatVal.value = data.seat;
        gradePaper(data.rawAnswers, el.keyInput.value, true);

        const footer = el.modal.querySelector('.modal-footer');
        footer.innerHTML = `
            <div style="display:flex; justify-content:space-between; width:100%;">
                <button id="btn-prev-review" class="btn-secondary" ${index===0?'disabled':''}>⬅ 上一張</button>
                <div style="font-weight:bold; padding-top:8px;">${index+1} / ${state.gradedData.length}</div>
                <button id="btn-save-next" class="btn-primary">保存並下一張 ➡</button>
            </div>
        `;
        document.getElementById('btn-prev-review').onclick = () => openReviewModal(index - 1);
        document.getElementById('btn-save-next').onclick = () => {
            data.seat = el.seatVal.value;
            updateTxtSFromData();
            if (index + 1 < state.gradedData.length) openReviewModal(index + 1);
            else { alert("校對完成！"); el.modal.style.display = 'none'; }
        };
    }

    function updateTxtSFromData() {
        let text = "";
        state.gradedData.forEach(d => {
            const errStr = d.errors.length > 0 ? d.errors.join(', ') : "";
            text += `${d.seat}: ${errStr}\n`;
        });
        document.getElementById('txt-raw-s').value = text;
        document.getElementById('txt-raw-s').dispatchEvent(new Event('input'));
    }

    // 6. Export as Excel (使用新格式)
    if (el.btnExportExcel) {
        el.btnExportExcel.addEventListener('click', () => {
            if (state.gradedData.length === 0 && (!state.students || state.students.length === 0)) {
                return alert("無成績資料可匯出");
            }
            exportGradesToExcel();
        });
    }

    function exportGradesToExcel() {
        const fullScore = parseInt(el.inputFullScore?.value || 100);
        const qCount = state.questions.length;
        // 計算單題配分 (取小數點後兩位)
        const scorePerQ = parseFloat((fullScore / (qCount || 1)).toFixed(2));
        const mode = el.selScoringMode?.value || 'strict';

        // 1. 取得考卷標題 (嘗試從 input 找，找不到就用預設)
        const titleEl = document.getElementById('current-exam-title');
        const examTitle = (titleEl && titleEl.value.trim()) ? titleEl.value.trim() : "測驗成績";
        const today = new Date().toLocaleDateString();

        // 2. 準備三層 Header
        // Row 1: | 考卷名稱 | 總分 | 匯出日期 | 第一題 | 第二題 ...
        const row1 = ['考卷名稱', '總分', '匯出日期'];
        // Row 2: | (名稱)   | 100  | (日期)   | 10     | 10 ...
        const row2 = [examTitle, fullScore, today];
        // Row 3: | 座號     | 姓名 | 得分     | A      | B ... (正確答案)
        const row3 = ['座號', '姓名', '得分'];

        // 填充題目欄位 (Header 部分)
        state.questions.forEach((q, idx) => {
            row1.push(`第${idx + 1}題`);
            row2.push(scorePerQ); // 單題配分
            row3.push(q.ans || q.key || ""); // 正確答案
        });

        // 3. 準備學生資料 Rows
        const studentRows = [];
        
        // 優先使用 gradedData (AI 閱卷資料)，否則用 students (手動/Excel匯入)
        const sourceData = (state.gradedData.length > 0) ? state.gradedData : state.students;

        sourceData.forEach((student, idx) => {
            let totalScore = 0;
            const answerCols = []; // 紀錄該生每一題的填答

            state.questions.forEach((q, qIdx) => {
                const qKey = q.ans || "";
                let stuAns = "";

                if (student.rawAnswers) {
                    // 來源 1: AI 閱卷 (有原始作答)
                    stuAns = student.rawAnswers[qIdx] || "";
                } else {
                    // 來源 2: 純錯題列表 (推算)
                    const isError = student.errors && student.errors.includes(String(q.id));
                    stuAns = isError ? "X" : qKey; 
                }

                // 計算該題得分
                const ratio = calculateScoreRatio(stuAns, qKey, q, mode);
                const qScore = ratio * scorePerQ;
                
                totalScore += qScore;
                
                // 填入學生答案
                answerCols.push(stuAns);
            });

            // 座號與姓名 (若無姓名則留白)
            const seat = student.seat || student.id || `${idx+1}`;
            const name = student.name || ""; 

            studentRows.push([
                seat,
                name,
                Math.round(totalScore * 10) / 10, // 總分 (四捨五入到第一位)
                ...answerCols
            ]);
        });

        // 4. 組合所有資料 (Array of Arrays)
        const wsData = [row1, row2, row3, ...studentRows];

        // 5. 產生 Worksheet 與 Workbook
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "成績表");

        // 6. 下載檔案
        const timeStr = new Date().toISOString().slice(0,10);
        XLSX.writeFile(wb, `${examTitle}_成績匯出_${timeStr}.xlsx`);
    }
}

/**
 * 閱卷核心函式 (含正規化邏輯)
 */
function gradePaper(stuAns, keyStr, render = true) {
    const keys = keyStr.split(/[,，\s]+/);
    const wrongs = [];
    let html = '<table style="width:100%; font-size:13px; border-collapse:collapse;"><thead><tr style="background:#f5f5f5;"><th style="padding:5px;">題</th><th>標</th><th>生</th><th>判</th></tr></thead><tbody>';
    
    // 內部正規化函式：移除括號、標點、空白，只保留英數並排序
    const normalize = (str) => {
        if (!str || str === "?" || str === "-") return str;
        const matches = str.match(/[a-zA-Z0-9]/g);
        return matches ? matches.map(c => c.toUpperCase()).sort().join('') : "";
    };

    state.questions.forEach((q, i) => {
        const rawK = keys[i] || "?";
        const k = rawK === "?" ? "?" : normalize(rawK);

        let rawS = "-";
        if (Array.isArray(stuAns)) rawS = (stuAns[i] || "-");
        else rawS = (stuAns[i+1] || stuAns[String(i+1)] || "-");
        
        let s = normalize(rawS);
        if (s === "") s = "-";

        const isWrong = k !== "?" && s !== k;
        
        if(isWrong) wrongs.push(q.id);
        
        if (render) {
            html += `<tr style="border-bottom:1px solid #eee; background:${isWrong?'#ffebee':''}">
                <td style="text-align:center;">${q.id}</td>
                <td style="text-align:center; font-weight:bold; color:#1565c0;">${k}</td>
                <td style="text-align:center;">${s}</td>
                <td style="text-align:center;">${isWrong?'❌':(k==='?'?'❓':'✅')}</td>
            </tr>`;
        }
    });
    
    if (render) {
        html += '</tbody></table>';
        const listEl = document.getElementById('grade-details-list');
        if(listEl) listEl.innerHTML = html;
    }
    
    return wrongs;
}

async function convertPdfToImages(file, onProgress) {
    if (typeof pdfjsLib === 'undefined') throw new Error("PDF Library 未載入");
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    const images = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        if (onProgress) onProgress(i, pdf.numPages);
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        images.push(canvas.toDataURL('image/jpeg', 0.8));
    }
    return images;
}