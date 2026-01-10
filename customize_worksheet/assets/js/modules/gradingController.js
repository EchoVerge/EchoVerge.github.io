/**
 * assets/js/modules/gradingController.js
 * 負責 Step 2: 學生資料、錯題速記、答案卡生成、AI 閱卷
 * [Phase 3 整合核心]：將閱卷結果寫入 txtRawS 並觸發 state 更新
 */

import { state } from './state.js';
import { parseFile, fileToBase64 } from './fileHandler.js';
import { parseErrorText } from './textParser.js';
import { analyzeAnswerSheet } from './aiParser.js';

export function initGradingController() {
    const el = {
        // 面板切換
        tabs: document.querySelectorAll('.mode-tab'),
        panelQuiz: document.getElementById('panel-quiz'),
        panelError: document.getElementById('panel-error'),
        
        // 錯題速記區 (這就是 Phase 3 的核心橋樑)
        txtS: document.getElementById('txt-raw-s'),
        status: document.getElementById('s-status'),
        
        // 檔案上傳
        btnUp: document.getElementById('btn-upload-student'),
        file: document.getElementById('file-students'),
        
        // 閱卷相關 DOM
        btnCam: document.getElementById('btn-camera-grade'),
        fileImg: document.getElementById('file-grade-image'),
        modal: document.getElementById('modal-grade-result'),
        imgPrev: document.getElementById('grade-img-preview'),
        keyInput: document.getElementById('input-answer-key'),
        seatVal: document.getElementById('grade-seat-val'),
        detailList: document.getElementById('grade-details-list'),
        errDisplay: document.getElementById('grade-error-ids'),
        btnConfirm: document.getElementById('btn-confirm-grade') // 確認匯入按鈕
    };

    // 1. 模式切換監聽
    el.tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            el.tabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            state.mode = e.target.dataset.mode;
            
            // UI 切換
            el.panelQuiz.style.display = state.mode === 'quiz' ? 'block' : 'none';
            el.panelError.style.display = state.mode === 'error' ? 'block' : 'none';
            
            // 如果切換到錯題模式，重新觸發一次解析檢查
            if(state.mode === 'error') {
                el.txtS.dispatchEvent(new Event('input'));
            }
        });
    });

    // 2. 錯題速記輸入監聽 (這是資料流入 state 的入口)
    el.txtS.addEventListener('input', () => {
        const parsed = parseErrorText(el.txtS.value);
        state.students = parsed;
        
        // 更新狀態文字
        if (parsed.length > 0) {
            el.status.textContent = `✅ 已辨識 ${parsed.length} 位學生的錯題資料`;
            el.status.className = 'status-text ok';
        } else {
            el.status.textContent = '尚未輸入資料';
            el.status.className = 'status-text';
        }
    });

    // 3. 學生 Excel 上傳
    el.btnUp.addEventListener('click', () => el.file.click());
    el.file.addEventListener('change', async (e) => {
        try {
            const data = await parseFile(e.target.files[0]);
            state.students = data;
            // 將檔案內容「反向」填入文字框，讓使用者看得到也能修
            el.txtS.value = `[已匯入檔案] ${e.target.files[0].name} (${data.length}人)`;
            el.status.textContent = `✅ 已載入 ${data.length} 人`;
            el.status.className = 'status-text ok';
        } catch(err) { alert(err.message); }
        e.target.value = '';
    });

    // ==========================================
    // Phase 2: AI 閱卷邏輯
    // ==========================================
    
    // A. 點擊拍照閱卷
    if(el.btnCam) {
        el.btnCam.addEventListener('click', () => {
            // 防呆檢查
            if(!state.ai.available) return alert("請先在右上角設定 AI Key，才能使用閱卷功能！");
            if(!state.questions || !state.questions.length) return alert("請先在步驟 1 建立題庫，系統需要知道有幾題。");
            
            // 自動萃取標準答案 (從題目解析中找 "答案(A)" 或 "Ans: B")
            const keys = state.questions.map(q => {
                // 寬容的 Regex：找 (A)~(E) 或 答案:A
                const m = (q.expl + " " + q.text).match(/答案[:：\s]*([ABCDE])|[\(（]([ABCDE])[\)）]/i);
                return m ? (m[1] || m[2]).toUpperCase() : "?";
            });
            el.keyInput.value = keys.join(','); // 填入輸入框供老師校對
            
            // 開啟檔案選擇
            el.fileImg.click();
        });

        // B. 圖片上傳後處理
        el.fileImg.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if(!file) return;
            
            // UI 重置
            el.modal.style.display = 'flex';
            el.imgPrev.src = URL.createObjectURL(file);
            el.detailList.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">🤖 AI 正在用力看你的考卷...<br>請稍候...</div>';
            el.gradeSeatVal.value = "";
            el.gradeErrorIds.textContent = "";
            el.btnConfirm.disabled = true;
            
            try {
                // 轉 Base64
                const base64 = await fileToBase64(file);
                // 呼叫 Gemini
                const result = await analyzeAnswerSheet(base64, state.ai.model, state.ai.key, state.questions.length);
                
                // 填入辨識結果
                el.gradeSeatVal.value = result.seat || "??";
                
                // 執行批改 (比對 inputAnswerKey)
                const wrongIds = gradePaper(result.answers, el.inputAnswerKey.value);
                el.gradeErrorIds.textContent = wrongIds.length > 0 ? wrongIds.join(', ') : "無錯題 (全對)";
                el.btnConfirm.disabled = false; // 允許匯入
                
            } catch(e) { 
                alert("閱卷失敗: " + e.message); 
                el.modal.style.display = 'none'; 
            }
            e.target.value = '';
        });
        
        // 監聽標準答案修改 (即時重批)
        el.keyInput.addEventListener('input', () => {
            // 從 DOM data 屬性取回學生答案 (暫存)
            const savedStuAns = el.detailList.dataset.stuAns;
            if(savedStuAns) {
                const wrongIds = gradePaper(JSON.parse(savedStuAns), el.keyInput.value);
                el.gradeErrorIds.textContent = wrongIds.length > 0 ? wrongIds.join(', ') : "無錯題";
            }
        });

        // ==========================================
        // Phase 3: 整合 (資料橋接)
        // ==========================================
        el.btnConfirm.addEventListener('click', () => {
            const seat = el.gradeSeatVal.value.trim();
            const errors = el.gradeErrorIds.textContent.trim();
            
            if(!seat) return alert("座號不可為空！");
            
            // 處理「全對」的情況 (不需記錄，或記錄為空)
            const errorRecord = (errors === "無錯題" || errors === "無錯題 (全對)") ? "" : errors;

            // 1. 構建字串格式: "座號: 錯題1, 錯題2"
            const line = `${seat}: ${errorRecord}`;
            
            // 2. 寫入文字框 (Append)
            // 為了美觀，如果文字框原本有內容且最後不是換行，加一個換行
            const currentText = el.txtS.value;
            const separator = (currentText.length > 0 && !currentText.endsWith('\n')) ? '\n' : '';
            el.txtS.value += separator + line;
            
            // 3. ★ 關鍵步驟：觸發 Input 事件 ★
            // 這會通知上方的監聽器去跑 textParser，進而更新 state.students
            el.txtS.dispatchEvent(new Event('input')); 
            
            // 4. 關閉視窗並給予回饋
            el.modal.style.display = 'none';
            
            // 視覺回饋：讓文字框閃一下
            el.txtS.style.backgroundColor = "#e8f5e9"; // 淺綠色
            setTimeout(() => el.txtS.style.backgroundColor = "", 500);
        });
    }
}

