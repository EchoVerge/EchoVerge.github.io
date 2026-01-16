/**
 * assets/js/modules/debugUtils.js
 * 除錯工具：生成模擬畫卡試卷 (Simulated Answer Sheets)
 * 用途：在 Console 呼叫 window.generateTestSheets() 產生測試樣本
 * * 使用方式範例:
 * window.generateTestSheets(5, true, 100, 0); // 產 5 張，含滿分與0分
 * window.generateTestSheets(10, true, 80, 60); // 產 10 張，分數 60~80 之間
 */
import { state } from './state.js';

export function initDebugUtils() {
    /**
     * 生成模擬試卷
     * @param {number} pages - 產生的份數 (預設 1)
     * @param {boolean} doMerge - 是否合併成一份 (在網頁列印情境下，通常都是一份多頁文件)
     * @param {number} maxScore - 最高分限制 (若為 100，保證第一張滿分)
     * @param {number} minScore - 最低分限制 (若為 0，且張數>1，保證最後一張 0 分)
     */
    window.generateTestSheets = function(pages = 1, doMerge = true, maxScore = 100, minScore = 0) {
        // 檢查題庫
        if (!state.questions || state.questions.length === 0) {
            return console.error("❌ 錯誤：題庫為空，請先在介面上建立題目 (至少一題)。");
        }

        const qCount = state.questions.length;
        console.log(`🛠️ 開始生成 ${pages} 份模擬試卷...`);
        console.log(`ℹ️ 題數: ${qCount}, 分數區間: ${minScore} ~ ${maxScore}`);

        let sheetsHtml = '';

        for (let i = 0; i < pages; i++) {
            // 1. 計算該張試卷的目標分數
            let targetScore;
            
            // 強制邊界條件：確保測試覆蓋率
            if (maxScore === 100 && i === 0) {
                targetScore = 100; // 第一張必定滿分
            } else if (minScore === 0 && i === pages - 1 && pages > 1) {
                targetScore = 0; // 最後一張必定 0 分 (如果有兩張以上)
            } else {
                // 其餘隨機分佈
                targetScore = Math.floor(Math.random() * (maxScore - minScore + 1)) + minScore;
            }

            // 2. 計算需要答對幾題 (四捨五入)
            // 假設每題同分 (簡單模擬)
            const targetCorrectCount = Math.round((targetScore / 100) * qCount);
            
            // 3. 生成作答內容
            const sheetAnswers = generateSimulatedAnswers(state.questions, targetCorrectCount);
            
            // 4. 產生 HTML (座號自動遞增 1, 2, 3...)
            const seatNum = String(i + 1).padStart(2, '0'); // "01", "02"...
            
            // 標題顯示預期分數，方便比對
            const sheetTitle = `[Debug] 模擬卷 #${seatNum} (預期分數: ${targetScore}分 / 答對:${targetCorrectCount}題)`;
            
            sheetsHtml += renderFilledSheet(sheetTitle, qCount, seatNum, sheetAnswers);
            
            // 強制分頁符號 (Page Break)
            if (doMerge && i < pages - 1) {
                sheetsHtml += `<div style="page-break-after: always;"></div>`;
            }
        }

        // 5. 開啟新視窗進行列印
        const printWindow = window.open('', '_blank');
        if (!printWindow) return console.error("❌ 彈跳視窗被阻擋，請允許開啟視窗。");

        // 寫入 HTML
        // 注意 CSS 中的 -webkit-print-color-adjust: exact，確保黑色圓圈會被印出來
        printWindow.document.write(`
            <html>
            <head>
                <title>模擬畫卡生成預覽</title>
                <style>
                    body { margin: 0; padding: 0; background: #eee; font-family: sans-serif; }
                    .sheet-page { 
                        background: white; 
                        margin: 20px auto; 
                        box-shadow: 0 0 10px rgba(0,0,0,0.1); 
                    }
                    @media print {
                        body { background: white; }
                        .sheet-page { margin: 0; box-shadow: none; }
                        @page { size: A4; margin: 0; }
                    }
                    
                    /* === 關鍵樣式：強制列印背景色 === */
                    .omr-mark-top, 
                    .omr-mark-left, 
                    .omr-mark-seat-left, 
                    .omr-mark-seat-top, 
                    .bubble,
                    .fiducial-marker {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        color-adjust: exact !important;
                    }

                    /* 複製 answerSheetRenderer 的基礎樣式 */
                    .omr-mark-top { width: 13px; height: 13px; background: black; }
                    .omr-mark-left { width: 13px; height: 13px; background: black; }
                    .omr-mark-seat-left { width: 10px; height: 10px; background: black; }
                    .omr-mark-seat-top { width: 10px; height: 10px; background: black; }
                    
                    .bubble { 
                        width: 13px; 
                        height: 13px; 
                        border: 1px solid #000; 
                        border-radius: 50%; 
                        box-sizing: border-box;
                    }
                    
                    /* 填塗樣式：黑色實心 */
                    .filled { 
                        background-color: black !important; 
                        border-color: black !important;
                    }
                </style>
            </head>
            <body>
                ${sheetsHtml}
                <script>
                    // 自動觸發列印
                    window.onload = function() { 
                        setTimeout(() => {
                            window.print();
                            // window.close(); // 可選：印完自動關閉
                        }, 800); 
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
        
        console.log(`✅ 已開啟新視窗，請在列印對話框中選擇「另存為 PDF」。`);
    };
}

/**
 * 根據目標答對題數，生成隨機答案
 */
function generateSimulatedAnswers(questions, correctCount) {
    const qCount = questions.length;
    
    // 建立題號索引並洗牌 [0, 1, 2, ... N-1]
    // 這樣我們可以隨機決定「哪幾題要答對」
    const indices = Array.from({length: qCount}, (_, k) => k);
    
    // Fisher-Yates Shuffle
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    const answers = {}; // Map: { questionIndex (0-based): "AB" }

    for (let i = 0; i < qCount; i++) {
        const qIdx = indices[i]; // 實際題目索引
        
        // 取得正確答案並正規化 (去除空白、轉大寫)
        const correctAns = (questions[qIdx].ans || "A").toUpperCase().replace(/\s/g, '');
        
        if (i < correctCount) {
            // 這種情況：要答對
            answers[qIdx] = correctAns;
        } else {
            // 這種情況：要答錯
            // 隨機生成一個「不等於」正確答案的選項組合
            let wrongAns = correctAns;
            
            // 防呆迴圈：確保生成的錯誤答案真的不一樣
            let safety = 0;
            while (wrongAns === correctAns && safety < 50) {
                const isMulti = correctAns.length > 1; 
                wrongAns = generateRandomOption(isMulti); 
                safety++;
            }
            answers[qIdx] = wrongAns;
        }
    }
    return answers;
}

/**
 * 隨機生成選項 (單選或多選)
 */
function generateRandomOption(isMulti = false) {
    const opts = ['A', 'B', 'C', 'D', 'E'];
    
    // 為了模擬真實情況，有時候單選題學生也會多劃 (變成無效作答)，
    // 但這裡我們先簡單處理：單選就生單選，多選就生多選
    
    if (!isMulti) {
        // 單選
        return opts[Math.floor(Math.random() * 5)];
    } else {
        // 多選：隨機產生 2~4 個選項的組合
        const count = Math.floor(Math.random() * 3) + 2; 
        // 洗牌後取前 count 個
        const shuffled = [...opts].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count).sort().join('');
    }
}

/**
 * 渲染填塗好的試卷 (修改自 answerSheetRenderer.js，移除 export 獨立運作)
 */
function renderFilledSheet(title, qCount, seatStr, answersMap) {
    // 參數設定 (需與 answerSheetRenderer 保持一致)
    const PAGE_PADDING = 15;
    const INFO_HEIGHT = 55;
    const OMR_MARK_W = 13; 
    const OMR_MARK_H = 13; 
    const COLUMNS = 4;
    const QUESTIONS_PER_COL = 20; 
    const QUESTIONS_PER_PAGE = QUESTIONS_PER_COL * COLUMNS; 

    // 簡化：debug 模式如果超過一頁，只顯示第一頁 (或依需求擴充)
    // 這裡我們假設大多數測試都在 80 題以內
    const pageTitle = title;
    const pageStart = 1;
    const pageEnd = Math.min(QUESTIONS_PER_PAGE, qCount);

    const columnsHtml = generateFilledColumnsHtml(pageStart, pageEnd, QUESTIONS_PER_COL, COLUMNS, OMR_MARK_W, OMR_MARK_H, answersMap);
    const topMarksHtml = generateTopTimingMarks(COLUMNS, OMR_MARK_W, OMR_MARK_H, pageStart, pageEnd, QUESTIONS_PER_COL);

    // 解析座號 (例如 "05" -> 十位0, 個位5)
    const seatTen = parseInt(seatStr[0]) || 0;
    const seatOne = parseInt(seatStr[1]) || 0;

    return `
        <div class="sheet-page" style="position: relative; width: 210mm; height: 297mm; padding: ${PAGE_PADDING}mm; box-sizing: border-box; margin: 0 auto; background: white; overflow: hidden; font-family: 'Arial', sans-serif;">
            ${createMarker(15, 15)} ${createMarker(15, null, 15)} ${createMarker(null, 15, null, 15)} ${createMarker(null, null, 15, 15)} 

            <div style="text-align: center; margin-bottom: 5px; border-bottom: 2px solid #000; padding-bottom: 2px;">
                <h1 style="margin: 0; font-size: 18px;">${pageTitle}</h1>
            </div>

            <div style="display: flex; margin-bottom: 5px; height: ${INFO_HEIGHT}mm; width: 100%; align-items: stretch;">
                
                <div style="width: 15%; border: 2px solid #000; padding: 2px; border-radius: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                    <div style="font-size:11px; font-weight:bold; margin-bottom: 2px; text-align: center; width: 100%; border-bottom: 1px solid #ccc;">座號</div>
                    <div style="display: flex; flex-direction: row; gap: 2px; justify-content: center;">
                        ${generateSeatMatrix(seatTen, seatOne)}
                    </div>
                </div>

                <div style="width: 5%;"></div>

                <div style="width: 20%; border: 2px solid #000; padding: 8px; border-radius: 4px; display: flex; flex-direction: column; justify-content: space-evenly;">
                    <div style="border-bottom:1px solid #000; padding-bottom: 2px; font-size: 13px; font-weight: bold;">班級:</div>
                    <div style="border-bottom:1px solid #000; padding-bottom: 2px; font-size: 13px; font-weight: bold;">姓名: <span style="font-weight:normal">測試生${seatStr}</span></div>
                    <div style="border-bottom:1px solid #000; padding-bottom: 2px; font-size: 13px; font-weight: bold;">座號: <span style="font-weight:normal">${seatStr}</span></div>
                </div>

                <div style="width: 5%;"></div>

                <div style="flex: 1; border: 2px solid #000; padding: 8px; border-radius: 4px; display: flex; flex-direction: column; justify-content: center; align-items: center; background: #f9f9f9;">
                    <div style="font-size: 1.2em; font-weight: bold; color: #555;">[DEBUG 模式]</div>
                    <div style="color: #666; font-size: 0.9em; margin-top: 5px;">本試卷由系統自動生成</div>
                    <div style="color: #666; font-size: 0.9em;">黑色圓圈代表模擬作答痕跡</div>
                </div>
            </div>

            <div style="display: flex; margin-bottom: 2px;">${topMarksHtml}</div>
            <div style="position: relative; width: 100%;">${columnsHtml}</div>
        </div>
    `;
}

// 輔助渲染函式 (簡化版，含樣式)
function createMarker(top, left, right, bottom) {
    let style = `position: absolute; width: 20px; height: 20px; background: black; z-index: 999;`;
    if (top !== null) style += `top: ${top}px; `;
    if (left !== null) style += `left: ${left}px; `;
    if (right !== null) style += `right: ${right}px; `;
    if (bottom !== null) style += `bottom: ${bottom}px; `;
    return `<div class="fiducial-marker" style="${style}"></div>`;
}

function generateTopTimingMarks(cols, w, h, pageStart, pageEnd, perCol) {
    let html = '<div style="width: 13px; margin-right: 2px; flex-shrink: 0;"></div><div style="flex: 1; display: flex;">';
    for (let c = 0; c < cols; c++) {
        const active = (pageStart + c * perCol) <= pageEnd;
        let marks = '';
        for (let i = 0; i < 5; i++) marks += `<div style="width: 13px; display: flex; justify-content: center;"><div class="omr-mark-top" style="width:${w}px; height:${h}px; background:${active?'black':'transparent'};"></div></div>`;
        html += `<div style="flex: 1; padding: 0 3px;"><div style="display: flex; align-items: center; padding: 1px 3px;"><div style="width: 18px; margin-right: 2px;"></div><div style="flex: 1; display: flex; justify-content: space-between; gap: 1px; padding-left: 1px;">${marks}</div></div></div>`;
    }
    return html + '</div>';
}

function generateSeatMatrix(fillTen, fillOne) {
    const createCol = (label, fillTarget) => {
        let h = `<div style="height: 14px; margin-bottom: 1px; display:flex; justify-content:center; align-items:center;"><div style="font-size:9px; font-weight:bold;">${label}</div></div>`;
        h += `<div style="height: 14px; margin-bottom: 1px; display:flex; justify-content:center; align-items:center;"><div class="omr-mark-seat-top"></div></div>`;
        for(let i=0; i<=9; i++) {
            // 判斷是否填塗
            const isFilled = (i === fillTarget);
            h += `<div style="height: 14px; margin-bottom: 1px; display:flex; justify-content:center; align-items:center;"><div class="bubble ${isFilled?'filled':''}"></div></div>`;
        }
        return `<div style="display: flex; flex-direction: column;">${h}</div>`;
    };
    
    // 簡化的左側與數字欄
    let left = '', nums = '';
    for(let i=0; i<12; i++) {
        if(i<2) { left+='<div style="height:15px;"></div>'; nums+='<div style="height:15px;"></div>'; continue; }
        left += `<div style="height:14px; margin-bottom:1px; display:flex; justify-content:center; align-items:center;"><div class="omr-mark-seat-left"></div></div>`;
        nums += `<div style="height:14px; margin-bottom:1px; display:flex; justify-content:flex-end; align-items:center; padding-right:2px;"><div style="font-size:8px;">${i-2}</div></div>`;
    }

    return `<div style="display: flex; flex-direction: column;">${left}</div><div style="display: flex; flex-direction: column;">${nums}</div>` + createCol('十', fillTen) + createCol('個', fillOne);
}

function generateFilledColumnsHtml(startNo, endNo, perCol, colCount, markW, markH, answersMap) {
    let rowsHtml = '';
    for (let r = 0; r < perCol; r++) {
        let cells = '';
        let rowHasQ = false;
        for (let c = 0; c < colCount; c++) {
            const qNum = startNo + (c * perCol) + r;
            if (qNum <= endNo) {
                // 取得該題答案 (例如 "AC")
                // 注意: answersMap 的 key 是 0-based index，所以 qNum-1
                const ansStr = answersMap[qNum-1] || ""; 
                cells += `<div style="flex: 1; padding: 0 3px;">${createFilledQuestionCell(qNum, ansStr)}</div>`;
                rowHasQ = true;
            } else {
                cells += `<div style="flex: 1; padding: 0 3px;"></div>`;
            }
        }
        
        // 側邊定位點
        rowsHtml += `
            <div style="display: flex; align-items: center; margin-bottom: 3px;">
                <div style="display: flex; flex-direction: column; align-items: center; margin-right: 2px; width: 13px; align-self: center;">
                    <div style="height: 9px; width: 100%;"></div>
                    <div class="omr-mark-left" style="width: ${markW}px; height: ${markH}px; background: ${rowHasQ?'black':'transparent'};"></div>
                </div>
                <div style="flex: 1; display: flex;">${cells}</div>
            </div>`;
    }
    return `<div style="display: flex; flex-direction: column;">${rowsHtml}</div>`;
}

function createFilledQuestionCell(qNum, ansStr) {
    const opts = ['A','B','C','D','E'].map(opt => {
        // 判斷是否填塗
        const isFilled = ansStr.includes(opt);
        return `
        <div style="display: flex; flex-direction: column; align-items: center; width: 13px;">
            <div style="font-size: 8px; color: #666; line-height: 1;">${opt}</div>
            <div class="bubble ${isFilled?'filled':''}" style="margin-top: 1px;"></div>
        </div>`;
    }).join('');
    
    return `<div style="display: flex; align-items: center; border: 1px solid #000; padding: 1px 3px; border-radius: 3px; height: 26px; background: #fff;">
        <div style="width: 18px; font-weight: bold; font-size: 11px; border-right: 1px solid #ccc; margin-right: 2px; text-align: center;">${qNum}</div>
        <div style="display: flex; justify-content: space-between; flex: 1; gap: 1px;">${opts}</div>
    </div>`;
}