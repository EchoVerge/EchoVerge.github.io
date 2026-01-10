/**
 * assets/js/modules/outputController.js
 * V2.0: Step 3 專注於「個別化訂正學習單」
 * 標題改用 Prompt，分頁強制開啟
 */

import { state } from './state.js';
import { createStudentSection, createTeacherKeySection } from './viewRenderer.js';
import { getColumnConfig } from './columnManager.js';

export function initOutputController() {
    const el = {
        btnGenerate: document.getElementById('btn-generate'),
        btnPrint: document.getElementById('btn-print'),
        outputArea: document.getElementById('output-area'),
        // [移除] input-title, chk-page-break, btn-answer-sheet
        chkTeacherKey: document.getElementById('chk-teacher-key')
    };

    // 1. 生成個別化訂正試卷
    el.btnGenerate.addEventListener('click', async () => {
        // [Prompt] 詢問標題
        const defaultTitle = "訂正學習單";
        const title = prompt("請輸入訂正卷標題：", defaultTitle);
        if (title === null) return;

        const config = {
            title: title || defaultTitle,
            columns: getColumnConfig(),
            pageBreak: true // [重要] 強制啟用分頁
        };
        
        el.outputArea.innerHTML = '';
        
        // 準備資料 (錯題對應)
        const dataToPrint = prepareData();
        
        if(!dataToPrint.length) return alert("無資料可生成 (請確認Step 2是否有輸入錯題資料)");

        // 渲染每一位學生的訂正卷
        dataToPrint.forEach(d => {
            el.outputArea.innerHTML += createStudentSection(d.student, d.qList, config);
        });

        // 若勾選教師解答卷 (Step 3 的選項)
        if(el.chkTeacherKey && el.chkTeacherKey.checked) {
            // 收集所有出現過的錯題
            const allQMap = new Map();
            dataToPrint.forEach(d => {
                d.qList.forEach(q => allQMap.set(q.id, q));
            });
            const allQs = Array.from(allQMap.values());
            if(allQs.length > 0) {
                el.outputArea.innerHTML += createTeacherKeySection(allQs);
            }
        }

        el.btnPrint.style.display = 'inline-block';
        
        // 渲染數學公式
        if (window.MathJax && window.MathJax.typesetPromise) {
            try { await window.MathJax.typesetPromise(); } catch(e) { console.error(e); }
        }
        
        ensureEvenPages(); 
    });

    // 2. 列印
    el.btnPrint.addEventListener('click', () => window.print());
}

// 資料準備邏輯 (鎖定為錯題模式)
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