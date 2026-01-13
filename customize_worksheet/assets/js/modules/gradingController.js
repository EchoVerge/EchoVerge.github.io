/**
 * assets/js/modules/gradingController.js
 * V3.1 (Tab Layout): 簡化版，只負責 Tab 3 的閱卷功能
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

    // 4. 批次閱卷 (保持不變)
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

    // 6. Export as Excel
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
        const scorePerQ = fullScore / (qCount || 1);
        const mode = el.selScoringMode?.value || 'strict';

        // 準備 Excel 資料列
        const excelRows = [];

        // 資料來源有兩種：
        // 1. state.gradedData (AI 閱卷或是完整記錄，包含原始答案) -> 支援部分給分
        // 2. state.students (僅包含錯題 ID) -> 僅支援全對或全錯(或送分)
        
        // 優先使用 gradedData
        const sourceData = (state.gradedData.length > 0) ? state.gradedData : state.students;

        sourceData.forEach((student, idx) => {
            let totalScore = 0;
            let correctCount = 0;
            let details = {}; // 紀錄每題得分狀況

            // 遍歷每一題計算分數
            state.questions.forEach((q, qIdx) => {
                const qNum = qIdx + 1;
                const qKey = q.ans || "";
                
                // 取得學生答案
                let stuAns = "";
                if (student.rawAnswers) {
                    // 來源 1: 有原始答案
                    stuAns = student.rawAnswers[qIdx] || "";
                } else {
                    // 來源 2: 只有錯題 ID (parseErrorText 產生的格式通常是 {id, errors: [1, 5]})
                    // 如果該題 ID 不在 errors 陣列中，假設為全對(與 Key 相同)；若在，假設為空或錯誤
                    const isError = student.errors && student.errors.includes(String(q.id));
                    stuAns = isError ? "X" : qKey; 
                    // 注意：純錯題模式下，無法做多選部分給分，只能全扣
                }

                // 使用核心計分模組
                const ratio = calculateScoreRatio(stuAns, qKey, q, mode);
                const qScore = ratio * scorePerQ;
                
                totalScore += qScore;
                if (ratio === 1) correctCount++;

                details[`Q${qNum}`] = `${stuAns} (${parseFloat(qScore.toFixed(1))})`;
            });

            // 建立 Excel Row
            excelRows.push({
                '座號/姓名': student.seat || student.id || `User_${idx+1}`,
                '總分': Math.round(totalScore * 10) / 10, // 四捨五入到小數一位
                '答對題數': correctCount,
                ...details // 展開每題詳情
            });
        });

        // 產生 Excel
        const ws = XLSX.utils.json_to_sheet(excelRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "成績表");
        
        // 檔名加入時間
        const timeStr = new Date().toISOString().slice(0,10);
        XLSX.writeFile(wb, `成績匯出_${timeStr}.xlsx`);
    }
}

function gradePaper(stuAns, keyStr, render = true) {
    const keys = keyStr.split(/[,，\s]+/);
    const wrongs = [];
    let html = '<table style="width:100%; font-size:13px; border-collapse:collapse;"><thead><tr style="background:#f5f5f5;"><th style="padding:5px;">題</th><th>標</th><th>生</th><th>判</th></tr></thead><tbody>';
    state.questions.forEach((q, i) => {
        const k = keys[i] ? keys[i].toUpperCase() : "?";
        let s = "-";
        if (Array.isArray(stuAns)) s = (stuAns[i] || "-").toUpperCase();
        else s = (stuAns[i+1] || stuAns[String(i+1)] || "-").toUpperCase();
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