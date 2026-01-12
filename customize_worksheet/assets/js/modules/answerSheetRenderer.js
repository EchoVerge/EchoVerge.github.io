/**
 * assets/js/modules/answerSheetRenderer.js
 * V2.8: 恢復座號區外框，並強制所有內容靠左上對齊
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
    // --- 1. 建構座號劃記區 (Grid 左側第一欄) ---
    // 這裡加回了您喜歡的外框樣式
    let seatRows = '';
    for (let i = 0; i < 10; i++) {
        seatRows += `
            <tr>
                <td style="font-weight:bold; width:20px; text-align:right; padding-right:4px;">${i}</td>
                <td style="padding:1px 2px;"><div class="bubble seat-bubble" style="width:20px; height:20px; line-height:18px; font-size:12px;">${i}</div></td>
                <td style="padding:1px 2px;"><div class="bubble seat-bubble" style="width:20px; height:20px; line-height:18px; font-size:12px;">${i}</div></td>
            </tr>
        `;
    }
    
    // 座號表格 HTML (含外框樣式)
    const seatTableHtml = `
        <div style="
            justify-self: start; 
            display: flex; 
            flex-direction: column; 
            align-items: center; 
            border: 2px solid #333; 
            padding: 5px; 
            border-radius: 8px; 
            background: #fff;
        ">
            <div style="font-weight:bold; margin-bottom:5px; border-bottom:1px solid #000; width:100%; text-align:center;">座號</div>
            <table class="ans-table seat-table" style="width: auto;">
                <thead>
                    <tr>
                        <th></th>
                        <th style="font-size:12px; text-align:center;">十</th>
                        <th style="font-size:12px; text-align:center;">個</th>
                    </tr>
                </thead>
                <tbody>
                    ${seatRows}
                </tbody>
            </table>
        </div>
    `;

    // --- 2. 建構題目區 (Grid 右側欄位) ---
    const rowsPerCol = 15; 
    const questionColCount = Math.ceil(qCount / rowsPerCol);
    
    // gridItems 陣列：第一個是座號區
    let gridItems = [seatTableHtml];

    for (let c = 0; c < questionColCount; c++) {
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
        
        // 題號表格 HTML (強制靠左 justify-self: start)
        gridItems.push(`
            <table class="ans-table" style="width: auto; justify-self: start;">
                ${tableRows}
            </table>
        `);
    }

    // --- 3. 設定 Grid 樣式 ---
    // [修正] align-items: start (靠上), justify-items: start (靠左)
    let gridTemplate = `max-content`; 
    for(let i=0; i<questionColCount; i++) {
        gridTemplate += ` 1fr`;
    }

    const gridHtml = `
        <div style="
            display: grid; 
            grid-template-columns: ${gridTemplate}; 
            width: 100%; 
            gap: 15px; 
            align-items: start; 
            justify-items: start; 
            margin-top: 10px;
        ">
            ${gridItems.join('')}
        </div>
    `;

    // --- 4. 組合最終 HTML ---
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