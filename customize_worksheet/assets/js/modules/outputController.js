/**
 * assets/js/modules/outputController.js
 * V2.7 Fix: Auto-sync student data from AnswerMap or TextArea before generation
 */

import { state } from './state.js';
import { createStudentSection, createTeacherKeySection } from './viewRenderer.js';
import { getColumnConfig } from './columnManager.js';

export function initOutputController() {
    const el = {
        btnGenerate: document.getElementById('btn-generate'),
        outputArea: document.getElementById('output-area'),
        modalPreview: document.getElementById('modal-print-preview'),
        infoTitle: document.getElementById('current-exam-title'),
        txtRaw: document.getElementById('txt-raw-s') // 用於 Fallback 讀取
    };

    if (!el.btnGenerate) return;

    el.btnGenerate.addEventListener('click', async () => {
        // [關鍵修正] 生成前先同步資料
        synchronizeStudentData(el.txtRaw);

        const baseTitle = el.infoTitle ? el.infoTitle.value.trim() : "測驗卷";
        const defaultTitle = `${baseTitle} - 訂正學習單`;
        
        const title = prompt("請確認訂正卷標題：", defaultTitle);
        if (title === null) return;

        const config = {
            title: title || defaultTitle,
            columns: getColumnConfig(),
            pageBreak: true
        };
        
        el.outputArea.innerHTML = '';
        const dataToPrint = prepareData();
        
        if(!dataToPrint.length) return alert("無資料可生成 (請確認是否有輸入錯題資料)");

        dataToPrint.forEach(d => {
            el.outputArea.innerHTML += createStudentSection(d.student, d.qList, config);
        });

        // 顯示預覽
        if(el.modalPreview) el.modalPreview.style.display = 'flex';
        
        // 延遲執行 MathJax 與 分頁計算
        setTimeout(async () => {
            if (window.MathJax && window.MathJax.typesetPromise) {
                try { await window.MathJax.typesetPromise(); } catch(e) { console.error(e); }
            }
            ensureEvenPages(); 
        }, 300); 
    });
}

/**
 * [新增] 資料同步函式
 * 將 studentAnswerMap 或 txtRaw 轉換為 state.students 標準格式
 */
function synchronizeStudentData(txtRawEl) {
    // 優先使用閱卷系統的完整資料 (Map)
    if (state.studentAnswerMap && Object.keys(state.studentAnswerMap).length > 0 && state.questions) {
        const students = [];
        
        // 取得 Answer Key (標準答案)
        const keys = state.questions.map(q => {
             // 兼容各種答案格式
             if (q.ans) return q.ans.toUpperCase().replace(/\s/g,'');
             const m = ((q.expl||"")+(q.text||"")).match(/答案[:：\s]*([ABCDE])|[\(（]([ABCDE])[\)）]/i);
             return m ? (m[1]||m[2]).toUpperCase() : "";
        });

        // 遍歷所有學生的作答
        Object.keys(state.studentAnswerMap).forEach(seat => {
            const answers = state.studentAnswerMap[seat];
            const errorIds = []; // 存放該學生的錯題 ID (Question ID)

            state.questions.forEach((q, idx) => {
                const correct = keys[idx] || "";
                const studentAns = (answers[idx] || "").trim().toUpperCase().replace(/\s/g,'');
                
                // 比對答案 (若不一致則視為錯題)
                if (correct && studentAns !== correct) {
                    errorIds.push(q.id); // 使用題目本身的 ID
                }
            });

            if (errorIds.length > 0) {
                students.push({
                    id: seat,         // 座號
                    name: seat,       // 暫時用座號當名字
                    errors: errorIds  // 錯題 ID 陣列
                });
            }
        });
        
        state.students = students;
        console.log("已從 AnswerMap 同步學生資料:", students.length, "筆");
        return;
    }

    // Fallback: 如果沒有 Map，嘗試解析文字框 (舊版邏輯)
    if (txtRawEl && txtRawEl.value.trim()) {
        const lines = txtRawEl.value.trim().split('\n');
        const students = [];
        
        lines.forEach(line => {
            // 格式預期: "01: 1, 5, 8"
            const parts = line.split(/[:：]/);
            if(parts.length < 2) return;
            
            const seat = parts[0].trim();
            // 切割並過濾空值
            const errs = parts[1].split(/[,;]/).map(x => x.trim()).filter(x => x);
            
            if (errs.length > 0) {
                students.push({
                    id: seat,
                    name: seat,
                    errors: errs
                });
            }
        });
        
        state.students = students;
        console.log("已從文字框同步學生資料:", students.length, "筆");
    }
}

function prepareData() {
    const qMap = {};
    if (state.questions) state.questions.forEach(q => qMap[String(q.id).trim()] = q);
    
    let result = [];
    if(!state.students || !state.students.length) return [];

    state.students.forEach(s => {
        let errIds = [];
        if (Array.isArray(s.errors)) errIds = s.errors;
        else if (typeof s.errors === 'string') errIds = s.errors.split(/[,;]/).map(x => x.trim());
        // 兼容舊版欄位
        else if (s['錯題列表']) errIds = String(s['錯題列表']).split(/[,;]/).map(x => x.trim());

        const qList = [];
        errIds.forEach(eid => {
            // 確保型別轉換一致 (轉字串比對)
            const q = qMap[String(eid).trim()];
            if(q) qList.push(q);
        });

        if(qList.length > 0) result.push({ student: s, qList: qList });
    });
    return result;
}

function ensureEvenPages() {
    const PAGE_HEIGHT_THRESHOLD = 1000; 

    const sections = document.querySelectorAll('.student-section');
    
    sections.forEach(sec => {
        sec.querySelectorAll('.page-filler').forEach(e => e.remove());
        const height = sec.scrollHeight;
        
        let estimatedPages = Math.ceil(height / PAGE_HEIGHT_THRESHOLD);
        if (estimatedPages === 0) estimatedPages = 1;

        if (estimatedPages % 2 !== 0) {
            const filler = document.createElement('div');
            filler.className = 'page-filler';
            filler.innerHTML = '&nbsp;'; 
            sec.appendChild(filler);
        }
    });
}