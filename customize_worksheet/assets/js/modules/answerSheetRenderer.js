/**
 * assets/js/modules/answerSheetRenderer.js
 * V11.2: 座號區對齊修復版 (Seat Alignment Fix)
 * * 修正: 左側定位點的頂部佔位區補上 margin-bottom: 1px，解決垂直錯位問題
 * * 功能: 保持列印顯色與版面比例
 */

export function createAnswerSheet(title, qCount) {
    const PAGE_PADDING = 15;
    const INFO_HEIGHT = 55;
    
    // 主題目的定位點尺寸 (13px)
    const OMR_MARK_W = 13; 
    const OMR_MARK_H = 13; 

    // 排版設定
    const COLUMNS = 4;
    const QUESTIONS_PER_COL = 20; 
    const QUESTIONS_PER_PAGE = QUESTIONS_PER_COL * COLUMNS; 

    const totalPages = Math.ceil(qCount / QUESTIONS_PER_PAGE);

    if (totalPages > 1) {
        if (!confirm(`將產生 ${totalPages} 頁答案卡，確定嗎？`)) return '';
    }

    let fullHtml = '';

    for (let page = 1; page <= totalPages; page++) {
        const isFirstPage = (page === 1);
        const pageTitle = isFirstPage ? title : `${title} - p.${page}`;
        const pageStart = (page - 1) * QUESTIONS_PER_PAGE + 1;
        const pageEnd = Math.min(page * QUESTIONS_PER_PAGE, qCount);

        const columnsHtml = generateColumnsHtml(pageStart, pageEnd, QUESTIONS_PER_COL, COLUMNS, OMR_MARK_W, OMR_MARK_H);
        const topMarksHtml = generateTopTimingMarks(COLUMNS, OMR_MARK_W, OMR_MARK_H, pageStart, pageEnd, QUESTIONS_PER_COL);

        fullHtml += `
            <div class="sheet-page" style="
                position: relative; 
                width: 210mm; 
                height: 297mm; 
                padding: ${PAGE_PADDING}mm; 
                box-sizing: border-box; 
                margin: 0 auto 20px auto; 
                background: white; 
                overflow: hidden;
                font-family: 'Arial', sans-serif;
            ">
                ${createMarker(15, 15)} 
                ${createMarker(15, null, 15)} 
                ${createMarker(null, 15, null, 15)} 
                ${createMarker(null, null, 15, 15)} 

                <div style="text-align: center; margin-bottom: 5px; border-bottom: 2px solid #000; padding-bottom: 2px;">
                    <h1 style="margin: 0; font-size: 18px;">${pageTitle}</h1>
                </div>

                <div style="display: flex; margin-bottom: 5px; height: ${INFO_HEIGHT}mm; width: 100%; align-items: stretch;">
                    
                    <div style="width: 15%; border: 2px solid #000; padding: 2px; border-radius: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <div style="font-size:11px; font-weight:bold; margin-bottom: 2px; text-align: center; width: 100%; border-bottom: 1px solid #ccc;">座號</div>
                        <div style="display: flex; flex-direction: row; gap: 2px; justify-content: center;">
                            ${generateSeatMatrix()}
                        </div>
                    </div>

                    <div style="width: 5%;"></div>

                    <div style="width: 20%; border: 2px solid #000; padding: 8px; border-radius: 4px; display: flex; flex-direction: column; justify-content: space-evenly;">
                        <div style="border-bottom:1px solid #000; padding-bottom: 2px; font-size: 13px; font-weight: bold;">班級:</div>
                        <div style="border-bottom:1px solid #000; padding-bottom: 2px; font-size: 13px; font-weight: bold;">姓名:</div>
                        <div style="border-bottom:1px solid #000; padding-bottom: 2px; font-size: 13px; font-weight: bold;">座號:</div>
                    </div>

                    <div style="width: 5%;"></div>

                    <div style="flex: 1; border: 2px solid #000; padding: 8px; border-radius: 4px; display: flex; flex-direction: column;">
                        <div style="font-size:12px; font-weight:bold; border-bottom: 1px solid #000; margin-bottom: 5px; text-align: center;">畫卡說明</div>
                        
                        <div style="display: flex; justify-content: space-around; margin-bottom: 5px;">
                            <div style="font-size: 11px;">
                                <span style="color: green; font-weight: bold;">✔ 正確</span> 
                                <span style="display:inline-block; width:10px; height:10px; background:black; border-radius:50%; vertical-align:middle;"></span>
                            </div>
                            <div style="font-size: 11px;">
                                <span style="color: red; font-weight: bold;">✘ 錯誤</span> 
                                <span style="display:inline-block; width:10px; height:10px; border:1px solid black; border-radius:50%; vertical-align:middle; position:relative;">
                                    <span style="position:absolute; top:-2px; left:2px; font-size:10px;">✕</span>
                                </span>
                            </div>
                        </div>

                        <div style="font-size:10px; line-height: 1.6; color: #444;">
                            • 請使用 2B 鉛筆將對應的圓圈塗黑塗滿。<br>
                            • 修改時請使用橡皮擦擦拭乾淨，勿留痕跡。<br>
                            • 請保持答案卡清潔，切勿折疊、汙損。<br>
                            • 若違反劃記規則導致讀卡錯誤，後果由考生自行承擔。
                        </div>
                    </div>
                </div>

                <div style="display: flex; margin-bottom: 2px;">
                    ${topMarksHtml}
                </div>

                <div style="position: relative; width: 100%;">
                    ${columnsHtml}
                </div>
            </div>
        `;
    }

    return fullHtml;
}

