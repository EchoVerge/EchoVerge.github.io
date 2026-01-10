/**
 * assets/js/modules/outputController.js
 * 負責 Step 3: 最終產出、設定讀取、渲染 HTML
 */

import { state } from './state.js';
import { createStudentSection, createTeacherKeySection, refreshMathJax } from './viewRenderer.js';
import { createAnswerSheet } from './answerSheetRenderer.js';
import { getColumnConfig } from './columnManager.js';

export function initOutputController() {
    const el = {
        btnGenerate: document.getElementById('btn-generate'),
        btnAnswerSheet: document.getElementById('btn-answer-sheet'), // 可放在 Step 2 或 3
        btnPrint: document.getElementById('btn-print'),
        outputArea: document.getElementById('output-area'),
        inputTitle: document.getElementById('input-title'),
        chkPageBreak: document.getElementById('chk-page-break'),
        chkTeacherKey: document.getElementById('chk-teacher-key'),
        chkRandomize: document.getElementById('chk-randomize'),
        inputRange: document.getElementById('input-range')
    };

    // 1. 生成文件
    el.btnGenerate.addEventListener('click', () => {
        const config = {
            title: el.inputTitle.value,
            columns: getColumnConfig(),
            pageBreak: el.chkPageBreak.checked
        };
        
        el.outputArea.innerHTML = '';
        const dataToPrint = prepareData(el.inputRange.value, el.chkRandomize.checked);
        
        if(!dataToPrint.length) return alert("無資料可生成");

        dataToPrint.forEach(d => {
            el.outputArea.innerHTML += createStudentSection(d.student, d.qList, config);
        });

        if(el.chkTeacherKey.checked) {
            // 生成解答卷邏輯...
            // (略：收集所有題目並排序)
        }

        el.btnPrint.style.display = 'inline-block';
        refreshMathJax();
        
        // 執行雙面列印補頁邏輯 (Page Filler)
        // ensureEvenPages(); 
    });

    // 2. 生成答案卡 (Phase 1)
    if(el.btnAnswerSheet) {
        el.btnAnswerSheet.addEventListener('click', () => {
            if(!state.questions || !state.questions.length) return alert("無題目");
            const html = createAnswerSheet(el.inputTitle.value, state.questions.length);
            el.outputArea.innerHTML = html;
            el.btnPrint.style.display = 'none'; // 隱藏一般列印鈕，直接用瀏覽器列印
            setTimeout(() => { if(confirm("列印答案卡?")) window.print(); }, 500);
        });
    }

    // 3. 列印
    el.btnPrint.addEventListener('click', () => window.print());
}

// 資料準備邏輯 (從 state 提取並過濾)
function prepareData(rangeStr, isRandom) {
    const qMap = {};
    state.questions.forEach(q => qMap[String(q.id).trim()] = q);
    let result = [];

    if(state.mode === 'quiz') {
        // ... (Quiz 模式選題邏輯) ...
        // 產生一份公版
        // result.push({ student: {name:''}, qList: ... })
    } else {
        // ... (Error 模式選題邏輯) ...
        state.students.forEach(s => {
            // 解析 s['錯題列表'] -> 轉為 qList
            // result.push({ student: s, qList: ... })
        });
    }
    return result;
}