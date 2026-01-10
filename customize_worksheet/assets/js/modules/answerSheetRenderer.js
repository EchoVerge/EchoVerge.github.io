/**
 * assets/js/modules/answerSheetRenderer.js
 * V2.4: 修正 Grid 排版垂直對齊問題 (強制靠上)
 */

export function createAnswerSheet(title, qCount) {
    // 判斷省紙模式 (閾值 45 題)
    const isCompact = qCount <= 45;
    
    // 產生單份表格 HTML
    const singleSheetHtml = generateSingleTable(title, qCount, isCompact);

    if (isCompact) {
        // 省紙模式：上下各一張
        return `
            <div class="sheet-page compact">
                <div class="sheet-half">${singleSheetHtml}</div>
                <div class="sheet-divider"></div>
                <div class="sheet-half">${singleSheetHtml}</div>
            </div>
        `;
    } else {
        // 完整模式
        return `
            <div class="sheet-page">
                <div style="padding: 20px 0;">
                    ${singleSheetHtml}
                </div>
            </div>
        `;
    }
}

function generateSingleTable(title, qCount, isCompact) {
    // 每欄 15 題
    const rowsPerCol = 15; 
    const colCount = Math.ceil(qCount / rowsPerCol);
    
    // [修正重點] 加入 align-items: start 與 align-content: start
    // 這會強制表格內容「靠上對齊」，不會被垂直拉伸或分散
    let gridHtml = '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; width: 100%; gap: 10px; align-items: start; align-content: start;">';
    
    for (let c = 0; c < colCount; c++) {
        let tableRows = '';
        for (let r = 0; r < rowsPerCol; r++) {
            const qNum = c * rowsPerCol + r + 1;
            if (qNum > qCount) break;
            
            tableRows += `
                <tr>
                    <td style="font-weight:bold; width:30px;">${qNum}</td>
                    <td><div class="bubble">A</div></td>
                    <td><div class="bubble">B</div></td>
                    <td><div class="bubble">C</div></td>
                    <td><div class="bubble">D</div></td>
                    <td><div class="bubble">E</div></td>
                </tr>
            `;
        }
        
        // 根據欄位索引決定水平對齊
        let alignStyle = 'justify-self: start;'; // 第1欄 (1-15) 靠左
        
        if (c % 3 === 1) {
            alignStyle = 'justify-self: center;'; // 第2欄 (16-30) 置中
        } else if (c % 3 === 2) {
            alignStyle = 'justify-self: end;';    // 第3欄 (31-45) 靠右
        }
        
        gridHtml += `
            <table class="ans-table" style="width: auto; ${alignStyle}">
                ${tableRows}
            </table>
        `;
    }
    gridHtml += '</div>';

    return `
        <div class="ans-header">
            <div class="ans-header-title">${title} 答案卡</div>
            <div class="ans-header-info">
                班級：<div class="info-box"></div> 
                座號：<div class="info-box" style="width:50px;"></div> 
                姓名：<div class="info-box"></div>
            </div>
        </div>
        ${gridHtml}
    `;
}