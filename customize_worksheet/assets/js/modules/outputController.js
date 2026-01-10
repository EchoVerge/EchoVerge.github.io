/**
 * assets/js/modules/outputController.js
 * V2.2: 生成補救卷時，使用 Info Bar 的標題作為預設值
 */

import { state } from './state.js';
import { createStudentSection, createTeacherKeySection } from './viewRenderer.js';
import { getColumnConfig } from './columnManager.js';

export function initOutputController() {
    const el = {
        btnGenerate: document.getElementById('btn-generate'),
        outputArea: document.getElementById('output-area'),
        modalPreview: document.getElementById('modal-print-preview'),
        infoTitle: document.getElementById('current-exam-title') // [新] 參照資訊列
    };

    el.btnGenerate.addEventListener('click', async () => {
        // [修改] 讀取資訊列標題，並加上「(訂正)」字尾
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

        // 檢查是否需要同步顯示教師卷 (需從 DOM 獲取，或根據需求移除，這裡保留相容性)
        // 由於新版分頁設計沒有 chk-teacher-key，通常訂正卷不需要同步印所有題目的詳解
        // 若需要，可在此擴充

        el.modalPreview.style.display = 'flex';
        
        if (window.MathJax && window.MathJax.typesetPromise) {
            try { await window.MathJax.typesetPromise(); } catch(e) { console.error(e); }
        }
        ensureEvenPages(); 
    });
}

// ... (以下 Helper Function 保持不變) ...
function prepareData() {
    const qMap = {};
    if (state.questions) state.questions.forEach(q => qMap[String(q.id).trim()] = q);
    
    let result = [];
    if(!state.students || !state.students.length) return [];

    state.students.forEach(s => {
        let errIds = [];
        if (Array.isArray(s.errors)) errIds = s.errors;
        else if (typeof s.errors === 'string') errIds = s.errors.split(/[,;]/).map(x => x.trim());
        else if (s['錯題列表']) errIds = String(s['錯題列表']).split(/[,;]/).map(x => x.trim());

        const qList = [];
        errIds.forEach(eid => {
            const q = qMap[String(eid).trim()];
            if(q) qList.push(q);
        });

        if(qList.length > 0) result.push({ student: s, qList: qList });
    });
    return result;
}

function ensureEvenPages() {
    document.querySelectorAll('.page-filler').forEach(e => e.remove());
    const PAGE_HEIGHT_THRESHOLD = 1000; 
    const sections = document.querySelectorAll('.student-section');
    sections.forEach(sec => {
        const height = sec.scrollHeight;
        const estimatedPages = Math.ceil(height / PAGE_HEIGHT_THRESHOLD);
        if (estimatedPages % 2 !== 0) {
            const filler = document.createElement('div');
            filler.className = 'page-filler';
            filler.style.pageBreakBefore = 'always';
            filler.style.height = '1px';
            filler.innerHTML = '&nbsp;'; 
            sec.appendChild(filler);
        }
    });
}