/**
 * 批改邏輯 helper
 * @param {Object} stuAns 學生的答案物件 {'1':'A', '2':'B'}
 * @param {String} keyStr 標準答案字串 "A,B,C..."
 */
function gradePaper(stuAns, keyStr) {
    // 暫存學生答案到 DOM，方便修改標準答案時重算
    document.getElementById('grade-details-list').dataset.stuAns = JSON.stringify(stuAns);

    const keys = keyStr.split(/[,，\s]+/); // 支援逗號或空格分隔
    let html = '<table style="width:100%; font-size:13px; border-collapse:collapse;"><thead><tr style="background:#f5f5f5; border-bottom:2px solid #ddd;"><th style="padding:5px;">題號</th><th>標準</th><th>學生</th><th>判定</th></tr></thead><tbody>';
    
    const wrongs = [];
    
    // 依據「題庫數量」進行迴圈，避免標準答案長度不對
    state.questions.forEach((q, i) => {
        const qNum = i + 1;
        const k = keys[i] ? keys[i].toUpperCase() : "?";
        const s = stuAns[qNum] ? stuAns[qNum].toUpperCase() : "-"; // 未作答顯示 -
        
        let status = "";
        let rowStyle = "";

        if (k === "?") {
            status = "❓"; // 無標準答案
        } else if (s === k) {
            status = "✅";
        } else {
            status = "❌";
            rowStyle = "background-color: #ffebee;"; // 紅色底
            wrongs.push(q.id); // 加入錯題 ID
        }

        html += `
            <tr style="border-bottom:1px solid #eee; ${rowStyle}">
                <td style="text-align:center; padding:4px;">${q.id}</td>
                <td style="text-align:center; font-weight:bold; color:#1565c0;">${k}</td>
                <td style="text-align:center;">${s}</td>
                <td style="text-align:center;">${status}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    document.getElementById('grade-details-list').innerHTML = html;
    
    return wrongs; // 回傳錯題 ID 陣列
}