function createMarker(top, left, right, bottom) {
    let style = `position: absolute; width: 20px; height: 20px; background: black; z-index: 999; -webkit-print-color-adjust: exact; print-color-adjust: exact;`;
    if (top !== null) style += `top: ${top}px; `;
    if (left !== null) style += `left: ${left}px; `;
    if (right !== null) style += `right: ${right}px; `;
    if (bottom !== null) style += `bottom: ${bottom}px; `;
    return `<div class="fiducial-marker" style="${style}"></div>`;
}

function generateTopTimingMarks(cols, w, h, pageStart, pageEnd, perCol) {
    let leftPlaceholder = '<div style="width: 13px; margin-right: 2px; flex-shrink: 0;"></div>';
    
    let columnsHtml = '';
    for (let c = 0; c < cols; c++) {
        const colStartQ = pageStart + (c * perCol);
        const isColumnActive = colStartQ <= pageEnd;
        const markColor = isColumnActive ? 'black' : 'transparent';

        let marks = '';
        for (let i = 0; i < 5; i++) {
            marks += `
                <div style="width: 13px; display: flex; justify-content: center;">
                    <div class="omr-mark-top" style="width: ${w}px; height: ${h}px; background: ${markColor}; -webkit-print-color-adjust: exact; print-color-adjust: exact;"></div>
                </div>
            `;
        }
        
        columnsHtml += `
            <div style="flex: 1; padding: 0 3px;">
                <div style="display: flex; align-items: center; border: 1px solid transparent; padding: 1px 3px;">
                    <div style="width: 18px; margin-right: 2px; border-right: 1px solid transparent;"></div>
                    <div style="flex: 1; display: flex; justify-content: space-between; gap: 1px; padding-left: 1px;">
                        ${marks}
                    </div>
                </div>
            </div>
        `;
    }
    
    return `${leftPlaceholder}<div style="flex: 1; display: flex;">${columnsHtml}</div>`;
}

