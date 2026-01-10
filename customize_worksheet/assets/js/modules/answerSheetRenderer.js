/**
 * assets/js/modules/answerSheetRenderer.js
 * V2.3: 實作 3 欄位固定佈局 (左/中/右) 與 15 題分欄
 */

export function createAnswerSheet(title, qCount) {
    // [修改] 為了容納 3 欄 (45題)，將省紙模式閾值提高到 45
    const isCompact = qCount <= 45;
    
    // 產生單份表格 HTML
    const singleSheetHtml = generateSingleTable(title, qCount, isCompact);

    if (isCompact) {
        // 省紙模式：上下各一張 (HTML 結構)
        // 注意：這裡移除了內嵌 <style>，依賴外部 CSS 以保持整潔與列印背景色正常
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
    // [修改] 設定每欄 15 題，這樣 1-45 題剛好佔滿 3 欄
    const rowsPerCol = 15; 
    const colCount = Math.ceil(qCount / rowsPerCol);
    
    // [關鍵修改] 使用 CSS Grid 建立三欄佈局
    // grid-template-columns: 1fr 1fr 1fr (三等分)
    let gridHtml = '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; width: 100%; gap: 10px;">';
    
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
        
        // [關鍵修改] 根據欄位索引決定對齊方式
        let alignStyle = 'justify-self: start;'; // 預設靠左 (第1欄 1-15)
        
        if (c % 3 === 1) {
            alignStyle = 'justify-self: center;'; // 第2欄 (16-30) 置中
        } else if (c % 3 === 2) {
            alignStyle = 'justify-self: end;';    // 第3欄 (31-45) 靠右
        }
        
        // 將 alignStyle 應用到 table 上
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