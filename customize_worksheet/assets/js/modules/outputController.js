/**
 * assets/js/modules/outputController.js
 * V1.1: 加入空值檢查，支援精簡版 Step 2
 */

import { state } from './state.js';
import { createStudentSection, createTeacherKeySection, refreshMathJax } from './viewRenderer.js';
import { createAnswerSheet } from './answerSheetRenderer.js';
import { getColumnConfig } from './columnManager.js';

export function initOutputController() {
    const el = {
        btnGenerate: document.getElementById('btn-generate'),
        btnAnswerSheet: document.getElementById('btn-answer-sheet'),
        btnPrint: document.getElementById('btn-print'),
        outputArea: document.getElementById('output-area'),
        inputTitle: document.getElementById('input-title'),
        chkPageBreak: document.getElementById('chk-page-break'),
        chkTeacherKey: document.getElementById('chk-teacher-key'),
        // [修改] 下面這兩個元素在精簡版可能不存在，允許為 null
        chkRandomize: document.getElementById('chk-randomize'),
        inputRange: document.getElementById('input-range')
    };

    // 1. 生成文件
    el.btnGenerate.addEventListener('click', async () => {
        const config = {
            title: el.inputTitle.value,
            columns: getColumnConfig(),
            pageBreak: el.chkPageBreak.checked
        };
        
        el.outputArea.innerHTML = '';
        
        // [修改] 安全讀取 (若元素不存在則給預設值)
        const rangeVal = el.inputRange ? el.inputRange.value : '';
        const isRandom = el.chkRandomize ? el.chkRandomize.checked : false;

        const dataToPrint = prepareData(rangeVal, isRandom);
        
        if(!dataToPrint.length) return alert("無資料可生成 (請確認題庫是否有題目，或錯題列表是否有內容)");

        dataToPrint.forEach(d => {
            el.outputArea.innerHTML += createStudentSection(d.student, d.qList, config);
        });

        if(el.chkTeacherKey.checked) {
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
        
        if (window.MathJax && window.MathJax.typesetPromise) {
            try { await window.MathJax.typesetPromise(); } catch(e) { console.error(e); }
        }
        
        ensureEvenPages(); 
    });

    // 2. 生成答案卡
    if(el.btnAnswerSheet) {
        el.btnAnswerSheet.addEventListener('click', () => {
            if(!state.questions || !state.questions.length) return alert("無題目");
            const html = createAnswerSheet(el.inputTitle.value, state.questions.length);
            el.outputArea.innerHTML = html;
            el.btnPrint.style.display = 'none'; 
            setTimeout(() => { if(confirm("預覽已生成！是否列印？")) window.print(); }, 500);
        });
    }

    // 3. 列印
    el.btnPrint.addEventListener('click', () => window.print());
}

// 資料準備邏輯
function prepareData(rangeStr, isRandom) {
    const qMap = {};
    state.questions.forEach(q => qMap[String(q.id).trim()] = q);
    
    let result = [];

    // 若強制為 error 模式，此區塊實際上不會執行，但保留邏輯以防未來擴充
    if(state.mode === 'quiz') {
        let selectedQs = [];
        const range = rangeStr.trim();
        if (!range) {
            selectedQs = [...state.questions];
        } else {
            const targetIds = new Set();
            const parts = range.split(/[,;，]/);
            parts.forEach(p => {
                p = p.trim();
                if(p.includes('-')) {
                    const [start, end] = p.split('-').map(Number);
                    if(!isNaN(start) && !isNaN(end)) {
                        for(let i=start; i<=end; i++) targetIds.add(String(i));
                    }
                } else {
                    if(p) targetIds.add(p);
                }
            });
            selectedQs = state.questions.filter(q => targetIds.has(String(q.id).trim()));
        }

        if (selectedQs.length === 0) return [];
        if (isRandom) selectedQs.sort(() => Math.random() - 0.5);

        result.push({ 
            student: { name: '________' }, 
            qList: selectedQs 
        });

    } else {
        // --- 錯題訂正模式 ---
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
                if(isRandom) qList.sort(() => Math.random() - 0.5);
                result.push({ student: s, qList: qList });
            }
        });
    }
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