// [修正] 座號矩陣 - 補上 margin-bottom 確保對齊
function generateSeatMatrix() {
    const MARK_SIZE = 10; 
    const ROW_HEIGHT = 14; 

    // 左側定位點欄 (佔位區也要加 margin-bottom: 1px)
    let colLeft = `
        <div style="height: ${ROW_HEIGHT}px; margin-bottom: 1px;"></div>
        <div style="height: ${ROW_HEIGHT}px; margin-bottom: 1px;"></div>
    `;
    for(let i=0; i<=9; i++) {
        colLeft += `
            <div style="height: ${ROW_HEIGHT}px; display: flex; align-items: center; justify-content: center; margin-bottom: 1px;">
                <div class="omr-mark-seat-left" style="width: ${MARK_SIZE}px; height: ${MARK_SIZE}px; background: black; -webkit-print-color-adjust: exact; print-color-adjust: exact;"></div>
            </div>
        `;
    }
    
    // 數字標籤欄 (佔位區也要加 margin-bottom: 1px)
    let colNums = `
        <div style="height: ${ROW_HEIGHT}px; margin-bottom: 1px;"></div>
        <div style="height: ${ROW_HEIGHT}px; margin-bottom: 1px;"></div>
    `;
    for(let i=0; i<=9; i++) {
        colNums += `
            <div style="height: ${ROW_HEIGHT}px; display: flex; align-items: center; justify-content: flex-end; margin-bottom: 1px; padding-right: 2px;">
                <div style="font-size: 8px;">${i}</div>
            </div>
        `;
    }

    const createDataCol = (label) => {
        let html = '';
        // 上方定位點 (Row 1)
        html += `
            <div style="height: ${ROW_HEIGHT}px; display: flex; align-items: center; justify-content: center; margin-bottom: 1px;">
                <div class="omr-mark-seat-top" style="width: ${MARK_SIZE}px; height: ${MARK_SIZE}px; background: black; -webkit-print-color-adjust: exact; print-color-adjust: exact;"></div>
            </div>
        `;
        // 標題文字 (Row 2)
        html += `
            <div style="height: ${ROW_HEIGHT}px; display: flex; align-items: center; justify-content: center; margin-bottom: 1px;">
                <div style="font-size: 9px; font-weight: bold;">${label}</div>
            </div>
        `;
        // 氣泡 (Row 3 ~ 12)
        for(let i=0; i<=9; i++) {
            html += `
                <div style="height: ${ROW_HEIGHT}px; display: flex; align-items: center; justify-content: center; margin-bottom: 1px;">
                    <div class="bubble" style="width: 10px; height: 10px; border: 1px solid #000; border-radius: 50%;"></div>
                </div>
            `;
        }
        return `<div style="display: flex; flex-direction: column;">${html}</div>`;
    }

    return `
        <div style="display: flex; flex-direction: row; gap: 2px;">
            <div style="display: flex; flex-direction: column;">${colLeft}</div>
            <div style="display: flex; flex-direction: column;">${colNums}</div>
            ${createDataCol('十')}
            ${createDataCol('個')}
        </div>
    `;
}

function generateColumnsHtml(startNo, endNo, perCol, colCount, markW, markH) {
    let rowsHtml = '';
    
    for (let r = 0; r < perCol; r++) {
        let cells = '';
        let rowHasQuestion = false; 

        for (let c = 0; c < colCount; c++) {
            const qNum = startNo + (c * perCol) + r;
            if (qNum <= endNo) {
                cells += `<div style="flex: 1; padding: 0 3px;">${createQuestionCell(qNum)}</div>`;
                rowHasQuestion = true; 
            } else {
                cells += `<div style="flex: 1; padding: 0 3px;"></div>`;
            }
        }

        const markColor = rowHasQuestion ? 'black' : 'transparent';

        const rowMarker = `
            <div style="display: flex; flex-direction: column; align-items: center; margin-right: 2px; width: 13px; align-self: center;">
                <div style="height: 9px; width: 100%;"></div>
                <div class="omr-mark-left" style="width: ${markW}px; height: ${markH}px; background: ${markColor}; -webkit-print-color-adjust: exact; print-color-adjust: exact;"></div>
            </div>
        `;

        rowsHtml += `
            <div style="display: flex; align-items: center; margin-bottom: 3px;">
                ${rowMarker}
                <div style="flex: 1; display: flex;">
                    ${cells}
                </div>
            </div>
        `;
    }
    return `<div style="display: flex; flex-direction: column;">${rowsHtml}</div>`;
}

function createQuestionCell(qNum) {
    const options = ['A', 'B', 'C', 'D', 'E'].map(opt => `
        <div style="display: flex; flex-direction: column; align-items: center; width: 13px;">
            <div style="font-size: 8px; color: #666; line-height: 1;">${opt}</div>
            <div class="bubble" style="width: 13px; height: 13px; border: 1px solid #000; border-radius: 50%; margin-top: 1px;"></div>
        </div>
    `).join('');

    return `
        <div style="display: flex; align-items: center; border: 1px solid #000; padding: 1px 3px; border-radius: 3px; height: 26px; background: #fff;">
            <div style="width: 18px; font-weight: bold; font-size: 11px; border-right: 1px solid #ccc; margin-right: 2px; text-align: center;">${qNum}</div>
            <div style="display: flex; justify-content: space-between; flex: 1; gap: 1px;">
                ${options}
            </div>
        </div>
    `;
}