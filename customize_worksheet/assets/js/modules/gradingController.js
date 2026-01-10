/**
 * assets/js/modules/gradingController.js
 * V2.1: 實作批次閱卷 (Batching) - 每 3 張圖呼叫一次 AI
 */

import { state } from './state.js';
import { parseFile, fileToBase64 } from './fileHandler.js';
import { parseErrorText } from './textParser.js';
import { analyzeAnswerSheetBatch } from './aiParser.js'; // 改用 Batch 版

export function initGradingController() {
    state.gradedData = []; 

    const el = {
        tabs: document.querySelectorAll('.mode-tab'),
        panelQuiz: document.getElementById('panel-quiz'),
        panelError: document.getElementById('panel-error'),
        txtS: document.getElementById('txt-raw-s'),
        status: document.getElementById('s-status'),
        btnUp: document.getElementById('btn-upload-student'),
        file: document.getElementById('file-students'),
        btnCam: document.getElementById('btn-camera-grade'),
        fileImg: document.getElementById('file-grade-image'),
        modal: document.getElementById('modal-grade-result'),
        imgPrev: document.getElementById('grade-img-preview'),
        keyInput: document.getElementById('input-answer-key'),
        seatVal: document.getElementById('grade-seat-val'),
        detailList: document.getElementById('grade-details-list'),
        errDisplay: document.getElementById('grade-error-ids'),
        btnConfirm: document.getElementById('btn-confirm-grade'),
        closeBtns: document.querySelectorAll('.close-modal')
    };

    // 1. 加入校對按鈕
    if (el.txtS) {
        const toolbar = document.createElement('div');
        toolbar.style.marginBottom = '5px';
        toolbar.innerHTML = `<button id="btn-review-grading" class="btn-xs" style="background:#ff9800; color:white; display:none;">🔍 校對 / 修正</button>`;
        el.txtS.parentNode.insertBefore(toolbar, el.txtS);
        document.getElementById('btn-review-grading').addEventListener('click', () => {
            if (state.gradedData.length === 0) return alert("無資料");
            openReviewModal(0);
        });
    }

    // 2. 模式切換
    if (el.tabs.length > 0) {
        el.tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                el.tabs.forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                state.mode = e.target.dataset.mode;
                if (el.panelQuiz) el.panelQuiz.style.display = state.mode === 'quiz' ? 'block' : 'none';
                if (el.panelError) el.panelError.style.display = state.mode === 'error' ? 'block' : 'none';
            });
        });
    }

    // 3. 輸入監聽
    if (el.txtS) {
        el.txtS.addEventListener('input', () => {
            const parsed = parseErrorText(el.txtS.value);
            state.students = parsed;
            el.status.textContent = parsed.length > 0 ? `✅ 已辨識 ${parsed.length} 位` : '尚未輸入';
            el.status.className = parsed.length > 0 ? 'status-text ok' : 'status-text';
        });
    }

    // 4. Excel 上傳
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

    // 5. [核心修改] 批次閱卷
    if(el.btnCam && el.fileImg) {
        el.btnCam.addEventListener('click', () => {
            if(!state.ai.available) return alert("請先設定 AI Key");
            if(!state.questions || !state.questions.length) return alert("Step 1 無題庫");
            
            // 自動抓標準答案
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
            document.getElementById('btn-review-grading').style.display = 'none';
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

                // [批次設定] 每次處理 3 張 (Gemini Flash 建議值，既省額度又準確)
                const BATCH_SIZE = 3; 
                let resultsText = "";
                let successCount = 0;

                for (let i = 0; i < images.length; i += BATCH_SIZE) {
                    // 切割出目前要處理的一批圖片
                    const chunkImages = images.slice(i, i + BATCH_SIZE);
                    const rawBase64s = chunkImages.map(img => img.split(',')[1]);

                    const progressMsg = `🤖 正在分析第 ${i+1}~${i+chunkImages.length} 頁 (共 ${images.length} 頁)...`;
                    el.detailList.innerHTML = `<div style="text-align:center; color:#1565c0; font-weight:bold;">${progressMsg}</div>`;
                    el.imgPrev.src = chunkImages[0]; // 顯示該批第一張作為代表

                    try {
                        // 呼叫 AI (傳送陣列)
                        const results = await analyzeAnswerSheetBatch(rawBase64s, state.ai.model, state.ai.key, state.questions.length);
                        
                        // 處理回傳的陣列
                        if (Array.isArray(results)) {
                            results.forEach((res, idx) => {
                                const realIndex = i + idx; // 全域索引
                                const seat = res.seat && res.seat !== "unknown" ? res.seat : `??_${realIndex+1}`;
                                const wrongs = gradePaper(res.answers, el.keyInput.value, false);
                                const errStr = wrongs.length === 0 ? "" : wrongs.join(', ');

                                // 存入暫存 (校對用)
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

                    el.txtS.value = resultsText;
                    el.txtS.dispatchEvent(new Event('input'));
                }

                el.detailList.innerHTML = `<div style="text-align:center; color:green;">✅ 完成！共 ${successCount} 筆。<br>每 3 張圖片合併為 1 次呼叫，已節省 API 用量。</div>`;
                el.btnConfirm.textContent = "關閉視窗";
                el.btnConfirm.style.display = 'inline-block';
                el.btnConfirm.onclick = () => { 
                    el.modal.style.display = 'none';
                    if (state.gradedData.length > 0) document.getElementById('btn-review-grading').style.display = 'inline-block';
                };

            } catch(err) { 
                alert("錯誤: " + err.message); 
                el.modal.style.display = 'none'; 
            }
            e.target.value = '';
        });

        el.closeBtns.forEach(b => b.addEventListener('click', () => el.modal.style.display = 'none'));
    }

    // 校對視窗邏輯
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