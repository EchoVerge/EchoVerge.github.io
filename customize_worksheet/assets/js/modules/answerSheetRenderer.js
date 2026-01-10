/**
 * assets/js/modules/answerSheetRenderer.js
 * 負責渲染空白答案卡 (供列印用)
 * 升級功能：支援自動判斷是否使用「上下兩張」的省紙模式
 */

export function createAnswerSheet(title, qCount) {
    // 判斷是否使用省紙模式 (閾值：30題)
    const isCompact = qCount <= 30;
    
    // 產生單張答案卡的 HTML
    const singleSheetHtml = generateSingleTable(title, qCount, isCompact);

    if (isCompact) {
        // 省紙模式：上下各一張
        return `
            <style>
                .sheet-page {
                    width: 100%;
                    height: 100vh; /* 佔滿一頁 */
                    box-sizing: border-box;
                    padding: 10px;
                }
                .sheet-half {
                    height: 48vh; /* 上下各佔約一半 */
                    overflow: hidden;
                    box-sizing: border-box;
                    padding-bottom: 10px;
                    display: flex;
                    flex-direction: column;
                }
                .sheet-divider {
                    height: 0;
                    border-bottom: 2px dashed #999; /* 剪裁線 */
                    margin: 1vh 0;
                    position: relative;
                }
                .sheet-divider::after {
                    content: '✂️ 請沿虛線剪開';
                    position: absolute;
                    top: -10px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: white;
                    padding: 0 10px;
                    color: #666;
                    font-size: 12px;
                }
                @media print {
                    @page { margin: 0; size: A4 portrait; }
                    body { margin: 0; }
                }
            </style>
            <div class="sheet-page">
                <div class="sheet-half">${singleSheetHtml}</div>
                <div class="sheet-divider"></div>
                <div class="sheet-half">${singleSheetHtml}</div>
            </div>
        `;
    } else {
        // 完整模式：一張一份
        return `
            <style>
                .sheet-page { padding: 40px; }
                @media print { @page { margin: 20mm; } }
            </style>
            <div class="sheet-page">
                ${singleSheetHtml}
            </div>
        `;
    }
}

function generateSingleTable(title, qCount, isCompact) {
    // 根據題數決定欄數 (每欄最多 10 題)
    const rowsPerCol = 5; 
    const colCount = Math.ceil(qCount / rowsPerCol);
    
    // 建立格子 HTML
    let gridHtml = '<div style="display: flex; flex-wrap: wrap; gap: 20px;">';
    
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
        
        gridHtml += `
            <table class="ans-table">
                ${tableRows}
            </table>
        `;
    }
    gridHtml += '</div>';

    // 樣式
    const fontSize = isCompact ? '12px' : '14px';
    const bubbleSize = isCompact ? '20px' : '24px';
    
    return `
        <style>
            .ans-header { 
                display: flex; justify-content: space-between; border-bottom: 2px solid #000; 
                margin-bottom: 10px; padding-bottom: 5px; font-family: sans-serif;
            }
            .ans-table { border-collapse: collapse; font-size: ${fontSize}; }
            .ans-table td { padding: 4px; text-align: center; }
            .bubble { 
                width: ${bubbleSize}; height: ${bubbleSize}; border: 1px solid #333; border-radius: 50%; 
                display: flex; align-items: center; justify-content: center; color: #ccc; font-size: 0.8em;
            }
            .info-box { border: 1px solid #333; width: 60px; height: 25px; display: inline-block; vertical-align: bottom;}
        </style>
        <div class="ans-header">
            <div style="font-size: 1.2em; font-weight: bold;">${title} 答案卡</div>
            <div>
                班級：<div class="info-box"></div> 
                座號：<div class="info-box"></div> 
                姓名：<div class="info-box" style="width:100px;"></div>
            </div>
        </div>
        ${gridHtml}
    `;
}