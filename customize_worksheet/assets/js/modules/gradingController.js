import { state } from './state.js';
import { parseFile, fileToBase64 } from './fileHandler.js';
import { parseErrorText } from './textParser.js';
import { analyzeAnswerSheet } from './aiParser.js';

export function initGradingController() {
    const el = {
        tabs: document.querySelectorAll('.mode-tab'),
        panelQuiz: document.getElementById('panel-quiz'),
        panelError: document.getElementById('panel-error'),
        
        // 錯題速記區
        txtS: document.getElementById('txt-raw-s'),
        status: document.getElementById('s-status'),
        
        // 檔案上傳
        btnUp: document.getElementById('btn-upload-student'),
        file: document.getElementById('file-students'),
        
        // 閱卷相關
        btnCam: document.getElementById('btn-camera-grade'),
        fileImg: document.getElementById('file-grade-image'),
        modal: document.getElementById('modal-grade-result'),
        imgPrev: document.getElementById('grade-img-preview'),
        keyInput: document.getElementById('input-answer-key'),
        seatVal: document.getElementById('grade-seat-val'),
        detailList: document.getElementById('grade-details-list'),
        errDisplay: document.getElementById('grade-error-ids'),
        btnConfirm: document.getElementById('btn-confirm-grade'),
        
        // Modal 關閉鈕
        closeBtns: document.querySelectorAll('.close-modal')
    };

    // 1. 模式切換邏輯
    el.tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            el.tabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            state.mode = e.target.dataset.mode;
            el.panelQuiz.style.display = state.mode === 'quiz' ? 'block' : 'none';
            el.panelError.style.display = state.mode === 'error' ? 'block' : 'none';
        });
    });

    // 2. 錯題速記輸入監聽 (資料流入口)
    el.txtS.addEventListener('input', () => {
        const parsed = parseErrorText(el.txtS.value);
        state.students = parsed;
        el.status.textContent = parsed.length > 0 ? `✅ 已辨識 ${parsed.length} 位學生` : '尚未輸入';
        el.status.className = parsed.length > 0 ? 'status-text ok' : 'status-text';
    });

    // 3. 學生 Excel 上傳
    el.btnUp.addEventListener('click', () => el.file.click());
    el.file.addEventListener('change', async (e) => {
        try {
            const data = await parseFile(e.target.files[0]);
            state.students = data;
            el.txtS.value = `[已匯入檔案] ${e.target.files[0].name} (${data.length}人)`;
            el.status.textContent = `✅ 已載入 ${data.length} 人`;
        } catch(err) { alert(err.message); }
        e.target.value = '';
    });

    // 4. AI 拍照閱卷邏輯 (Phase 2 & 3)
    if(el.btnCam) {
        el.btnCam.addEventListener('click', () => {
            if(!state.ai.available) return alert("請先設定 AI Key");
            if(!state.questions || !state.questions.length) return alert("請先建立題庫 (Step 1)");
            
            // 自動嘗試抓取標準答案
            const keys = state.questions.map(q => {
                const text = (q.expl || "") + (q.text || "");
                // Regex 找 (A) 或 答案:A
                const m = text.match(/答案[:：\s]*([ABCDE])|[\(（]([ABCDE])[\)）]/i);
                return m ? (m[1] || m[2]).toUpperCase() : "?";
            });
            el.keyInput.value = keys.join(',');
            
            el.fileImg.click();
        });

        el.fileImg.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if(!file) return;
            
            // 開啟 Modal
            el.modal.style.display = 'flex';
            el.imgPrev.src = URL.createObjectURL(file);
            el.detailList.innerHTML = '<div style="padding:20px; text-align:center;">⏳ AI 正在閱卷中...</div>';
            el.seatVal.value = "";
            el.errDisplay.textContent = "";
            el.btnConfirm.disabled = true;
            
            try {
                const base64 = await fileToBase64(file);
                // 呼叫 AI
                const result = await analyzeAnswerSheet(base64, state.ai.model, state.ai.key, state.questions.length);
                
                el.seatVal.value = result.seat || "??";
                
                // 批改
                const wrongs = gradePaper(result.answers, el.keyInput.value);
                el.errDisplay.textContent = wrongs.length ? wrongs.join(', ') : "全對";
                el.btnConfirm.disabled = false;
                
            } catch(err) { 
                alert("閱卷失敗: " + err.message); 
                el.modal.style.display = 'none'; 
            }
            e.target.value = '';
        });

        // 當標準答案修改時重批
        el.keyInput.addEventListener('input', () => {
            const savedAns = el.detailList.dataset.stuAns;
            if(savedAns) {
                const wrongs = gradePaper(JSON.parse(savedAns), el.keyInput.value);
                el.errDisplay.textContent = wrongs.length ? wrongs.join(', ') : "全對";
            }
        });

        // 確認匯入 (Phase 3 整合點)
        el.btnConfirm.addEventListener('click', () => {
            const seat = el.seatVal.value.trim();
            const errs = el.errDisplay.textContent.trim();
            if(!seat) return alert("請輸入座號");

            // 格式化資料
            const errStr = (errs === "全對" || errs === "無錯題") ? "" : errs;
            const line = `${seat}: ${errStr}`;
            
            // 寫入文字框
            const curVal = el.txtS.value;
            el.txtS.value = curVal + (curVal && !curVal.endsWith('\n') ? '\n' : '') + line;
            
            // 觸發解析
            el.txtS.dispatchEvent(new Event('input'));
            
            el.modal.style.display = 'none';
        });

        // 關閉 Modal
        el.closeBtns.forEach(b => b.addEventListener('click', () => el.modal.style.display = 'none'));
    }
}

// 批改 helper
function gradePaper(stuAns, keyStr) {
    document.getElementById('grade-details-list').dataset.stuAns = JSON.stringify(stuAns);
    const keys = keyStr.split(/[,，\s]+/);
    let html = '<table style="width:100%; font-size:13px; border-collapse:collapse;"><thead><tr style="background:#f5f5f5;"><th style="padding:5px;">題</th><th>標</th><th>生</th><th>判</th></tr></thead><tbody>';
    
    const wrongs = [];
    state.questions.forEach((q, i) => {
        const k = keys[i] ? keys[i].toUpperCase() : "?";
        const s = stuAns[i+1] ? stuAns[i+1].toUpperCase() : "-";
        const isWrong = k !== "?" && s !== k;
        if(isWrong) wrongs.push(q.id);
        
        html += `<tr style="border-bottom:1px solid #eee; background:${isWrong?'#ffebee':''}">
            <td style="text-align:center;">${q.id}</td>
            <td style="text-align:center; font-weight:bold; color:#1565c0;">${k}</td>
            <td style="text-align:center;">${s}</td>
            <td style="text-align:center;">${isWrong?'❌':(k==='?'?'❓':'✅')}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('grade-details-list').innerHTML = html;
    return wrongs;
}