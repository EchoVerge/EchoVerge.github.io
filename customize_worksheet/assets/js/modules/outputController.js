/**
 * assets/js/modules/outputController.js
 * V2.6 Fix: Calibrated Page Threshold (1000px)
 */

import { state } from './state.js';
import { createStudentSection, createTeacherKeySection } from './viewRenderer.js';
import { getColumnConfig } from './columnManager.js';

export function initOutputController() {
    const el = {
        btnGenerate: document.getElementById('btn-generate'),
        outputArea: document.getElementById('output-area'),
        modalPreview: document.getElementById('modal-print-preview'),
        infoTitle: document.getElementById('current-exam-title')
    };

    el.btnGenerate.addEventListener('click', async () => {
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
        el.modalPreview.style.display = 'flex';
        
        // 延遲執行計算
        setTimeout(async () => {
            if (window.MathJax && window.MathJax.typesetPromise) {
                try { await window.MathJax.typesetPromise(); } catch(e) { console.error(e); }
            }
            ensureEvenPages(); 
        }, 300); // 稍微加長等待時間，確保渲染穩定
    });
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
    // 1. A4 高度閥值設定
    // A4 (297mm) @ 96dpi = 1123px
    // 扣除上下 padding (15mm * 2 = 30mm ≈ 113px)
    // 理論可用高度 = 1010px
    // 設定 1000px 為安全閥值。超過 1000px 就視為會佔用第二頁。
    const PAGE_HEIGHT_THRESHOLD = 1000; 

    const sections = document.querySelectorAll('.student-section');
    
    sections.forEach(sec => {
        // 清除舊的 filler
        sec.querySelectorAll('.page-filler').forEach(e => e.remove());

        const height = sec.scrollHeight;
        
        // 計算頁數 (無條件進位)
        let estimatedPages = Math.ceil(height / PAGE_HEIGHT_THRESHOLD);
        if (estimatedPages === 0) estimatedPages = 1;

        console.log(`[AutoPad] 高度: ${height}, 預估頁數: ${estimatedPages}`);

        // 偶數頁檢查：如果是奇數 (1, 3, 5...)，補一頁空白
        if (estimatedPages % 2 !== 0) {
            const filler = document.createElement('div');
            filler.className = 'page-filler';
            filler.innerHTML = '&nbsp;'; // 必須有內容
            sec.appendChild(filler);
            console.log(` -> 補上空白頁 (Total: ${estimatedPages + 1})`);
        }
    });
}