/**
 * assets/js/modules/outputController.js
 * 負責 Step 3: 最終產出、設定讀取、渲染 HTML、雙面列印補頁
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
        chkRandomize: document.getElementById('chk-randomize'),
        inputRange: document.getElementById('input-range')
    };

    // 1. 生成文件 (改為 async 以等待渲染)
    el.btnGenerate.addEventListener('click', async () => {
        const config = {
            title: el.inputTitle.value,
            columns: getColumnConfig(),
            pageBreak: el.chkPageBreak.checked
        };
        
        el.outputArea.innerHTML = '';
        
        // 呼叫資料準備函式
        const dataToPrint = prepareData(el.inputRange.value, el.chkRandomize.checked);
        
        if(!dataToPrint.length) return alert("無資料可生成 (請確認題庫是否有題目，或範圍設定是否正確)");

        // 渲染每一位學生的試卷
        dataToPrint.forEach(d => {
            el.outputArea.innerHTML += createStudentSection(d.student, d.qList, config);
        });

        // 教師解答卷
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

        // 顯示列印按鈕
        el.btnPrint.style.display = 'inline-block';
        
        // [關鍵步驟] 等待 MathJax 渲染完成，因為公式會改變高度
        if (window.MathJax && window.MathJax.typesetPromise) {
            try {
                await window.MathJax.typesetPromise();
            } catch(e) { console.error(e); }
        }
        
        // [新增] 執行雙面列印補頁邏輯
        ensureEvenPages(); 
    });

    // 2. 生成答案卡
    if(el.btnAnswerSheet) {
        el.btnAnswerSheet.addEventListener('click', () => {
            if(!state.questions || !state.questions.length) return alert("無題目");
            const html = createAnswerSheet(el.inputTitle.value, state.questions.length);
            el.outputArea.innerHTML = html;
            el.btnPrint.style.display = 'none'; 
            setTimeout(() => { if(confirm("列印答案卡?")) window.print(); }, 500);
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

    if(state.mode === 'quiz') {
        // --- 模式 A: 全班測驗 ---
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
        // --- 模式 B: 錯題訂正 ---
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

/**
 * [新增] 雙面列印補頁功能
 * 檢查每個學生的區塊高度，若是奇數頁，則補上一個強制分頁的空白頁
 */
function ensureEvenPages() {
    // 1. 清除舊的補頁元素
    document.querySelectorAll('.page-filler').forEach(e => e.remove());

    // 2. 設定一頁的有效高度閥值 (像素)
    // A4 297mm @ 96dpi 約 1123px。
    // 扣除瀏覽器列印邊距(上下各~15mm)與誤差，保守估計一頁內容約 1000px。
    // 若超過 1000px 則視為跨到第二頁。
    const PAGE_HEIGHT_THRESHOLD = 1000; 

    const sections = document.querySelectorAll('.student-section');
    
    sections.forEach(sec => {
        const height = sec.scrollHeight;
        const estimatedPages = Math.ceil(height / PAGE_HEIGHT_THRESHOLD);

        // 如果估算的頁數是奇數 (1, 3, 5...)
        if (estimatedPages % 2 !== 0) {
            // 插入一個補白元素
            const filler = document.createElement('div');
            filler.className = 'page-filler';
            // 設定樣式：強制在自己之前分頁(這樣會變成新的一頁)，並且內容空白
            // 邏輯：Section(Page1) -> append Filler -> Filler(break-before: always => Page2)
            // 這樣 Section 總共佔據了 Page1 + Page2，下一位學生就會從 Page3 開始
            filler.style.pageBreakBefore = 'always';
            filler.style.height = '1px';
            filler.style.content = '" "';
            filler.innerHTML = '&nbsp;'; // 確保佔位
            
            sec.appendChild(filler);
            
            // 標記一下方便除錯
            console.log(`[AutoPad] Section height ${height}px (~${estimatedPages} pages). Padding added.`);
        } else {
            console.log(`[AutoPad] Section height ${height}px (~${estimatedPages} pages). Even pages, no action.`);
        }
    });
}