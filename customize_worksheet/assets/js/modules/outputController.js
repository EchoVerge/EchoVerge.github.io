/**
 * assets/js/modules/outputController.js
 * V2.1: 輸出時改為「顯示預覽視窗」，並將確認列印的控制權交給 Modal
 */

import { state } from './state.js';
import { createStudentSection, createTeacherKeySection } from './viewRenderer.js';
import { getColumnConfig } from './columnManager.js';

export function initOutputController() {
    const el = {
        btnGenerate: document.getElementById('btn-generate'),
        outputArea: document.getElementById('output-area'),
        modalPreview: document.getElementById('modal-print-preview'), // [新增]
        chkTeacherKey: document.getElementById('chk-teacher-key')
    };

    // 1. 生成個別化訂正試卷
    el.btnGenerate.addEventListener('click', async () => {
        const defaultTitle = "訂正學習單";
        const title = prompt("請輸入訂正卷標題：", defaultTitle);
        if (title === null) return;

        const config = {
            title: title || defaultTitle,
            columns: getColumnConfig(),
            pageBreak: true
        };
        
        el.outputArea.innerHTML = '';
        
        const dataToPrint = prepareData();
        
        if(!dataToPrint.length) return alert("無資料可生成 (請確認Step 2是否有輸入錯題資料)");

        // 1. 填入內容
        dataToPrint.forEach(d => {
            el.outputArea.innerHTML += createStudentSection(d.student, d.qList, config);
        });

        if(el.chkTeacherKey && el.chkTeacherKey.checked) {
            const allQMap = new Map();
            dataToPrint.forEach(d => {
                d.qList.forEach(q => allQMap.set(q.id, q));
            });
            const allQs = Array.from(allQMap.values());
            if(allQs.length > 0) {
                el.outputArea.innerHTML += createTeacherKeySection(allQs);
            }
        }

        // 2. 顯示預覽視窗
        el.modalPreview.style.display = 'flex';
        
        // 3. 處理樣式與公式
        if (window.MathJax && window.MathJax.typesetPromise) {
            try { await window.MathJax.typesetPromise(); } catch(e) { console.error(e); }
        }
        ensureEvenPages(); 
    });
}

// 資料準備邏輯
function prepareData() {
    const qMap = {};
    if (state.questions) {
        state.questions.forEach(q => qMap[String(q.id).trim()] = q);
    }
    
    let result = [];
    if(!state.students || !state.students.length) return [];

    state.students.forEach(s => {
        let errIds = [];
        if (Array.isArray(s.errors)) {
            errIds = s.errors;
        } else if (typeof s.errors === 'string') {
            errIds = s.errors.split(/[,;]/).map(x => x.trim());
        } else if (s['錯題列表']) { 
            errIds = String(s['錯題列表']).split(/[,;]/).map(x => x.trim());
        }

        const qList = [];
        errIds.forEach(eid => {
            const q = qMap[String(eid).trim()];
            if(q) qList.push(q);
        });

        if(qList.length > 0) {
            result.push({ student: s, qList: qList });
        }
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